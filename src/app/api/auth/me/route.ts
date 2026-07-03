import { NextResponse } from "next/server";
import { authEnabled, findAccount, toPublic } from "@/server/accounts";
import { SESSION_COOKIE, verifySession } from "@/server/session";
import { PLANS } from "@/core/plans";

export const dynamic = "force-dynamic";

function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** GET /api/auth/me — the signed-in account + its plan features, or 401. */
export async function GET(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ authEnabled: false, plans: PLANS });
  }
  const accountId = await verifySession(cookie(request, SESSION_COOKIE));
  const account = accountId ? findAccount(accountId) : undefined;
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({
    authEnabled: true,
    account: toPublic(account),
    features: PLANS[account.plan],
    plans: PLANS,
  });
}
