import { NextResponse } from "next/server";
import { authEnabled, listAccounts } from "@/server/accounts";
import { checkAdmin } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/accounts — the operator console's data. Admin-keyed via
 * x-admin-key. Returns every account (no credential material) plus whether
 * accounts are enabled, so the panel can guide setup.
 */
export async function GET(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  return NextResponse.json({ authEnabled: authEnabled(), accounts: listAccounts() });
}
