"use client";

import { useSyncExternalStore } from "react";
import type {
  IntakeMessage,
  Invoice,
  Quote,
  Shipment,
  ShipmentDocument,
  ShipmentEvent,
  ShiftLogEntry,
  ShiftReport,
  TrackingEvent,
} from "./types";
import {
  CUSTOMERS,
  DOCUMENTS,
  INTAKE_MESSAGES,
  INVOICES,
  SHIPMENTS,
  TRACKING_EVENTS,
  seedAgentHistory,
} from "./seed";
import { emit, eventHistory, subscribe as subscribeEvents } from "./events";
import { advance as advanceState } from "./state-machine";
import { extract } from "./intake";
import { generateQuote, recordVerdict } from "./quote-engine";
import { laneFor, learn, predictEta } from "./trade-graph";
import { generateDocuments } from "./documents";
import { issueInvoice } from "./finance";
import { agentActions, autonomyGrants, propose } from "./agent";

/**
 * The world: a single in-memory runtime holding every object in the system.
 * All UI is a subscription to this store; all mutation goes through the
 * domain functions so every change emits events.
 */

interface World {
  shipments: Shipment[];
  intake: IntakeMessage[];
  quotes: Quote[];
  documents: ShipmentDocument[];
  invoices: Invoice[];
  tracking: TrackingEvent[];
  /** Success metric: human work automated, cumulative hours. */
  hoursEliminated: number;
  lastShift?: ShiftReport;
  booted: boolean;
}

const world: World = {
  shipments: SHIPMENTS,
  intake: INTAKE_MESSAGES,
  quotes: [],
  documents: DOCUMENTS,
  invoices: INVOICES,
  tracking: TRACKING_EVENTS,
  hoursEliminated: 1_247, // six months of shifts before this session
  booted: false,
};

let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

subscribeEvents(() => notify());

export function bootWorld(): void {
  if (world.booted) return;
  world.booted = true;
  seedAgentHistory();

  // Pre-generate the pending quote for the shipment sitting in QUOTE state.
  const pending = world.shipments.find((s) => s.state === "QUOTE");
  if (pending) {
    const lane = laneFor(pending.origin, pending.destination);
    const customer = CUSTOMERS.find((c) => c.id === pending.customerId);
    world.quotes.push(
      generateQuote({
        shipmentId: pending.id,
        lane: lane?.lane ?? `${pending.origin} → ${pending.destination}`,
        cargo: pending.cargo,
        customer,
        laneSignal: lane
          ? { congestionIndex: lane.congestionIndex, rateTrendPct: lane.rateTrendPct }
          : undefined,
      })
    );
  }
  startTicker();
}

// ─── Live simulation ticker ──────────────────────────────────────────────────
// Emits ambient telemetry so the terminal breathes. Each tick is a plausible
// event drawn from the active fleet.

let tickerStarted = false;
let tick = 0;

function startTicker(): void {
  if (tickerStarted || typeof window === "undefined") return;
  tickerStarted = true;
  setInterval(() => {
    tick++;
    const inFlight = world.shipments.filter(
      (s) => s.state === "TRANSIT" || s.state === "CUSTOMS"
    );
    if (inFlight.length === 0) return;
    const s = inFlight[tick % inFlight.length];
    const pool: [string, ShipmentEvent["severity"]][] = [
      [`Position update received for ${s.vesselOrFlight ?? s.id}`, "INFO"],
      [`ETA model re-scored ${s.id}: delay risk ${((s.eta?.delayRisk ?? 0.1) * 100).toFixed(0)}%`, "INFO"],
      [`Carrier EDI heartbeat OK — ${s.carrier ?? "carrier"}`, "INFO"],
      [`Rate index refreshed on ${s.origin.slice(0, 5)} → ${s.destination.slice(0, 5)}`, "INFO"],
    ];
    const [summary, severity] = pool[tick % pool.length];
    emit("tracking.updated", s.id, summary, severity);
  }, 6500);
}

// ─── React subscription ──────────────────────────────────────────────────────

export function useWorld(): { world: World; version: number } {
  const v = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      bootWorld();
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0
  );
  return { world, version: v };
}

export function customers() {
  return CUSTOMERS;
}

export function customerById(id: string) {
  return CUSTOMERS.find((c) => c.id === id);
}

export function shipmentById(id: string): Shipment | undefined {
  return world.shipments.find((s) => s.id === id);
}

export function recentEvents(limit = 40): ShipmentEvent[] {
  return [...eventHistory()].reverse().slice(0, limit);
}

// ─── Commands (all mutation flows through domain functions) ─────────────────

let shipmentSeq = 848;

