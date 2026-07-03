import { NextResponse } from "next/server";
import { authEnabled, consumeVerifyToken } from "@/server/accounts";
import { baseUrlFrom } from "@/server/verify-email";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify?token=… — the link target in a verification email.
 * Marks the email verified and bounces to /account with the outcome, so the
 * whole flow is a single click from the inbox.
 */
export async function GET(request: Request) {
  const base = baseUrlFrom(request);
  if (!authEnabled()) return NextResponse.redirect(`${base}/login`);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = consumeVerifyToken(token);
  return NextResponse.redirect(`${base}/account?verified=${result.ok ? "1" : "0"}`);
}
