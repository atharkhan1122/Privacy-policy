import { ensureWorld, ok } from "@/server/api";
import { runNightShift } from "@/core/store";
import { planFeatures, upgradeRequired } from "@/server/gating";

export const dynamic = "force-dynamic";

/** POST /api/night-shift — run the 8-hour autonomous shift, return the report. */
export async function POST(request: Request) {
  ensureWorld(request);
  const features = await planFeatures(request);
  if (!features.nightShift) {
    return upgradeRequired("The autonomous Night Shift is a Pro feature. Upgrade to enable it.");
  }
  return ok(runNightShift());
}