/** AI intake: parse a raw message into structured fields. */
export function parseIntake(messageId: string): void {
  const msg = world.intake.find((m) => m.id === messageId);
  if (!msg || msg.status !== "NEW") return;
  msg.extraction = extract(msg);
  msg.status = "PARSED";
  notify();
}

/** Convert a parsed intake message into a live shipment in INQUIRY state. */
export function convertIntake(messageId: string): Shipment | undefined {
  const msg = world.intake.find((m) => m.id === messageId);
  if (!msg?.extraction) return undefined;
  const e = msg.extraction;
  const customer =
    CUSTOMERS.find((c) => c.name === e.customerName.value) ?? CUSTOMERS[0];
  const shipment: Shipment = {
    id: `ENG-2026-0${++shipmentSeq}`,
    ref: `${customer.name.split(" ")[0]} · ${e.commodity.value ?? "general cargo"} · ${(e.mode.value ?? "ocean").toLowerCase()}`,
    state: "INQUIRY",
    customerId: customer.id,
    origin: e.origin.value ?? "—",
    destination: e.destination.value ?? "—",
    mode: e.mode.value ?? "OCEAN",
    incoterm: e.incoterm.value ?? "CIF",
    cargo: {
      commodity: e.commodity.value ?? "general cargo",
      weightKg: e.weightKg.value ?? 0,
      volumeCbm: e.volumeCbm.value ?? 0,
      pieces: e.pieces.value ?? 1,
      hazardous: false,
      value: 0,
    },
    neededBy: undefined,
    createdAt: new Date().toISOString(),
    stateEnteredAt: new Date().toISOString(),
    revenue: 0,
    cost: 0,
    hasOpenException: false,
    sourceIntakeId: msg.id,
  };
  world.shipments.unshift(shipment);
  msg.status = "CONVERTED";
  msg.shipmentId = shipment.id;
  emit(
    "shipment.created",
    shipment.id,
    `Shipment created from ${msg.channel.toLowerCase()} intake (${(e.overallConfidence * 100).toFixed(0)}% extraction confidence)`,
    "SUCCESS"
  );
  return shipment;
}

/** Run the quote engine for a shipment and advance it INQUIRY → QUOTE. */
export function quoteShipment(shipmentId: string): Quote | undefined {
  const s = shipmentById(shipmentId);
  if (!s) return undefined;
  const lane = laneFor(s.origin, s.destination);
  const customer = customerById(s.customerId);
  const quote = generateQuote({
    shipmentId: s.id,
    lane: lane?.lane ?? `${s.origin} → ${s.destination}`,
    cargo: s.cargo,
    customer,
    laneSignal: lane
      ? { congestionIndex: lane.congestionIndex, rateTrendPct: lane.rateTrendPct }
      : undefined,
  });
  world.quotes.unshift(quote);
  if (s.state === "INQUIRY") advanceState(s);
  const best = quote.options[0];
  if (best) {
    propose({
      shipment: s,
      taskType: "QUOTE",
      summary: `Quote ${quote.id} generated and sent — best ${best.mode.toLowerCase()} $${best.sellTotal.toLocaleString()}`,
      detail: `${quote.options.length} option(s), margin ${best.marginPct}%, win probability ${(best.winProbability * 100).toFixed(0)}%. Valid 48h.`,
      confidence: 0.96,
      valueAtStake: best.sellTotal,
    });
  }
  notify();
  return quote;
}

/** Customer accepts an option: book it, run the money, generate the paper. */
export function acceptQuote(quoteId: string, optionId: string): void {
  const quote = world.quotes.find((q) => q.id === quoteId);
  const s = quote && shipmentById(quote.shipmentId);
  if (!quote || !s) return;
  const option = quote.options.find((o) => o.id === optionId);
  if (!option) return;

  quote.selectedOptionId = optionId;
  quote.verdict = "WON";
  const lane = laneFor(s.origin, s.destination);
  recordVerdict(lane?.lane ?? "", option.marginPct, "WON");

  s.mode = option.mode;
  s.carrier = option.carrier;
  s.revenue = option.sellTotal;
  s.cost = option.costTotal;
  emit("quote.accepted", s.id, `Customer accepted ${option.mode.toLowerCase()} option — $${option.sellTotal.toLocaleString()}`, "SUCCESS");

  if (s.state === "QUOTE") advanceState(s); // → BOOKING
  emit("booking.confirmed", s.id, `Booking confirmed with ${option.carrier}, transit ${option.transitDays}d`, "SUCCESS");

  if (s.state === "BOOKING") advanceState(s); // → DOCUMENTATION
  world.documents.push(...generateDocuments(s));

  const customer = customerById(s.customerId);
  if (customer) world.invoices.unshift(issueInvoice(s, customer));
  if (s.neededBy) s.eta = predictEta(s, s.neededBy);
  notify();
}

