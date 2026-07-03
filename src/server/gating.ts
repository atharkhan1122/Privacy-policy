import { NextResponse } from "next/server";
import { authEnabled } from "@/server/accounts";
import { currentAccount } from "@/server/current-user";
import { type PlanFeatures, features } from "@/core/plans";
import type { Plan } from "@/server/accounts";
import { worldSnapshot } from "@/core/store";

/**
 * Plan enforcement for the API plane. This is the server-side half of the
 * FREE/PRO split — the plans matrix (src/core/plans.ts) is the single source
 * of truth, checked here and mirrored in the UI.
 *
 * When auth is OFF the platform runs as an ungated demo: every request gets
 * PRO features, so the 100+ existing tests and the open demo are unaffected.
 */

export async function currentPlan(request: Request): Promise<Plan> {
  if (!authEnabled()) return "PRO"; // demo mode: nothing is gated
  const account = await currentAccount(request);
  return account?.plan ?? "FREE";
}

export async function planFeatures(request: Request): Promise<PlanFeatures> {
  return features(await currentPlan(request));
}

/** 402 Payment Required — the honest status for "your plan doesn't include this". */
export function upgradeRequired(message: string) {
  return NextResponse.json({ error: message, upgrade: true }, { status: 402 });
}

/** Active = anything not yet settled. The cap that makes FREE a trial, not a toy. */
export function activeShipmentCount(): number {
  return worldSnapshot().shipments.filter((s) => s.state !== "SETTLEMENT").length;
}
