import { NextResponse } from "next/server";
import { authEnabled, createAccount, toPublic } from "@/server/accounts";
import { sessionCookie, signSession } from "@/server/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/signup {email, password} — create a FREE account + sign in. */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = createAccount(body.email ?? "", body.password ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const token = await signSession(result.account.id, Date.now());
  return NextResponse.json(
    { account: toPublic(result.account) },
    { status: 201, headers: { "set-cookie": sessionCookie(token) } }
  );
}
