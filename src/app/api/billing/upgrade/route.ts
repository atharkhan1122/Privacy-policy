import { NextResponse } from "next/server";
import { authEnabled, requestUpgrade, toPublic } from "@/server/accounts";
import { currentAccount } from "@/server/current-user";
import { PLANS } from "@/core/plans";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/upgrade — start a manual Payoneer upgrade to Pro.
 *
 * With a personal Payoneer account you collect via "Request a Payment": this
 * records the intent, stamps a reference, and returns your Payoneer payment
 * link + instructions to show the customer. Once they pay and you confirm
 * (POST /api/billing/confirm with the admin key), the account flips to Pro.
 */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Auth is disabled" }, { status: 400 });
  const account = await currentAccount(request);
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (account.plan === "PRO") return NextResponse.json({ error: "Already on Pro" }, { status: 400 });

  const reference = `ER-PRO-${account.id}-${Date.now().toString(36).toUpperCase()}`;
  const updated = requestUpgrade(account.id, reference);
  const payoneerLink = process.env.ENGINE_ROOM_PAYONEER_LINK ?? "";

  return NextResponse.json({
    account: updated ? toPublic(updated) : null,
    reference,
    amount: PLANS.PRO.priceLabel,
    payoneerLink,
    instructions: payoneerLink
      ? `Pay ${PLANS.PRO.priceLabel} at the Payoneer link, putting reference ${reference} in the note. Your plan upgrades once the operator confirms receipt.`
      : `Send your Payoneer "Request a Payment" to this customer for ${PLANS.PRO.priceLabel} with reference ${reference}. Set ENGINE_ROOM_PAYONEER_LINK to show a pay link here.`,
  });
}
