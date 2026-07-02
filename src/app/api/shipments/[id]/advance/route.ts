import { ensureWorld, notFound, ok, badRequest } from "@/server/api";
import { advanceShipment, shipmentById } from "@/core/store";
import { canAdvance } from "@/core/state-machine";

export const dynamic = "force-dynamic";

/** POST /api/shipments/:id/advance — one lifecycle transition forward. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureWorld();
  const { id } = await params;
  const shipment = shipmentById(id);
  if (!shipment) return notFound(`Unknown shipment ${id}`);
  if (!canAdvance(shipment)) {
    return badRequest(
      shipment.hasOpenException
        ? "Open exception blocks advance — resolve it first"
        : "Shipment is in its terminal state"
    );
  }
  advanceShipment(id);
  return ok({ id, state: shipment.state });
}
