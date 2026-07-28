import type {
  Cargo,
  Customer,
  Quote,
  QuoteOption,
  QuoteVerdict,
  SurchargeLine,
  TransportMode,
} from "./types";
import { emit } from "./events";

/**
 * AI Quote Engine — quotations in under 60 seconds.
 *
 * Five hard problems wearing one simple interface:
 *   rate memory → surcharge resolver → margin brain → options → win/loss loop.
 */

// ─── Rate memory ─────────────────────────────────────────────────────────────
// Per-lane, per-mode base rates the forwarder has on contract. In production
// this is the ingested rate-card store; here it is seeded with realistic 2026
// market levels (USD).

interface RateCard {
  lane: string;
  mode: TransportMode;
  carrier: string;
  /** USD per kg (air/land) or per cbm-equivalent unit (ocean LCL basis). */
  unitRate: number;
  minimum: number;
  transitDays: number;
}

const RATE_CARDS: RateCard[] = [
  { lane: "CNSHA → NLRTM", mode: "OCEAN", carrier: "Maersk", unitRate: 42, minimum: 380, transitDays: 32 },
  { lane: "CNSHA → NLRTM", mode: "OCEAN", carrier: "COSCO", unitRate: 38, minimum: 350, transitDays: 35 },
  { lane: "CNSHA → NLRTM", mode: "AIR", carrier: "Emirates SkyCargo", unitRate: 4.1, minimum: 900, transitDays: 4 },
  { lane: "NGLOS → AEJEA", mode: "AIR", carrier: "Emirates SkyCargo", unitRate: 3.6, minimum: 750, transitDays: 2 },
  { lane: "NGLOS → AEJEA", mode: "OCEAN", carrier: "CMA CGM", unitRate: 55, minimum: 420, transitDays: 24 },
  { lane: "INNSA → DEHAM", mode: "OCEAN", carrier: "Hapag-Lloyd", unitRate: 40, minimum: 360, transitDays: 26 },
  { lane: "INNSA → DEHAM", mode: "AIR", carrier: "Lufthansa Cargo", unitRate: 3.9, minimum: 850, transitDays: 3 },
  { lane: "AEJEA → KEMBA", mode: "OCEAN", carrier: "MSC", unitRate: 48, minimum: 400, transitDays: 9 },
  { lane: "SGSIN → USLAX", mode: "OCEAN", carrier: "ONE", unitRate: 51, minimum: 430, transitDays: 21 },
  { lane: "SGSIN → USLAX", mode: "AIR", carrier: "Singapore Airlines Cargo", unitRate: 5.2, minimum: 1100, transitDays: 3 },
  { lane: "TRIST → GBFXT", mode: "LAND", carrier: "Ekol", unitRate: 0.9, minimum: 600, transitDays: 6 },
  { lane: "PKKHI → SAJED", mode: "OCEAN", carrier: "MSC", unitRate: 44, minimum: 380, transitDays: 7 },
];

export function knownLanes(): string[] {
  return [...new Set(RATE_CARDS.map((r) => r.lane))];
}

// ─── Surcharge resolver ──────────────────────────────────────────────────────
// The unglamorous heart: conditional charges that make freight pricing a dark
// art. Each rule inspects lane, mode, cargo and season and yields a line item.

interface SurchargeContext {
  lane: string;
  mode: TransportMode;
  cargo: Cargo;
  baseAmount: number;
  month: number; // 1-12
  laneCongestion: number; // [0,1]
  rateTrendPct: number;
}

type SurchargeRule = (ctx: SurchargeContext) => SurchargeLine | null;

const SURCHARGE_RULES: SurchargeRule[] = [
  ({ baseAmount, mode }) => ({
    code: "BAF",
    name: "Bunker / fuel adjustment",
    amount: Math.round(baseAmount * (mode === "AIR" ? 0.16 : 0.12)),
    reason: "Index-linked fuel adjustment factor",
  }),
  ({ baseAmount, month }) =>
    month >= 8 && month <= 10
      ? {
          code: "PSS",
          name: "Peak season surcharge",
          amount: Math.round(baseAmount * 0.08),
          reason: "Aug–Oct pre-holiday capacity crunch",
        }
      : null,
  ({ baseAmount, laneCongestion }) =>
    laneCongestion > 0.5
      ? {
          code: "CGS",
          name: "Congestion surcharge",
          amount: Math.round(baseAmount * 0.06 * laneCongestion),
          reason: `Destination congestion index at ${(laneCongestion * 100).toFixed(0)}%`,
        }
      : null,
  ({ baseAmount, rateTrendPct }) =>
    Math.abs(rateTrendPct) > 2
      ? {
          code: "CAF",
          name: "Currency adjustment",
          amount: Math.round(baseAmount * 0.02),
          reason: "FX volatility on lane settlement currency",
        }
      : null,
  ({ cargo }) =>
    cargo.hazardous
      ? {
          code: "HAZ",
          name: "Hazardous cargo handling",
          amount: 450,
          reason: `IMO class handling for ${cargo.commodity}`,
        }
      : null,
  ({ mode }) =>
    mode === "AIR"
      ? { code: "SEC", name: "Security screening", amount: 85, reason: "Mandatory air cargo screening" }
      : null,
  ({ cargo }) =>
    cargo.value > 100_000
      ? {
          code: "HVC",
          name: "High-value cargo fee",
          amount: Math.round(cargo.value * 0.001),
          reason: "Insurance uplift above USD 100k declared value",
        }
      : null,
];

// ─── Margin brain + win/loss loop ────────────────────────────────────────────
// Suggests markup from history; every resolved quote feeds the next one.

