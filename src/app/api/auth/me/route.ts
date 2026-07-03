import { NextResponse } from "next/server";
import { authEnabled, toPublic } from "@/server/accounts";
import { currentAccount } from "@/server/current-user";
import { PLANS } from "@/core/plans";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — the signed-in account + its plan features, or 401. */
export async function GET(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ authEnabled: false, plans: PLANS });
  }
  // currentAccount enforces the session-revocation epoch, so a stale token
  // (issued before a password change) reads as signed-out here too.
  const account = await currentAccount(request);
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({
    authEnabled: true,
    account: toPublic(account),
    features: PLANS[account.plan],
    plans: PLANS,
  });
}
