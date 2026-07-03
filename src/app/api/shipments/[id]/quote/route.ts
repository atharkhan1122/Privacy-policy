import { ensureWorld, notFound, ok } from "@/server/api";
import { quoteShipment, shipmentById } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/shipments/:id/quote — run the quote engine. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWorld(request);
  const { id } = await params;
  if (!shipmentById(id)) return notFound(`Unknown shipment ${id}`);
  const quote = quoteShipment(id);
  if (!quote) return notFound(`Could not quote ${id}`);
  return ok(quote, 201);
}
