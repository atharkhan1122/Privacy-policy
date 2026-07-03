import { NextResponse } from "next/server";
import { authEnabled, findAccount, setPlan, toPublic } from "@/server/accounts";
import { checkAdmin } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/confirm {accountId, plan?} — operator confirms a Payoneer
 * payment landed and flips the account's plan (default PRO). Gated by
 * ENGINE_ROOM_ADMIN_KEY via x-admin-key; this is the manual-settlement step a
 * personal Payoneer account requires until API access is approved.
 */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  const denied = checkAdmin(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  let body: { accountId?: string; plan?: "FREE" | "PRO" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.accountId || !findAccount(body.accountId)) {
    return NextResponse.json({ error: "Unknown accountId" }, { status: 404 });
  }
  const updated = setPlan(body.accountId, body.plan ?? "PRO");
  return NextResponse.json({ account: updated ? toPublic(updated) : null });
}
