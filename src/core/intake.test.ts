import { describe, expect, it } from "vitest";
import { extract } from "./intake";

describe("AI intake engine", () => {
  it("parses the 02:14 a.m. Lagos voice note from the chart", () => {
    const e = extract({
      from: "Adeyemi Machinery Ltd",
      raw: "[voice note transcript] Urgent — 3 pallets of machine parts, 1,240 kg, from Lagos to Dubai by air. CIF. Need them within the week.",
    });
    expect(e.origin.value).toBe("NGLOS Lagos");
    expect(e.destination.value).toBe("AEJEA Jebel Ali"); // Dubai resolves to the port
    expect(e.weightKg.value).toBe(1240);
    expect(e.pieces.value).toBe(3);
    expect(e.incoterm.value).toBe("CIF");
    expect(e.mode.value).toBe("AIR");
    expect(e.commodity.value).toContain("machine parts");
    expect(e.customerName.value).toBe("Adeyemi Machinery Ltd");
    expect(e.overallConfidence).toBeGreaterThan(0.8);
  });

  it('prefers explicit "from X to Y" over mention order', () => {
    const e = extract({
      from: "x",
      raw: "We import into Hamburg regularly. This one goes from Hamburg to Singapore, sea freight.",
    });
    expect(e.origin.value).toBe("DEHAM Hamburg");
    expect(e.destination.value).toBe("SGSIN Singapore");
    expect(e.origin.confidence).toBeGreaterThan(0.9);
  });

  it("converts tons to kilograms at lower confidence", () => {
    const e = extract({ from: "x", raw: "about 19 tons of auto parts from Mumbai to Hamburg by sea" });
    expect(e.weightKg.value).toBe(19_000);
    expect(e.weightKg.confidence).toBeLessThan(0.95);
  });

  it("infers AIR from urgency when no mode is stated, at low confidence", () => {
    const e = extract({ from: "x", raw: "urgent shipment of spare parts, 200 kg, Lagos to Jeddah" });
    expect(e.mode.value).toBe("AIR");
    expect(e.mode.confidence).toBeLessThan(0.7);
  });

  it("returns nulls with zero confidence rather than guessing", () => {
    const e = extract({ from: "x", raw: "hello, do you also handle freight?" });
    expect(e.origin.value).toBeNull();
    expect(e.origin.confidence).toBe(0);
    expect(e.weightKg.value).toBeNull();
    expect(e.overallConfidence).toBe(0);
  });

  it("keeps per-field source spans for auditability", () => {
    const e = extract({ from: "x", raw: "2 containers, 43 cbm, FOB Nhava Sheva to Rotterdam" });
    expect(e.volumeCbm.value).toBe(43);
    expect(e.volumeCbm.source).toContain("43");
    expect(e.incoterm.value).toBe("FOB");
  });
});
