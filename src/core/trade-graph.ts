import type { CarrierScore, EtaPrediction, LaneStats, Shipment } from "./types";
import { emit } from "./events";

/**
 * Trade Intelligence Graph.
 *
 * Lane-level aggregates only, with minimum density thresholds — no single
 * firm's position can be reverse-read (the covenant is engineered into the
 * product, not written in a policy page).
 */

const MIN_DENSITY = 25; // observations below this are never published

const lanes: LaneStats[] = [
  { lane: "CNSHA → NLRTM", origin: "CNSHA Shanghai", destination: "NLRTM Rotterdam", mode: "OCEAN", medianTransitDays: 33, rateTrendPct: 2.4, congestionIndex: 0.61, customsDelayDays: 1.2, demandIndex: 0.82, observations: 1841 },
  { lane: "NGLOS → AEJEA", origin: "NGLOS Lagos", destination: "AEJEA Jebel Ali", mode: "AIR", medianTransitDays: 2, rateTrendPct: 4.0, congestionIndex: 0.22, customsDelayDays: 0.8, demandIndex: 0.74, observations: 312 },
  { lane: "INNSA → DEHAM", origin: "INNSA Nhava Sheva", destination: "DEHAM Hamburg", mode: "OCEAN", medianTransitDays: 27, rateTrendPct: -1.1, congestionIndex: 0.34, customsDelayDays: 0.9, demandIndex: 0.58, observations: 967 },
  { lane: "AEJEA → KEMBA", origin: "AEJEA Jebel Ali", destination: "KEMBA Mombasa", mode: "OCEAN", medianTransitDays: 10, rateTrendPct: 0.6, congestionIndex: 0.48, customsDelayDays: 2.6, demandIndex: 0.66, observations: 428 },
  { lane: "SGSIN → USLAX", origin: "SGSIN Singapore", destination: "USLAX Los Angeles", mode: "OCEAN", medianTransitDays: 22, rateTrendPct: 3.2, congestionIndex: 0.71, customsDelayDays: 1.6, demandIndex: 0.88, observations: 1203 },
  { lane: "TRIST → GBFXT", origin: "TRIST Istanbul", destination: "GBFXT Felixstowe", mode: "LAND", medianTransitDays: 6, rateTrendPct: 1.4, congestionIndex: 0.18, customsDelayDays: 1.1, demandIndex: 0.41, observations: 156 },
  { lane: "PKKHI → SAJED", origin: "PKKHI Karachi", destination: "SAJED Jeddah", mode: "OCEAN", medianTransitDays: 8, rateTrendPct: 0.9, congestionIndex: 0.26, customsDelayDays: 1.9, demandIndex: 0.52, observations: 289 },
];

const carriers: CarrierScore[] = [
  { carrier: "Maersk", mode: "OCEAN", onTimePct: 78, rollingRiskPct: 6, docAccuracyPct: 96, shipmentsScored: 2210 },
  { carrier: "COSCO", mode: "OCEAN", onTimePct: 71, rollingRiskPct: 11, docAccuracyPct: 91, shipmentsScored: 1480 },
  { carrier: "MSC", mode: "OCEAN", onTimePct: 74, rollingRiskPct: 9, docAccuracyPct: 93, shipmentsScored: 1902 },
  { carrier: "Hapag-Lloyd", mode: "OCEAN", onTimePct: 81, rollingRiskPct: 5, docAccuracyPct: 97, shipmentsScored: 1130 },
  { carrier: "CMA CGM", mode: "OCEAN", onTimePct: 76, rollingRiskPct: 8, docAccuracyPct: 94, shipmentsScored: 990 },
  { carrier: "ONE", mode: "OCEAN", onTimePct: 79, rollingRiskPct: 7, docAccuracyPct: 95, shipmentsScored: 730 },
  { carrier: "Emirates SkyCargo", mode: "AIR", onTimePct: 92, rollingRiskPct: 2, docAccuracyPct: 98, shipmentsScored: 640 },
  { carrier: "Lufthansa Cargo", mode: "AIR", onTimePct: 89, rollingRiskPct: 3, docAccuracyPct: 97, shipmentsScored: 415 },
  { carrier: "Singapore Airlines Cargo", mode: "AIR", onTimePct: 93, rollingRiskPct: 2, docAccuracyPct: 98, shipmentsScored: 388 },
  { carrier: "Ekol", mode: "LAND", onTimePct: 85, rollingRiskPct: 4, docAccuracyPct: 92, shipmentsScored: 204 },
];

