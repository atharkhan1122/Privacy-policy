import { NextResponse } from "next/server";
import { authEnabled, consumeResetToken } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** POST /api/auth/reset {token, newPassword} — complete a password reset. */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  let body: { token?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await consumeResetToken(body.token ?? "", body.newPassword ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
