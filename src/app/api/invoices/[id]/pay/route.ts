import { badRequest, ensureWorld, notFound, ok } from "@/server/api";
import { payInvoice } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/invoices/:id/pay — the customer settles. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const world = ensureWorld(request);
  const { id } = await params;
  const invoice = world.invoices.find((i) => i.id === id);
  if (!invoice) return notFound(`Unknown invoice ${id}`);
  if (invoice.status === "PAID") return badRequest(`${id} is already paid`);
  return ok(payInvoice(id));
}
