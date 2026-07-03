import * as local from "./store";
import * as agent from "./agent";
import { refreshFromServer, serverMode } from "./server-sync";
import type { AgentTaskType, AutonomyLevel, IntakeChannel } from "./types";

/**
 * The UI's command layer. In server-sync mode every command is an API call
 * (the server world is the truth; the client re-pulls after each command);
 * in local demo mode it is the same in-memory domain function it always was.
 * Pages call these and never know which world they are operating.
 */

async function command(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => undefined);
  await refreshFromServer();
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | undefined)?.error ?? `Command failed (${res.status})`
    );
  }
  return data;
}

export async function submitIntake(params: {
  channel: IntakeChannel;
  from: string;
  raw: string;
}): Promise<{ id: string }> {
  if (serverMode()) return (await command("/api/intake", params)) as { id: string };
  return local.submitIntake(params);
}

export async function parseIntakeSmart(messageId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/intake/${messageId}/parse`);
    return;
  }
  await local.parseIntakeSmart(messageId);
}

export async function convertIntake(messageId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/intake/${messageId}/convert`);
    return;
  }
  local.convertIntake(messageId);
}

export async function quoteShipment(shipmentId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/shipments/${shipmentId}/quote`);
    return;
  }
  local.quoteShipment(shipmentId);
}

export async function acceptQuote(quoteId: string, optionId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/quotes/${quoteId}/accept`, { optionId });
    return;
  }
  local.acceptQuote(quoteId, optionId);
}

export async function advanceShipment(shipmentId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/shipments/${shipmentId}/advance`);
    return;
  }
  local.advanceShipment(shipmentId);
}

export async function resolveException(shipmentId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/shipments/${shipmentId}/resolve-exception`);
    return;
  }
  local.resolveException(shipmentId);
}

export async function runNightShift(): Promise<void> {
  if (serverMode()) {
    await command("/api/night-shift");
    return;
  }
  local.runNightShift();
}

export async function approveAction(actionId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/agent/actions/${actionId}/approve`);
    return;
  }
  agent.approve(actionId);
  local.forceNotify();
}

export async function rejectAction(actionId: string): Promise<void> {
  if (serverMode()) {
    await command(`/api/agent/actions/${actionId}/reject`);
    return;
  }
  agent.reject(actionId);
  local.forceNotify();
}

export async function setAutonomy(taskType: AgentTaskType, level: AutonomyLevel): Promise<void> {
  if (serverMode()) {
    await command("/api/agent/autonomy", { taskType, level });
    return;
  }
  agent.setAutonomyLevel(taskType, level);
  local.forceNotify();
}
