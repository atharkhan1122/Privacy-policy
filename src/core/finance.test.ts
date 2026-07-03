import { describe, expect, it } from "vitest";
import { issueInvoice, markPaid, marginPct, receivablesAging } from "./finance";
import type { Customer, Invoice, Shipment } from "./types";

const shipment: Shipment = {
  id: "ENG-TEST-0003",
  ref: "finance test",
  state: "BOOKING",
  customerId: "c1",
  origin: "AEJEA Jebel Ali",
  destination: "KEMBA Mombasa",
  mode: "OCEAN",
  incoterm: "CFR",
  cargo: { commodity: "fertilizer", weightKg: 40_000, volumeCbm: 60, pieces: 2, hazardous: false, value: 30_000 },
  createdAt: new Date().toISOString(),
  stateEnteredAt: new Date().toISOString(),
  revenue: 5_000,
  cost: 4_000,
  hasOpenException: false,
};

const goodCredit: Customer = {
  id: "c1", name: "Good Co", country: "DE",
  creditScore: 85, avgDaysToPay: 40, churnRisk: 0.05, acceptsSpeedPremium: false,
};
const weakCredit: Customer = {
  id: "c2", name: "Weak Co", country: "TR",
  creditScore: 50, avgDaysToPay: 55, churnRisk: 0.4, acceptsSpeedPremium: false,
};

describe("the financial layer", () => {
  it("gives net-30 to strong credit and net-14 to weak credit", () => {
    const at = "2026-07-01T00:00:00.000Z";
    const strong = issueInvoice(shipment, goodCredit, at);
    const weak = issueInvoice(shipment, weakCredit, at);
    const days = (inv: Invoice) =>
      Math.round((new Date(inv.dueAt).getTime() - new Date(inv.issuedAt).getTime()) / 86_400_000);
    expect(days(strong)).toBe(30);
    expect(days(weak)).toBe(14);
  });

  it("offers financing to slow payers with viable credit, priced by score", () => {
    const strong = issueInvoice(shipment, goodCredit);
    expect(strong.financingOffered).toBe(true);
    expect(strong.financingAprPct).toBe(9.5);
    const fast = issueInvoice(shipment, { ...goodCredit, avgDaysToPay: 20 });
    expect(fast.financingOffered).toBe(false);
  });

  it("invoices the shipment's revenue — money is a view of the object", () => {
    const inv = issueInvoice(shipment, goodCredit);
    expect(inv.amount).toBe(shipment.revenue);
    expect(inv.shipmentId).toBe(shipment.id);
  });

  it("markPaid settles the invoice", () => {
    const inv = issueInvoice(shipment, goodCredit);
    markPaid(inv);
    expect(inv.status).toBe("PAID");
  });

  it("ages receivables into the four buckets and ignores paid invoices", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    const mk = (dueAt: string, status: Invoice["status"]): Invoice => ({
      id: "i", shipmentId: "s", customerId: "c", amount: 100, currency: "USD",
      issuedAt: "2026-01-01T00:00:00.000Z", dueAt, status, financingOffered: false,
    });
    const aging = receivablesAging(
      [
        mk("2026-07-20T00:00:00.000Z", "ISSUED"),   // current
        mk("2026-06-22T00:00:00.000Z", "OVERDUE"),  // 10 days over
        mk("2026-05-18T00:00:00.000Z", "OVERDUE"),  // 45 days over
        mk("2026-03-01T00:00:00.000Z", "OVERDUE"),  // 100+ days over
        mk("2026-03-01T00:00:00.000Z", "PAID"),     // excluded
      ],
      now
    );
    expect(aging.map((b) => b.invoices.length)).toEqual([1, 1, 1, 1]);
    expect(aging.reduce((s, b) => s + b.total, 0)).toBe(400);
  });

  it("computes margin percentage off revenue", () => {
    expect(marginPct(shipment)).toBe(20);
    expect(marginPct({ ...shipment, revenue: 0, cost: 0 })).toBe(0);
  });
});
