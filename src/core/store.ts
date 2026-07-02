"use client";

import { useSyncExternalStore } from "react";
import type {
  IntakeMessage,
  Invoice,
  Quote,
  Shipment,
  ShipmentDocument,
  ShipmentEvent,
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
import { propose } from "./agent";

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
  booted: boolean;
}

const world: World = {
  shipments: SHIPMENTS,
  intake: INTAKE_MESSAGES,
  quotes: [],
  documents: DOCUMENTS,
  invoices: INVOICES,
  tracking: TRACKING_EVENTS,
  booted: false,
};

let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

subscribeEvents(() => notify());

function boot(): void {
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
      boot();
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