/** Manually advance a shipment one lifecycle state. */
export function advanceShipment(shipmentId: string): void {
  const s = shipmentById(shipmentId);
  if (!s) return;
  const to = advanceState(s);
  if (to === "SETTLEMENT") {
    learn(s, 7);
  }
  if (to === "CUSTOMS") {
    emit("customs.cleared", s.id, "Customs entry pre-filed from document set", "INFO");
  }
  notify();
}

export function resolveException(shipmentId: string): void {
  const s = shipmentById(shipmentId);
  if (!s?.hasOpenException) return;
  s.hasOpenException = false;
  emit("tracking.updated", s.id, "Exception resolved — recovery plan executed", "SUCCESS");
  notify();
}

export function forceNotify(): void {
  notify();
}

// ─── The night shift ─────────────────────────────────────────────────────────
// "The customer should sleep while the platform wins business, books
// shipments, prepares documents, monitors exceptions and prepares decisions
// for approval." This is that sentence, executable: an 8-hour autonomous run
// composed entirely of the same domain commands a human would click.

const HOURS_SAVED = {
  INTAKE_PARSE: 0.3,
  QUOTE: 0.8,
  BOOKING: 0.6,
  DOCUMENTS: 1.5,
  CUSTOMER_UPDATE: 0.2,
  COLLECTIONS: 0.4,
} as const;

