import { describe, expect, it } from "vitest";
import { advance, canAdvance, nextState, stateIndex, MONEY_STATES } from "./state-machine";
import { eventHistory } from "./events";
import { SHIPMENT_STATES, type Shipment } from "./types";

function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "ENG-TEST-0001",
    ref: "test shipment",
    state: "INQUIRY",
    customerId: "cust-1",
    origin: "CNSHA Shanghai",
    destination: "NLRTM Rotterdam",
    mode: "OCEAN",
    incoterm: "FOB",
    cargo: { commodity: "widgets", weightKg: 1000, volumeCbm: 5, pieces: 10, hazardous: false, value: 10_000 },
    createdAt: new Date().toISOString(),
    stateEnteredAt: new Date().toISOString(),
    revenue: 0,
    cost: 0,
    hasOpenException: false,
    ...overrides,
  };
}

describe("the seven-state lifecycle", () => {
  it("orders the states as the chart draws them", () => {
    expect(SHIPMENT_STATES).toEqual([
      "INQUIRY", "QUOTE", "BOOKING", "DOCUMENTATION", "TRANSIT", "CUSTOMS", "SETTLEMENT",
    ]);
    expect(MONEY_STATES).toEqual(["BOOKING", "SETTLEMENT"]);
  });

  it("only ever moves forward one state at a time", () => {
    const s = makeShipment();
    const visited = [s.state as string];
    let guard = 0;
    while (advance(s) && guard++ < 10) visited.push(s.state);
    expect(visited).toEqual([...SHIPMENT_STATES]);
  });

  it("is terminal at SETTLEMENT", () => {
    const s = makeShipment({ state: "SETTLEMENT" });
    expect(nextState(s.state)).toBeNull();
    expect(advance(s)).toBeNull();
    expect(s.state).toBe("SETTLEMENT");
  });

  it("refuses to advance past an open exception", () => {
    const s = makeShipment({ state: "TRANSIT", hasOpenException: true });
    expect(canAdvance(s)).toBe(false);
  });

  it("emits a state_changed event on every transition", () => {
    const s = makeShipment();
    const before = eventHistory().length;
    advance(s);
    const events = eventHistory().slice(before);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("shipment.state_changed");
    expect(events[0].shipmentId).toBe(s.id);
  });

  it("stamps stateEnteredAt on transition", () => {
    const s = makeShipment({ stateEnteredAt: "2020-01-01T00:00:00.000Z" });
    advance(s, "2026-07-02T12:00:00.000Z");
    expect(s.stateEnteredAt).toBe("2026-07-02T12:00:00.000Z");
  });

  it("indexes states for pipeline rendering", () => {
    expect(stateIndex("INQUIRY")).toBe(0);
    expect(stateIndex("SETTLEMENT")).toBe(6);
  });
});
