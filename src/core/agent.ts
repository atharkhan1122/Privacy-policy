import type {
  AgentAction,
  AgentTaskType,
  AutonomyGrant,
  AutonomyLevel,
  Shipment,
} from "./types";
import { emit } from "./events";

/**
 * The AI Logistics Agent.
 *
 * Autonomy is earned in four notches, per task type:
 *   1 SUGGEST → 2 DRAFT → 3 ACT-ASK-FIRST → 4 ACT-REPORT-AFTER
 *
 * Under the dial runs a permanent loop: perceive → recall → decide → escalate.
 * The agent always escalates when confidence is low or value exceeds the
 * ceiling — the best agents are famous for what they refuse to do alone.
 */

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  1: "Suggest",
  2: "Draft",
  3: "Act, ask first",
  4: "Act, report after",
};

export const TASK_LABELS: Record<AgentTaskType, string> = {
  QUOTE: "Quoting",
  BOOKING: "Carrier booking",
  DOCUMENTS: "Document generation",
  CUSTOMER_UPDATE: "Customer updates",
  EXCEPTION_HANDLING: "Exception handling",
  COLLECTIONS: "Payment collection",
};

const grants: Record<AgentTaskType, AutonomyGrant> = {
  QUOTE: { taskType: "QUOTE", level: 4, earnedOver: 214, valueCeiling: 15_000 },
  BOOKING: { taskType: "BOOKING", level: 3, earnedOver: 96, valueCeiling: 12_400 },
  DOCUMENTS: { taskType: "DOCUMENTS", level: 4, earnedOver: 388, valueCeiling: 50_000 },
  CUSTOMER_UPDATE: { taskType: "CUSTOMER_UPDATE", level: 4, earnedOver: 512, valueCeiling: 100_000 },
  EXCEPTION_HANDLING: { taskType: "EXCEPTION_HANDLING", level: 2, earnedOver: 31, valueCeiling: 8_000 },
  COLLECTIONS: { taskType: "COLLECTIONS", level: 2, earnedOver: 18, valueCeiling: 5_000 },
};

const MIN_CONFIDENCE_TO_ACT = 0.85;

const actions: AgentAction[] = [];
let actionSeq = 0;

export function autonomyGrants(): AutonomyGrant[] {
  return Object.values(grants);
}

export function setAutonomyLevel(taskType: AgentTaskType, level: AutonomyLevel): void {
  grants[taskType].level = level;
}

export function agentActions(): readonly AgentAction[] {
  return actions;
}

/**
 * The decide step: given a proposed action, the grant for its task type, its
 * confidence and value at stake, resolve what the agent is allowed to do.
 */
export function propose(params: {
  shipment: Shipment;
  taskType: AgentTaskType;
  summary: string;
  detail: string;
  confidence: number;
  valueAtStake: number;
  at?: string;
}): AgentAction {
  const grant = grants[params.taskType];
  const { confidence, valueAtStake } = params;

  let status: AgentAction["status"];
  let levelUsed: AutonomyLevel = grant.level;
  let escalationReason: string | undefined;

  if (confidence < MIN_CONFIDENCE_TO_ACT && grant.level >= 3) {
    status = "ESCALATED";
    escalationReason = `Confidence ${(confidence * 100).toFixed(0)}% below act threshold`;
  } else if (valueAtStake > grant.valueCeiling && grant.level === 4) {
    status = "AWAITING_APPROVAL";
    levelUsed = 3;
    escalationReason = `Value $${valueAtStake.toLocaleString()} exceeds notch-4 ceiling $${grant.valueCeiling.toLocaleString()}`;
  } else {
    switch (grant.level) {
      case 1: status = "SUGGESTED"; break;
      case 2: status = "DRAFTED"; break;
      case 3: status = "AWAITING_APPROVAL"; break;
      case 4: status = "EXECUTED"; break;
    }
  }

  const action: AgentAction = {
    id: `act-${++actionSeq}`,
    shipmentId: params.shipment.id,
    taskType: params.taskType,
    levelUsed,
    summary: params.summary,
    detail: params.detail,
    confidence,
    valueAtStake,
    status,
    at: params.at ?? new Date().toISOString(),
    escalationReason,
  };
  actions.unshift(action);

  emit(
    status === "ESCALATED" || status === "AWAITING_APPROVAL" ? "agent.escalated" : "agent.action",
    params.shipment.id,
    `${TASK_LABELS[params.taskType]}: ${params.summary} [${status.replace(/_/g, " ").toLowerCase()}]`,
    status === "ESCALATED" ? "WARNING" : status === "EXECUTED" ? "SUCCESS" : "INFO",
    params.at
  );
  return action;
}

/** One-tap human approval; success feeds the trust that earns the next notch. */
export function approve(actionId: string): AgentAction | undefined {
  const action = actions.find((a) => a.id === actionId);
  if (!action || (action.status !== "AWAITING_APPROVAL" && action.status !== "ESCALATED")) return action;
  action.status = "EXECUTED";
  grants[action.taskType].earnedOver += 1;
  emit("agent.action", action.shipmentId, `Human approved: ${action.summary}`, "SUCCESS");
  return action;
}

export function reject(actionId: string): AgentAction | undefined {
  const action = actions.find((a) => a.id === actionId);
  if (!action) return undefined;
  action.status = "REJECTED";
  emit("agent.action", action.shipmentId, `Human rejected: ${action.summary}`, "WARNING");
  return action;
}

/** Seed the log so the console shows a working history on first boot. */
export function seedAction(a: Omit<AgentAction, "id">): void {
  actions.push({ ...a, id: `act-${++actionSeq}` });
}
