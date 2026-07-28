import { NextResponse } from "next/server";
import { authEnabled, toPublic, verifyCredentials } from "@/server/accounts";
import { sessionCookie, signSession } from "@/server/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/login {email, password} — verify and set the session cookie. */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const account = await verifyCredentials(body.email ?? "", body.password ?? "");
  if (!account) return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  const token = await signSession(account.id, Date.now(), account.sessionEpoch ?? 0);
  return NextResponse.json(
    { account: toPublic(account) },
    { headers: { "set-cookie": sessionCookie(token) } }
  );
}
