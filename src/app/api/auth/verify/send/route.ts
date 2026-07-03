import { NextResponse } from "next/server";
import { authEnabled } from "@/server/accounts";
import { currentAccount } from "@/server/current-user";
import { baseUrlFrom, sendVerificationEmail } from "@/server/verify-email";

export const dynamic = "force-dynamic";

/** POST /api/auth/verify/send — resend the verification email to the signed-in user. */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  const account = await currentAccount(request);
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (account.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });
  await sendVerificationEmail(account, baseUrlFrom(request));
  return NextResponse.json({ ok: true });
}
