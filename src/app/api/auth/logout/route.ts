import { NextResponse } from "next/server";
import { clearedSessionCookie } from "@/server/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clear the session cookie. */
export async function POST() {
  return NextResponse.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
}
