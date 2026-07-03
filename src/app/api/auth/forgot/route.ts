import { NextResponse } from "next/server";
import { authEnabled, createResetToken } from "@/server/accounts";
import { deliver } from "@/server/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot {email} — start a password reset. Always returns
 * {ok:true} so account existence never leaks; when the email exists a reset
 * link is delivered via the mailer seam (webhook, or the operator outbox).
 */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const issued = createResetToken(body.email ?? "");
  if (issued) {
    const base = process.env.ENGINE_ROOM_PUBLIC_URL ?? new URL(request.url).origin;
    const link = `${base}/reset?token=${issued.token}`;
    await deliver({
      to: issued.account.email,
      subject: "Reset your Engine Room password",
      text: `Reset your password with this link (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
      link,
    });
  }
  return NextResponse.json({ ok: true });
}
