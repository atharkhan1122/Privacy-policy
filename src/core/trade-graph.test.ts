import { describe, expect, it } from "vitest";
import { carrierScores, laneFor, laneStats, learn, predictEta } from "./trade-graph";
import { requiredDocuments, validateDocuments } from "./documents";
import type { Shipment } from "./types";

const base: Shipment = {
  id: "ENG-TEST-0004",
  ref: "graph test",
  state: "TRANSIT",
  customerId: "c1",
  origin: "SGSIN Singapore",
  destination: "USLAX Los Angeles",
  mode: "OCEAN",
  incoterm: "CIF",
  cargo: { commodity: "electronics", weightKg: 9_000, volumeCbm: 35, pieces: 12, hazardous: false, value: 300_000 },
  carrier: "ONE",
  createdAt: new Date().toISOString(),
  stateEnteredAt: new Date().toISOString(),
  revenue: 6_000,
  cost: 5_000,
  hasOpenException: false,
};

describe("trade intelligence graph", () => {
  it("publishes only lanes above the minimum density floor", () => {
    for (const lane of laneStats()) expect(lane.observations).toBeGreaterThanOrEqual(25);
    for (const c of carrierScores()) expect(c.shipmentsScored).toBeGreaterThanOrEqual(25);
  });

  it("settled shipments write observations back to the lane", () => {
    const lane = laneFor(base.origin, base.destination)!;
    const before = lane.observations;
    learn(base, 7);
    expect(lane.observations).toBe(before + 7);
  });

  it("predicts slip and elevated risk on a congested lane", () => {
    const promised = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const eta = predictEta(base, promised); // USLAX congestion 0.71
    expect(eta.deltaDays).toBeGreaterThan(0);
    expect(eta.delayRisk).toBeGreaterThan(0.3);
    expect(eta.drivers.some((d) => d.toLowerCase().includes("congestion"))).toBe(true);
    expect(new Date(eta.predicted).getTime()).toBeGreaterThan(new Date(promised).getTime());
  });

  it("reports no adverse signals on a clean lane", () => {
    const clean: Shipment = { ...base, origin: "TRIST Istanbul", destination: "GBFXT Felixstowe", carrier: "Ekol", mode: "LAND" };
    const eta = predictEta(clean, new Date(Date.now() + 5 * 86_400_000).toISOString());
    expect(eta.deltaDays).toBe(0);
    expect(eta.drivers).toEqual(["No adverse signals on lane or carrier"]);
  });
});

describe("document intelligence", () => {
  it("requires an AWB for air and a B/L for ocean", () => {
    expect(requiredDocuments(base)).toContain("BILL_OF_LADING");
    expect(requiredDocuments({ ...base, mode: "AIR" })).toContain("AIR_WAYBILL");
  });

  it("adds delivery order for DAP/DDP and certificate of origin above 20k value", () => {
    const dap = requiredDocuments({ ...base, incoterm: "DAP" });
    expect(dap).toContain("DELIVERY_ORDER");
    expect(requiredDocuments(base)).toContain("CERTIFICATE_OF_ORIGIN");
    const cheap = requiredDocuments({ ...base, incoterm: "FOB", cargo: { ...base.cargo, value: 5_000 } });
    expect(cheap).not.toContain("CERTIFICATE_OF_ORIGIN");
  });

  it("flags missing required documents as errors", () => {
    const issues = validateDocuments(base, []);
    expect(issues.length).toBe(requiredDocuments(base).length);
    expect(issues.every((i) => i.severity === "ERROR")).toBe(true);
  });
});