export function runNightShift(): ShiftReport {
  bootWorld();
  const windowHours = 8;
  const shiftStart = Date.now() - windowHours * 3600_000;
  let step = 0;
  const stamp = () => new Date(shiftStart + ++step * 19 * 60_000).toISOString();

  const log: ShiftLogEntry[] = [];
  const report: ShiftReport = {
    ranAt: new Date().toISOString(),
    windowHours,
    intakeParsed: 0,
    quotesSent: 0,
    bookingsMade: 0,
    revenueBooked: 0,
    docsGenerated: 0,
    updatesSent: 0,
    queuedForMorning: 0,
    hoursEliminated: 0,
    log,
  };
  const auto = (text: string) => log.push({ at: stamp(), text, kind: "AUTO" });
  const queued = (text: string) => log.push({ at: stamp(), text, kind: "HUMAN_QUEUED" });

  // Snapshot before the shift creates new objects.
  const docsStateAtStart = world.shipments.filter((s) => s.state === "DOCUMENTATION");

  // 1. Inbox: parse every raw message; convert and quote the confident ones.
  for (const msg of world.intake.filter((m) => m.status === "NEW")) {
    parseIntake(msg.id);
    report.intakeParsed++;
    report.hoursEliminated += HOURS_SAVED.INTAKE_PARSE;
    const confidence = msg.extraction?.overallConfidence ?? 0;
    if (confidence >= 0.7) {
      const shipment = convertIntake(msg.id);
      auto(`INTAKE — ${msg.channel.toLowerCase()} from ${msg.from} parsed at ${(confidence * 100).toFixed(0)}% → ${shipment?.id}`);
      if (shipment) {
        const quote = quoteShipment(shipment.id);
        if (quote) {
          report.quotesSent++;
          report.hoursEliminated += HOURS_SAVED.QUOTE;
          const best = quote.options[0];
          auto(`QUOTE — ${quote.id} priced and sent: best ${best?.mode.toLowerCase()} $${best?.sellTotal.toLocaleString()}, P(win) ${((best?.winProbability ?? 0) * 100).toFixed(0)}%`);
        }
      }
    } else {
      queued(`INTAKE — ${msg.channel.toLowerCase()} from ${msg.from} parsed at ${(confidence * 100).toFixed(0)}% — below floor, held for human review`);
      report.queuedForMorning++;
    }
  }

  // 2. Pending quotes: simulate the customer's overnight tap. Book inside the
  //    grant; hold above the ceiling — the 02:31 escalation from the chart.
  const bookingGrant = autonomyGrants().find((g) => g.taskType === "BOOKING")!;
  for (const quote of [...world.quotes].filter((q) => q.verdict === "PENDING")) {
    const alreadyHeld = agentActions().some(
      (a) => a.shipmentId === quote.shipmentId && a.taskType === "BOOKING" &&
        (a.status === "AWAITING_APPROVAL" || a.status === "ESCALATED")
    );
    if (alreadyHeld) continue;
    const best = [...quote.options].sort(
      (a, b) => b.winProbability - a.winProbability || a.sellTotal - b.sellTotal
    )[0];
    if (!best || best.winProbability < 0.5) continue;
    const shipment = shipmentById(quote.shipmentId);
    if (!shipment) continue;

    if (bookingGrant.level >= 4 && best.sellTotal <= bookingGrant.valueCeiling) {
      acceptQuote(quote.id, best.id);
      report.bookingsMade++;
      report.revenueBooked += best.sellTotal;
      report.docsGenerated += world.documents.filter((d) => d.shipmentId === shipment.id && d.autoGenerated).length;
      report.hoursEliminated += HOURS_SAVED.BOOKING + HOURS_SAVED.DOCUMENTS;
      auto(`BOOKING — ${shipment.id} accepted ${best.mode.toLowerCase()} $${best.sellTotal.toLocaleString()}; booked with ${best.carrier}, documents generated, invoice issued`);
    } else {
      propose({
        shipment,
        taskType: "BOOKING",
        summary: `Booking $${best.sellTotal.toLocaleString()} held for morning approval`,
        detail: `Customer accepted the ${best.mode.toLowerCase()} option overnight. ${bookingGrant.level >= 4 ? `Value exceeds notch-4 ceiling $${bookingGrant.valueCeiling.toLocaleString()}` : `Booking autonomy at notch ${bookingGrant.level}`} — one-tap request queued for 07:00 with full context.`,
        confidence: 0.94,
        valueAtStake: best.sellTotal,
      });
      report.queuedForMorning++;
      queued(`BOOKING — ${shipment.id} $${best.sellTotal.toLocaleString()} accepted by customer; HELD for one-tap approval at 07:00`);
    }
  }

  // 3. Documentation: advance clean document sets into transit.
  for (const s of docsStateAtStart) {
    const hasErrors = world.documents.some(
      (d) => d.shipmentId === s.id && d.issues.some((i) => i.severity === "ERROR")
    );
    if (hasErrors) {
      queued(`DOCUMENTS — ${s.id} still blocked by a validation error; shipper chased, human review queued`);
      report.queuedForMorning++;
      continue;
    }
    advanceShipment(s.id);
    report.hoursEliminated += HOURS_SAVED.DOCUMENTS / 2;
    auto(`DOCUMENTS — ${s.id} document set clean; advanced to transit, carrier notified`);
  }

  // 4. Proactive customer updates on every elevated delay risk — before they ask.
  for (const s of world.shipments.filter((x) => x.eta && x.eta.delayRisk > 0.4)) {
    propose({
      shipment: s,
      taskType: "CUSTOMER_UPDATE",
      summary: `Proactive delay advisory sent for ${s.id}`,
      detail: `Delay risk ${(s.eta!.delayRisk * 100).toFixed(0)}%: ${s.eta!.drivers[0]}. Customer informed before asking.`,
      confidence: 0.97,
      valueAtStake: 0,
    });
    report.updatesSent++;
    report.hoursEliminated += HOURS_SAVED.CUSTOMER_UPDATE;
    auto(`UPDATE — ${s.id} delay advisory sent (risk ${(s.eta!.delayRisk * 100).toFixed(0)}%) before the customer asked`);
  }

  // 5. Collections: draft dunning for overdue invoices nobody is chasing yet.
  for (const inv of world.invoices.filter((i) => i.status === "OVERDUE")) {
    const alreadyChasing = agentActions().some(
      (a) => a.shipmentId === inv.shipmentId && a.taskType === "COLLECTIONS" && a.status !== "REJECTED"
    );
    if (alreadyChasing) continue;
    const shipment = shipmentById(inv.shipmentId);
    if (!shipment) continue;
    propose({
      shipment,
      taskType: "COLLECTIONS",
      summary: `Dunning notice drafted for ${inv.id} ($${inv.amount.toLocaleString()})`,
      detail: "Out-of-pattern late payment. Gentle reminder drafted for review.",
      confidence: 0.88,
      valueAtStake: inv.amount,
    });
    report.hoursEliminated += HOURS_SAVED.COLLECTIONS;
    queued(`COLLECTIONS — ${inv.id} dunning draft prepared, awaiting sign-off`);
    report.queuedForMorning++;
  }

  report.hoursEliminated = Math.round(report.hoursEliminated * 10) / 10;
  world.hoursEliminated = Math.round((world.hoursEliminated + report.hoursEliminated) * 10) / 10;
  world.lastShift = report;
  log.push({
    at: stamp(),
    text: `SHIFT END — ${report.quotesSent} quote(s) sent, ${report.bookingsMade} booking(s) made ($${report.revenueBooked.toLocaleString()}), ${report.queuedForMorning} decision(s) queued for 07:00, ${report.hoursEliminated}h of human work eliminated`,
    kind: "INFO",
  });
  notify();
  return report;
}
