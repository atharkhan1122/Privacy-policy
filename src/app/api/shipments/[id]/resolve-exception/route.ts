import { badRequest, ensureWorld, notFound, ok } from "@/server/api";
import { resolveException, shipmentById } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/shipments/:id/resolve-exception — recovery executed, unblock. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureWorld(request);
  const { id } = await params;
  const shipment = shipmentById(id);
  if (!shipment) return notFound(`Unknown shipment ${id}`);
  if (!shipment.hasOpenException) return badRequest(`${id} has no open exception`);
  resolveException(id);
  return ok({ id, state: shipment.state, hasOpenException: shipment.hasOpenException });
}
