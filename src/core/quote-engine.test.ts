import { describe, expect, it } from "vitest";
import {
  generateQuote,
  knownLanes,
  recordVerdict,
  suggestMarginPct,
  winProbability,
} from "./quote-engine";
import type { Cargo, Customer } from "./types";

const cargo: Cargo = {
  commodity: "machine parts",
  weightKg: 1200,
  volumeCbm: 4,
  pieces: 3,
  hazardous: false,
  value: 80_000,
};

const customer: Customer = {
  id: "c1",
  name: "Test Co",
  country: "AE",
  creditScore: 80,
  avgDaysToPay: 25,
  churnRisk: 0.1,
  acceptsSpeedPremium: false,
};

describe("AI quote engine", () => {
  it("returns one option per rate card on the lane, sorted cheapest first", () => {
    const q = generateQuote({ shipmentId: "S1", lane: "NGLOS → AEJEA", cargo, customer });
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    const prices = q.options.map((o) => o.sellTotal);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("always applies the fuel surcharge and prices air security screening", () => {
    const q = generateQuote({ shipmentId: "S2", lane: "NGLOS → AEJEA", cargo, customer });
    for (const o of q.options) {
      expect(o.surcharges.some((s) => s.code === "BAF")).toBe(true);
      if (o.mode === "AIR") expect(o.surcharges.some((s) => s.code === "SEC")).toBe(true);
    }
  });

  it("adds hazmat handling only for hazardous cargo", () => {
    const haz = generateQuote({
      shipmentId: "S3",
      lane: "PKKHI → SAJED",
      cargo: { ...cargo, hazardous: true },
    });
    const clean = generateQuote({ shipmentId: "S4", lane: "PKKHI → SAJED", cargo });
    expect(haz.options[0].surcharges.some((s) => s.code === "HAZ")).toBe(true);
    expect(clean.options[0].surcharges.some((s) => s.code === "HAZ")).toBe(false);
  });

  it("prices air freight on volumetric weight when it exceeds actual", () => {
    const bulky: Cargo = { ...cargo, weightKg: 100, volumeCbm: 10 }; // 1670 kg volumetric
    const q = generateQuote({ shipmentId: "S5", lane: "NGLOS → AEJEA", cargo: bulky });
    const air = q.options.find((o) => o.mode === "AIR")!;
    // 1670 chargeable kg at 3.6/kg far exceeds the 100 kg actual basis
    expect(air.baseRate).toBeGreaterThan(100 * 3.6 * 2);
  });

  it("sell total = cost + margin, margin consistent with marginPct", () => {
    const q = generateQuote({ shipmentId: "S6", lane: "SGSIN → USLAX", cargo, customer });
    for (const o of q.options) {
      expect(o.sellTotal).toBe(o.costTotal + o.margin);
      expect(o.margin).toBe(Math.round((o.costTotal * o.marginPct) / 100));
    }
  });

  it("keeps the suggested margin inside the house guardrails", () => {
    for (const lane of knownLanes()) {
      const pct = suggestMarginPct(lane);
      expect(pct).toBeGreaterThanOrEqual(8);
      expect(pct).toBeLessThanOrEqual(35);
    }
  });

  it("prices speed-premium customers up", () => {
    const premium = { ...customer, acceptsSpeedPremium: true };
    expect(suggestMarginPct("CNSHA → NLRTM", premium)).toBeGreaterThan(
      suggestMarginPct("CNSHA → NLRTM", customer)
    );
  });

  it("win probability falls as margin rises", () => {
    const lane = "CNSHA → NLRTM";
    expect(winProbability(lane, 10)).toBeGreaterThan(winProbability(lane, 30));
  });

  it("learns from verdicts: repeated losses at a margin push the suggestion down", () => {
    const lane = "TRIST → GBFXT";
    const before = suggestMarginPct(lane);
    recordVerdict(lane, before, "LOST");
    recordVerdict(lane, before, "LOST");
    const after = suggestMarginPct(lane);
    expect(after).toBeLessThan(before);
  });
});
