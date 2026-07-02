import { ensureWorld, notFound, ok, shipmentDetail } from "@/server/api";

export const dynamic = "force-dynamic";

/** GET /api/shipments/:id — the object with every derived view attached. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureWorld(request);
  const { id } = await params;
  const detail = shipmentDetail(id);
  if (!detail) return notFound(`Unknown shipment ${id}`);
  return ok(detail);
}
