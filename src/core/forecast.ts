import type { Quote, Shipment } from "./types";

/**
 * Revenue forecasting: booked revenue plus the pipeline weighted by what the
 * margin brain believes each stage is actually worth. No optimism — every
 * dollar in the forecast carries the probability it arrives.
 */

const HOUSE_WIN_RATE = 0.45; // historical inquiry → booking conversion
const FALLBACK_QUOTE_VALUE = 6_000;

export interface RevenueForecast {
  /** Revenue already booked on shipments (all states). */
  booked: number;
  /** Pending quotes: Σ best-option sell total × win probability. */
  weightedQuotes: number;
  /** Unquoted inquiries: count × average quote value × house win rate. */
  inquiryEstimate: number;
  /** booked + weightedQuotes + inquiryEstimate. */
  expected: number;
}

export function revenueForecast(shipments: Shipment[], quotes: Quote[]): RevenueForecast {
  const booked = shipments.reduce((s, x) => s + x.revenue, 0);

  const pending = quotes.filter((q) => q.verdict === "PENDING");
  const weightedQuotes = Math.round(
    pending.reduce((sum, q) => {
      const best = [...q.options].sort((a, b) => b.winProbability - a.winProbability)[0];
      return best ? sum + best.sellTotal * best.winProbability : sum;
    }, 0)
  );

  const allBest = quotes
    .map((q) => q.options[0]?.sellTotal)
    .filter((v): v is number => typeof v === "number");
  const avgQuoteValue = allBest.length
    ? allBest.reduce((a, b) => a + b, 0) / allBest.length
    : FALLBACK_QUOTE_VALUE;
  const inquiries = shipments.filter((s) => s.state === "INQUIRY").length;
  const inquiryEstimate = Math.round(inquiries * avgQuoteValue * HOUSE_WIN_RATE);

  return {
    booked,
    weightedQuotes,
    inquiryEstimate,
    expected: booked + weightedQuotes + inquiryEstimate,
  };
}