export function laneStats(): LaneStats[] {
  return lanes.filter((l) => l.observations >= MIN_DENSITY);
}

export function laneFor(origin: string, destination: string): LaneStats | undefined {
  return lanes.find((l) => l.origin === origin && l.destination === destination);
}

export function laneByKey(lane: string): LaneStats | undefined {
  return lanes.find((l) => l.lane === lane);
}

export function carrierScores(): CarrierScore[] {
  return carriers.filter((c) => c.shipmentsScored >= MIN_DENSITY);
}

export function carrierScore(name: string): CarrierScore | undefined {
  return carriers.find((c) => c.carrier === name);
}

/** Every settled shipment writes observations back; the next quote, for someone else, gets smarter. */
export function learn(shipment: Shipment, observations: number, at?: string): void {
  const lane = laneFor(shipment.origin, shipment.destination);
  if (lane) lane.observations += observations;
  emit(
    "graph.learned",
    shipment.id,
    `${observations} new observations written to the trade graph (${lane?.lane ?? "new lane"})`,
    "INFO",
    at
  );
}

// ─── Persistence ─────────────────────────────────────────────────────────────
// Only observation counts mutate at runtime; the rest of the graph is static.

export function graphSnapshot(): Record<string, number> {
  return Object.fromEntries(lanes.map((l) => [l.lane, l.observations]));
}

export function restoreGraph(observations: Record<string, number>): void {
  for (const lane of lanes) {
    if (typeof observations[lane.lane] === "number") {
      lane.observations = observations[lane.lane];
    }
  }
}

// ─── Predictive ETA / delay engine ───────────────────────────────────────────

export function predictEta(shipment: Shipment, promised: string): EtaPrediction {
  const lane = laneFor(shipment.origin, shipment.destination);
  const carrier = shipment.carrier ? carrierScore(shipment.carrier) : undefined;

  const drivers: string[] = [];
  let slipDays = 0;
  let risk = 0.08;

  if (lane) {
    if (lane.congestionIndex > 0.5) {
      const d = Math.round(lane.congestionIndex * 4);
      slipDays += d;
      risk += lane.congestionIndex * 0.35;
      drivers.push(`Destination congestion index ${(lane.congestionIndex * 100).toFixed(0)}% (+${d}d)`);
    }
    if (lane.customsDelayDays > 1.5) {
      slipDays += Math.round(lane.customsDelayDays - 1);
      risk += 0.12;
      drivers.push(`Customs running ${lane.customsDelayDays.toFixed(1)}d on this lane`);
    }
    if (lane.demandIndex > 0.8) {
      risk += 0.1;
      drivers.push(`Peak demand on lane (index ${(lane.demandIndex * 100).toFixed(0)}%) — rolling risk elevated`);
    }
  }
  if (carrier && carrier.onTimePct < 75) {
    slipDays += 1;
    risk += 0.1;
    drivers.push(`${carrier.carrier} on-time performance ${carrier.onTimePct}%`);
  }
  if (drivers.length === 0) drivers.push("No adverse signals on lane or carrier");

  const promisedDate = new Date(promised);
  const predicted = new Date(promisedDate.getTime() + slipDays * 86_400_000);
  return {
    promised,
    predicted: predicted.toISOString(),
    deltaDays: slipDays,
    delayRisk: Math.round(Math.min(risk, 0.97) * 100) / 100,
    drivers,
  };
}
