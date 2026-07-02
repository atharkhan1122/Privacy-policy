import { ensureWorld, ok } from "@/server/api";
import { runNightShift } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/night-shift — run the 8-hour autonomous shift, return the report. */
export async function POST() {
  ensureWorld();
  return ok(runNightShift());
}
