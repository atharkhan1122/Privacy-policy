import { badRequest, ensureWorld, notFound, ok, shipmentDetail } from "@/server/api";
import { acceptQuote } from "@/core/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/quotes/:id/accept {optionId} — the customer's tap. Books the
 * carrier, generates documents, issues the invoice, engages the ETA model:
 * one command, four modules, because they're all the same object.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const world = ensureWorld();
  const { id } = await params;
  const quote = world.quotes.find((q) => q.id === id);
  if (!quote) return notFound(`Unknown quote ${id}`);
  if (quote.verdict !== "PENDING") return badRequest(`Quote ${id} is ${quote.verdict}`);

  let optionId: string | undefined;
  try {
    optionId = ((await request.json()) as { optionId?: string }).optionId;
  } catch {
    return badRequest("JSON body with optionId is required");
  }
  const option = quote.options.find((o) => o.id === optionId);
  if (!option) return badRequest(`Unknown option ${optionId} on ${id}`);

  acceptQuote(id, option.id);
  return ok(shipmentDetail(quote.shipmentId));
}
