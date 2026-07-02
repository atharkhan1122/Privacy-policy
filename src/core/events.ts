import type { ShipmentEvent, ShipmentEventType } from "./types";

/**
 * In-memory event bus. Every state transition, agent action and financial
 * movement flows through here. In production this maps 1:1 onto an event
 * broker (see ARCHITECTURE.md) — the domain code stays identical.
 */

type Listener = (event: ShipmentEvent) => void;

let seq = 0;

const listeners = new Set<Listener>();
const history: ShipmentEvent[] = [];

export function emit(
  type: ShipmentEventType,
  shipmentId: string,
  summary: string,
  severity: ShipmentEvent["severity"] = "INFO",
  at?: string
): ShipmentEvent {
  const event: ShipmentEvent = {
    id: `evt-${++seq}`,
    type,
    shipmentId,
    at: at ?? new Date().toISOString(),
    summary,
    severity,
  };
  history.push(event);
  listeners.forEach((l) => l(event));
  return event;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function eventHistory(): readonly ShipmentEvent[] {
  return history;
}
