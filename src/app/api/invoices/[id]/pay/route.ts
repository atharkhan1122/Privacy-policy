import { badRequest, ensureWorld, notFound, ok } from "@/server/api";
import { payInvoice } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/invoices/:id/pay — the customer settles. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const world = await ensureWorld(request);
  const { id } = await params;
  const invoice = world.invoices.find((i) => i.id === id);
  if (!invoice) return notFound(`Unknown invoice ${id}`);
  if (invoice.status === "PAID") return badRequest(`${id} is already paid`);
  // Optional {method, reference} records how settlement landed — e.g. a manual
  // Payoneer payment with the customer's reference note.
  let payment: { method?: string; reference?: string } | undefined;
  try {
    const body = (await request.json()) as { method?: string; reference?: string };
    if (body && (body.method || body.reference)) {
      payment = { method: body.method, reference: body.reference };
    }
  } catch {
    // no body → a plain settlement, which is fine
  }
  return ok(payInvoice(id, payment));
}