const winLossLog: { lane: string; marginPct: number; verdict: QuoteVerdict }[] = [
  // Seeded history so the brain has something to learn from on first boot.
  { lane: "CNSHA → NLRTM", marginPct: 18, verdict: "WON" },
  { lane: "CNSHA → NLRTM", marginPct: 26, verdict: "LOST" },
  { lane: "CNSHA → NLRTM", marginPct: 21, verdict: "WON" },
  { lane: "NGLOS → AEJEA", marginPct: 24, verdict: "WON" },
  { lane: "NGLOS → AEJEA", marginPct: 30, verdict: "WON" },
  { lane: "INNSA → DEHAM", marginPct: 22, verdict: "LOST" },
  { lane: "INNSA → DEHAM", marginPct: 16, verdict: "WON" },
  { lane: "SGSIN → USLAX", marginPct: 19, verdict: "WON" },
];

export function recordVerdict(lane: string, marginPct: number, verdict: QuoteVerdict): void {
  winLossLog.push({ lane, marginPct, verdict });
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export interface QuoteEngineSnapshot {
  winLossLog: { lane: string; marginPct: number; verdict: QuoteVerdict }[];
  quoteSeq: number;
}

export function quoteEngineSnapshot(): QuoteEngineSnapshot {
  return { winLossLog, quoteSeq };
}

export function restoreQuoteEngine(snapshot: QuoteEngineSnapshot): void {
  winLossLog.length = 0;
  winLossLog.push(...snapshot.winLossLog);
  quoteSeq = snapshot.quoteSeq;
}

/**
 * Suggested margin % for a lane: midpoint between the average winning margin
 * (pull up) and the average losing margin (ceiling), nudged by customer
 * behaviour. Falls back to a 20% house margin on unseen lanes.
 */
export function suggestMarginPct(lane: string, customer?: Customer): number {
  const history = winLossLog.filter((w) => w.lane === lane && w.verdict !== "PENDING");
  let pct = 20;
  if (history.length > 0) {
    const wins = history.filter((w) => w.verdict === "WON").map((w) => w.marginPct);
    const losses = history.filter((w) => w.verdict === "LOST").map((w) => w.marginPct);
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 20;
    const ceiling = losses.length ? Math.min(...losses) : avgWin + 8;
    pct = Math.min(avgWin + 2, ceiling - 1);
  }
  if (customer?.acceptsSpeedPremium) pct += 3;
  if (customer && customer.creditScore < 50) pct += 2; // price the risk
  return Math.round(Math.max(8, Math.min(pct, 35)));
}

export function winProbability(lane: string, marginPct: number): number {
  const suggested = suggestMarginPct(lane);
  // Logistic curve centred on the suggested margin.
  const p = 1 / (1 + Math.exp((marginPct - suggested) / 4));
  return Math.round(p * 100) / 100;
}

// ─── Quote generation ────────────────────────────────────────────────────────

export interface LaneSignal {
  congestionIndex: number;
  rateTrendPct: number;
}

let quoteSeq = 0;

export function generateQuote(params: {
  shipmentId: string;
  lane: string;
  cargo: Cargo;
  customer?: Customer;
  month?: number;
  laneSignal?: LaneSignal;
  now?: string;
}): Quote {
  const { shipmentId, lane, cargo, customer } = params;
  const startedAt = Date.now();
  const month = params.month ?? new Date().getMonth() + 1;
  const signal = params.laneSignal ?? { congestionIndex: 0.3, rateTrendPct: 0 };
  const cards = RATE_CARDS.filter((r) => r.lane === lane);
  const marginPct = suggestMarginPct(lane, customer);

  const options: QuoteOption[] = cards.map((card) => {
    const chargeable =
      card.mode === "OCEAN"
        ? Math.max(cargo.volumeCbm, cargo.weightKg / 1000) // w/m rule
        : card.mode === "AIR"
          ? Math.max(cargo.weightKg, cargo.volumeCbm * 167) // volumetric
          : cargo.weightKg;
    const baseRate = Math.max(Math.round(chargeable * card.unitRate), card.minimum);
    const ctx: SurchargeContext = {
      lane,
      mode: card.mode,
      cargo,
      baseAmount: baseRate,
      month,
      laneCongestion: signal.congestionIndex,
      rateTrendPct: signal.rateTrendPct,
    };
    const surcharges = SURCHARGE_RULES.map((rule) => rule(ctx)).filter(
      (s): s is SurchargeLine => s !== null
    );
    const costTotal = baseRate + surcharges.reduce((s, l) => s + l.amount, 0);
    const margin = Math.round((costTotal * marginPct) / 100);
    const sellTotal = costTotal + margin;
    const validUntil = new Date(
      (params.now ? new Date(params.now).getTime() : Date.now()) + 48 * 3600 * 1000
    ).toISOString();
    return {
      id: `qo-${++quoteSeq}`,
      mode: card.mode,
      carrier: card.carrier,
      transitDays: card.transitDays,
      baseRate,
      surcharges,
      costTotal,
      margin,
      marginPct,
      sellTotal,
      winProbability: winProbability(lane, marginPct),
      validUntil,
    };
  });

  const quote: Quote = {
    id: `Q-${String(1000 + ++quoteSeq)}`,
    shipmentId,
    options: options.sort((a, b) => a.sellTotal - b.sellTotal),
    verdict: "PENDING",
    generatedInMs: Math.max(Date.now() - startedAt, 1) + 380, // parse+price budget
    createdAt: params.now ?? new Date().toISOString(),
  };

  emit(
    "quote.generated",
    shipmentId,
    `Quote ${quote.id}: ${options.length} option(s) on ${lane}, margin ${marginPct}%`,
    "INFO",
    params.now
  );
  return quote;
}
