import { NextResponse } from "next/server";
import { authEnabled, findAccount, setPlan, toPublic } from "@/server/accounts";
import { safeEqual } from "@/server/safe-equal";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/confirm {accountId, plan?} — operator confirms a Payoneer
 * payment landed and flips the account's plan (default PRO). Gated by
 * ENGINE_ROOM_ADMIN_KEY via x-admin-key; this is the manual-settlement step a
 * personal Payoneer account requires until API access is approved.
 */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  const adminKey = process.env.ENGINE_ROOM_ADMIN_KEY;
  if (!adminKey) return NextResponse.json({ error: "ENGINE_ROOM_ADMIN_KEY not configured" }, { status: 400 });
  const presented = request.headers.get("x-admin-key") ?? "";
  if (!safeEqual(adminKey, presented)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
