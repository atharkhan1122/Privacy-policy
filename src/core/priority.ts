import type {
  AgentAction,
  IntakeMessage,
  Invoice,
  Quote,
  Shipment,
  ShipmentDocument,
} from "./types";

/**
 * Automated escalation engine + smart task prioritization.
 *
 * Scans the whole world and answers one question: what should a human look at
 * next, and in what order? Every task carries the reason it scored what it
 * did — the queue must argue for itself or nobody trusts it.
 */

export type TaskKind =
  | "APPROVAL"
  | "EXCEPTION"
  | "DOCUMENT"
  | "COLLECTION"
  | "QUOTE_EXPIRING"
  | "INTAKE";

export interface PriorityTask {
  id: string;
  kind: TaskKind;
  title: string;
  why: string;
  score: number; // 0–100
  href: string;
  shipmentId?: string;
}

export interface PriorityInput {
  shipments: Shipment[];
  invoices: Invoice[];
  quotes: Quote[];
  intake: IntakeMessage[];
  documents: ShipmentDocument[];
  actions: readonly AgentAction[];
  now?: Date;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function priorityQueue(input: PriorityInput): PriorityTask[] {
  const now = input.now ?? new Date();
  const tasks: PriorityTask[] = [];

  // 1. Agent hand-offs — the machine already decided a human is needed.
  for (const a of input.actions) {
    if (a.status !== "AWAITING_APPROVAL" && a.status !== "ESCALATED") continue;
    tasks.push({
      id: `pt-act-${a.id}`,
      kind: "APPROVAL",
      title: a.summary,
      why: a.escalationReason ?? `Agent needs a decision (confidence ${(a.confidence * 100).toFixed(0)}%)`,
      score: clamp(80 + Math.min(15, a.valueAtStake / 1_000)),
      href: "/agent",
      shipmentId: a.shipmentId,
    });
  }

  // 2. Open exceptions — cargo is stuck right now.
  for (const s of input.shipments) {
    if (!s.hasOpenException) continue;
    tasks.push({
      id: `pt-exc-${s.id}`,
      kind: "EXCEPTION",
      title: `Exception on ${s.id} (${s.ref})`,
      why: `${s.mode} shipment blocked in ${s.state.toLowerCase()}; advance is frozen until resolved`,
      score: clamp(85 + (s.eta ? s.eta.delayRisk * 10 : 0)),
      href: `/shipments/${s.id}`,
      shipmentId: s.id,
    });
  }

  // 3. Document validation errors — these become customs delays.
  for (const d of input.documents) {
    const errors = d.issues.filter((i) => i.severity === "ERROR");
    if (errors.length === 0) continue;
    const shipment = input.shipments.find((s) => s.id === d.shipmentId);
    const inDocsState = shipment?.state === "DOCUMENTATION";
    tasks.push({
      id: `pt-doc-${d.id}`,
      kind: "DOCUMENT",
      title: `${errors.length} document error(s) on ${d.shipmentId}`,
      why: errors[0].message + (inDocsState ? " — cut-off pressure while in documentation" : ""),
      score: clamp(70 + (inDocsState ? 8 : 0)),
      href: `/shipments/${d.shipmentId}`,
      shipmentId: d.shipmentId,
    });
  }

  // 4. Overdue invoices — money aging is margin evaporating.
  for (const inv of input.invoices) {
    if (inv.status !== "OVERDUE") continue;
    const daysOver = Math.max(0, (now.getTime() - new Date(inv.dueAt).getTime()) / 86_400_000);
    tasks.push({
      id: `pt-inv-${inv.id}`,
      kind: "COLLECTION",
      title: `${inv.id} overdue: $${inv.amount.toLocaleString()}`,
      why: `${Math.ceil(daysOver)} day(s) past due`,
      score: clamp(60 + Math.min(20, daysOver * 2)),
      href: "/finance",
      shipmentId: inv.shipmentId,
    });
  }

  // 5. Pending quotes near expiry — a won deal dies quietly at hour 48.
  for (const q of input.quotes) {
    if (q.verdict !== "PENDING") continue;
    const best = q.options[0];
    if (!best) continue;
    const hoursLeft = (new Date(best.validUntil).getTime() - now.getTime()) / 3_600_000;
    if (hoursLeft > 24) continue;
    tasks.push({
      id: `pt-q-${q.id}`,
      kind: "QUOTE_EXPIRING",
      title: `${q.id} expires in ${Math.max(0, Math.round(hoursLeft))}h`,
      why: `Best option $${best.sellTotal.toLocaleString()} at ${(best.winProbability * 100).toFixed(0)}% win probability — chase before it lapses`,
      score: clamp(65 - Math.max(0, hoursLeft)),
      href: "/quotes",
      shipmentId: q.shipmentId,
    });
  }

  // 6. Unparsed intake — an unanswered inquiry is a quote a competitor wins.
  for (const m of input.intake) {
    if (m.status !== "NEW") continue;
    const ageHours = (now.getTime() - new Date(m.receivedAt).getTime()) / 3_600_000;
    tasks.push({
      id: `pt-in-${m.id}`,
      kind: "INTAKE",
      title: `Unparsed ${m.channel.toLowerCase()} from ${m.from}`,
      why: `Waiting ${ageHours < 1 ? "under an hour" : `${Math.round(ageHours)}h`} — every hour unanswered halves the win rate`,
      score: clamp(55 + Math.min(20, ageHours * 4)),
      href: "/intake",
    });
  }

  return tasks.sort((a, b) => b.score - a.score);
}
