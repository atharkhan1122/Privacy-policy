import { SHIPMENT_STATES, type Shipment, type ShipmentState } from "./types";
import { emit } from "./events";

/**
 * The seven-state lifecycle. A shipment only ever moves forward one state at
 * a time; every transition emits an event that automations, the agent, the
 * financial layer and the trade graph all listen to.
 */

export const STATE_LABELS: Record<ShipmentState, string> = {
  INQUIRY: "Inquiry",
  QUOTE: "Quote",
  BOOKING: "Booking",
  DOCUMENTATION: "Documentation",
  TRANSIT: "Transit",
  CUSTOMS: "Customs",
  SETTLEMENT: "Settlement",
};

/** The two states where revenue lives. */
export const MONEY_STATES: ShipmentState[] = ["BOOKING", "SETTLEMENT"];

export function stateIndex(state: ShipmentState): number {
  return SHIPMENT_STATES.indexOf(state);
}

export function nextState(state: ShipmentState): ShipmentState | null {
  const i = stateIndex(state);
  return i >= 0 && i < SHIPMENT_STATES.length - 1 ? SHIPMENT_STATES[i + 1] : null;
}

export function canAdvance(shipment: Shipment): boolean {
  return nextState(shipment.state) !== null && !shipment.hasOpenException;
}

/**
 * Advance a shipment to its next lifecycle state, mutating it in place and
 * emitting the transition event. Returns the new state, or null if terminal.
 */
export function advance(shipment: Shipment, at?: string): ShipmentState | null {
  const to = nextState(shipment.state);
  if (!to) return null;
  const from = shipment.state;
  shipment.state = to;
  shipment.stateEnteredAt = at ?? new Date().toISOString();
  emit(
    "shipment.state_changed",
    shipment.id,
    `${shipment.id} moved ${STATE_LABELS[from]} → ${STATE_LABELS[to]}`,
    MONEY_STATES.includes(to) ? "SUCCESS" : "INFO",
    at
  );
  return to;
}
