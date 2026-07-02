import { describe, expect, it } from "vitest";
import { bootWorld, runNightShift } from "./store";
import { agentActions } from "./agent";
import { revenueForecast } from "./forecast";

/**
 * Integration test: the chart's Deck 06, executed. One autonomous shift over
 * the seeded world — raw inbox in, quotes out, bookings held at the ceiling,
 * decisions queued for 07:00. Exercises intake, quoting, agent policy,
 * documents and collections against the real store.
 */


describe("the night shift", () => {
  bootWorld();
  const report = runNightShift();

  it("parses the whole raw inbox", () => {
    expect(report.intakeParsed).toBe(2); // the seeded WhatsApp voice note + email chain
  });

  it("quotes confident inquiries without waking anyone", () => {
    expect(report.quotesSent).toBeGreaterThanOrEqual(1);
  });

  it("holds the customer-accepted booking for one-tap morning approval (the 02:31 escalation)", () => {
    expect(report.queuedForMorning).toBeGreaterThanOrEqual(1);
    const held = agentActions().filter(
      (a) => a.taskType === "BOOKING" && a.status === "AWAITING_APPROVAL"
    );
    expect(held.length).toBeGreaterThanOrEqual(1);
    expect(held[0].detail).toContain("07:00");
  });

  it("sends proactive delay advisories before customers ask", () => {
    expect(report.updatesSent).toBeGreaterThanOrEqual(1); // USLAX congestion shipment
  });

  it("eliminates measurable human hours and reports them", () => {
    expect(report.hoursEliminated).toBeGreaterThan(1);
    expect(report.log[report.log.length - 1].text).toContain("SHIFT END");
  });

  it("writes a chronological narrative log", () => {
    const times = report.log.map((e) => e.at);
    expect(times).toEqual([...times].sort());
    expect(report.log.length).toBeGreaterThanOrEqual(5);
  });

  it("is idempotent about held decisions — a second shift does not re-queue the same booking", () => {
    const heldBefore = agentActions().filter(
      (a) => a.taskType === "BOOKING" && a.status === "AWAITING_APPROVAL"
    ).length;
    runNightShift();
    const heldAfter = agentActions().filter(
      (a) => a.taskType === "BOOKING" && a.status === "AWAITING_APPROVAL"
    ).length;
    expect(heldAfter).toBe(heldBefore);
  });
});

describe("revenue forecast", () => {
  it("weights every pipeline dollar by its probability", () => {
    const f = revenueForecast(
      [
        { revenue: 10_000, state: "TRANSIT" } as never,
        { revenue: 0, state: "INQUIRY" } as never,
      ],
      [
        {
          verdict: "PENDING",
          options: [{ sellTotal: 4_000, winProbability: 0.5 }],
        } as never,
      ]
    );
    expect(f.booked).toBe(10_000);
    expect(f.weightedQuotes).toBe(2_000);
    expect(f.inquiryEstimate).toBe(Math.round(4_000 * 0.45)); // 1 inquiry × avg quote × house rate
    expect(f.expected).toBe(f.booked + f.weightedQuotes + f.inquiryEstimate);
  });

  it("counts nothing twice: won quotes are booked revenue, not pipeline", () => {
    const f = revenueForecast(
      [{ revenue: 5_000, state: "BOOKING" } as never],
      [{ verdict: "WON", options: [{ sellTotal: 5_000, winProbability: 0.7 }] } as never]
    );
    expect(f.weightedQuotes).toBe(0);
    expect(f.expected).toBe(5_000);
  });
});
