import { ensureWorld, ok } from "@/server/api";

export const dynamic = "force-dynamic";

/** GET /api/invoices — the ledger. */
export async function GET(request: Request) {
  const world = await ensureWorld(request);
  return ok({ invoices: world.invoices, count: world.invoices.length });
}
