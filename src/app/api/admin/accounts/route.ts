import { NextResponse } from "next/server";
import { authEnabled, listAccounts } from "@/server/accounts";
import { checkAdmin } from "@/server/admin-auth";
import { emailConfigured, outbox } from "@/server/mailer";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/accounts — the operator console's data. Admin-keyed via
 * x-admin-key. Returns every account (no credential material), whether accounts
 * are enabled, and the mail outbox to relay when no email provider is set.
 */
export async function GET(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  return NextResponse.json({
    authEnabled: authEnabled(),
    accounts: await listAccounts(),
    emailConfigured: emailConfigured(),
    outbox: outbox(),
  });
}
