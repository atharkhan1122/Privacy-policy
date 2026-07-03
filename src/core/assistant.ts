import type {
  AgentAction,
  Customer,
  IntakeMessage,
  Invoice,
  Quote,
  Shipment,
} from "./types";
import { STATE_LABELS } from "./state-machine";

/**
 * Conversational assistant over the world state.
 *
 * Deterministic intent routing so the terminal runs self-contained; in
 * production this is the tool-calling LLM layer and each intent below is a
 * tool the model invokes. The answers stay grounded either way: every reply
 * is computed from the store, never generated.
 */

export interface AssistantRef {
  label: string;
  href: string;
}

export interface AssistantReply {
  text: string;
  refs: AssistantRef[];
}

export interface AssistantContext {
  shipments: Shipment[];
  invoices: Invoice[];
  quotes: Quote[];
  intake: IntakeMessage[];
  customers: Customer[];
  actions: readonly AgentAction[];
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

function shipmentSummary(s: Shipment): string {
  const eta = s.eta
    ? s.eta.deltaDays > 0
      ? ` ETA model shows +${s.eta.deltaDays}d slip at ${(s.eta.delayRisk * 100).toFixed(0)}% delay risk (${s.eta.drivers[0].toLowerCase()}).`
      : " Tracking on time."
    : "";
  const exc = s.hasOpenException ? " There is an OPEN EXCEPTION blocking advance." : "";
  return `${s.id} (${s.ref}) is in ${STATE_LABELS[s.state]} — ${s.origin} → ${s.destination}, ${s.mode.toLowerCase()}${s.carrier ? ` with ${s.carrier}` : ""}.${eta}${exc}`;
}

export function answerQuery(query: string, ctx: AssistantContext): AssistantReply {
  const q = query.toLowerCase().trim();
  const refs: AssistantRef[] = [];

  // Direct shipment id lookup.
  const idMatch = query.match(/ENG-\d{4}-\d{3,4}/i);
  if (idMatch) {
    const s = ctx.shipments.find((x) => x.id.toLowerCase() === idMatch[0].toLowerCase());
    if (!s) return { text: `I don't have a shipment ${idMatch[0].toUpperCase()} on the books.`, refs: [] };
    return { text: shipmentSummary(s), refs: [{ label: s.id, href: `/shipments/${s.id}` }] };
  }

  // Customer-scoped questions.
  const customer = ctx.customers.find((c) => q.includes(c.name.toLowerCase().split(" ")[0].toLowerCase()));
  if (customer) {
    const theirs = ctx.shipments.filter((s) => s.customerId === customer.id);
    const open = ctx.invoices.filter((i) => i.customerId === customer.id && i.status !== "PAID");
    const lines = theirs.map((s) => `• ${shipmentSummary(s)}`).join("\n");
    theirs.forEach((s) => refs.push({ label: s.id, href: `/shipments/${s.id}` }));
    return {
      text: `${customer.name}: ${theirs.length} shipment(s), ${usd(open.reduce((s, i) => s + i.amount, 0))} open receivables, credit ${customer.creditScore}/100, churn risk ${(customer.churnRisk * 100).toFixed(0)}%.\n${lines}`,
      refs,
    };
  }

  // Exceptions / stuck.
  if (/exception|stuck|blocked|problem|wrong/.test(q)) {
    const exceptions = ctx.shipments.filter((s) => s.hasOpenException);
    if (exceptions.length === 0)
      return { text: "Clear board — no open exceptions. The agent is watching the fleet.", refs: [] };
    exceptions.forEach((s) => refs.push({ label: s.id, href: `/shipments/${s.id}` }));
    return {
      text: exceptions.map((s) => shipmentSummary(s)).join("\n"),
      refs,
    };
  }

  // Delay / ETA / late.
  if (/delay|late|eta|on time|arriv/.test(q)) {
    const risky = ctx.shipments.filter((s) => s.eta && s.eta.delayRisk > 0.35);
    if (risky.length === 0) return { text: "Nothing in the fleet shows elevated delay risk right now.", refs: [] };
    risky.forEach((s) => refs.push({ label: s.id, href: `/shipments/${s.id}` }));
    return {
      text: `${risky.length} shipment(s) carry elevated delay risk:\n` + risky
        .map((s) => `• ${s.id}: ${(s.eta!.delayRisk * 100).toFixed(0)}% risk, ${s.eta!.deltaDays > 0 ? `+${s.eta!.deltaDays}d predicted` : "still on time"} — ${s.eta!.drivers[0].toLowerCase()}`)
        .join("\n"),
      refs,
    };
  }

  // Money: overdue / receivables / owed.
  if (/overdue|owe|receivab|unpaid|collect/.test(q)) {
    const overdue = ctx.invoices.filter((i) => i.status === "OVERDUE");
    const openTotal = ctx.invoices
      .filter((i) => i.status === "ISSUED" || i.status === "OVERDUE")
      .reduce((s, i) => s + i.amount, 0);
    refs.push({ label: "Finance", href: "/finance" });
    if (overdue.length === 0)
      return { text: `No invoices overdue. ${usd(openTotal)} open and current across the ledger.`, refs };
    return {
      text: `${overdue.length} invoice(s) overdue totalling ${usd(overdue.reduce((s, i) => s + i.amount, 0))}: ` +
        overdue.map((i) => `${i.id} (${usd(i.amount)})`).join(", ") +
        `. ${usd(openTotal)} open overall.`,
      refs,
    };
  }

  // Margin / revenue / profit.
  if (/margin|revenue|profit|money|earn/.test(q)) {
    const revenue = ctx.shipments.reduce((s, x) => s + x.revenue, 0);
    const margin = ctx.shipments.reduce((s, x) => s + (x.revenue - x.cost), 0);
    const unpriced = ctx.shipments.filter((s) => s.revenue === 0).length;
    refs.push({ label: "Finance", href: "/finance" });
    return {
      text: `Booked revenue ${usd(revenue)} with ${usd(margin)} margin (${revenue ? ((margin / revenue) * 100).toFixed(1) : 0}%) across ${ctx.shipments.length} shipments. ${unpriced} still unpriced in the funnel.`,
      refs,
    };
  }

  // Quotes.
  if (/quote|pricing|price/.test(q)) {
    const pending = ctx.quotes.filter((x) => x.verdict === "PENDING");
    const inquiries = ctx.shipments.filter((s) => s.state === "INQUIRY").length;
    refs.push({ label: "Quotes", href: "/quotes" });
    return {
      text: `${pending.length} quote(s) pending customer decision, ${inquiries} inquiry(ies) waiting for the engine. ` +
        (pending.length
          ? "Pending: " + pending.map((p) => `${p.id} (best ${usd(p.options[0]?.sellTotal ?? 0)})`).join(", ")
          : "Run the engine from the Quotes deck."),
      refs,
    };
  }

  // Agent.
  if (/agent|approv|autonom|escalat/.test(q)) {
    const waiting = ctx.actions.filter((a) => a.status === "AWAITING_APPROVAL" || a.status === "ESCALATED");
    refs.push({ label: "Agent", href: "/agent" });
    return {
      text: waiting.length
        ? `${waiting.length} decision(s) waiting on you: ` + waiting.map((a) => a.summary).join("; ")
        : "The agent has nothing queued for you. Executed actions are in the shift report.",
      refs,
    };
  }

  // Intake.
  if (/intake|inbox|message|whatsapp|email/.test(q)) {
    const fresh = ctx.intake.filter((m) => m.status === "NEW");
    refs.push({ label: "Intake", href: "/intake" });
    return {
      text: fresh.length
        ? `${fresh.length} raw message(s) waiting to be parsed: ` + fresh.map((m) => `${m.channel.toLowerCase()} from ${m.from}`).join(", ")
        : "Inbox is fully structured — nothing unparsed.",
      refs,
    };
  }

  // Fleet overview.
  if (/fleet|status|overview|everything|shipments|transit/.test(q)) {
    const byState = new Map<string, number>();
    ctx.shipments.forEach((s) => byState.set(s.state, (byState.get(s.state) ?? 0) + 1));
    refs.push({ label: "Control Tower", href: "/" });
    return {
      text: `${ctx.shipments.length} shipments on the books: ` +
        [...byState.entries()].map(([st, n]) => `${n} in ${STATE_LABELS[st as keyof typeof STATE_LABELS].toLowerCase()}`).join(", ") +
        `. ${ctx.shipments.filter((s) => s.hasOpenException).length} exception(s) open.`,
      refs,
    };
  }

  return {
    text:
      "I answer from the live shipment graph. Try: a shipment id (ENG-2026-0847), a customer name, " +
      "“what's stuck”, “what's overdue”, “delay risks”, “margin”, “pending quotes”, " +
      "“what needs my approval”, or “fleet status”.",
    refs: [],
  };
}
