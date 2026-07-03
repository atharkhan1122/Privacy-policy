import { NextResponse } from "next/server";
import { authEnabled, setPassword, verifyCredentials } from "@/server/accounts";
import { currentAccount } from "@/server/current-user";
import { sessionCookie, signSession } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password {currentPassword, newPassword} — the signed-in
 * user rotates their password. Re-issues the session cookie so the change takes
 * effect cleanly on the current device.
 */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  const account = await currentAccount(request);
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!verifyCredentials(account.email, body.currentPassword ?? "")) {
    return NextResponse.json({ error: "Current password is wrong" }, { status: 401 });
  }
  const result = setPassword(account.id, body.newPassword ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const token = await signSession(account.id, Date.now());
  return NextResponse.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
}
