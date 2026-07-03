import { type Account, createVerifyToken } from "@/server/accounts";
import { deliver } from "@/server/mailer";

/** The public base URL for links in emails (env override, else request origin). */
export function baseUrlFrom(request: Request): string {
  return process.env.ENGINE_ROOM_PUBLIC_URL ?? new URL(request.url).origin;
}

/** Mint a verification token and deliver the confirm-your-email link. */
export async function sendVerificationEmail(account: Account, baseUrl: string): Promise<void> {
  const token = createVerifyToken(account.id);
  if (!token) return;
  const link = `${baseUrl}/api/auth/verify?token=${token}`;
  await deliver({
    to: account.email,
    subject: "Verify your Engine Room email",
    text: `Confirm your email address with this link:\n\n${link}`,
    link,
  });
}
