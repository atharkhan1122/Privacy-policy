import { ensureWorld, ok } from "@/server/api";
import { carrierScores, laneStats } from "@/core/trade-graph";

export const dynamic = "force-dynamic";

/**
 * GET /api/graph — the trade intelligence graph. Lane-level aggregates only,
 * already filtered by the minimum-density privacy floor.
 */
export async function GET() {
  ensureWorld();
  return ok({ lanes: laneStats(), carriers: carrierScores() });
}
