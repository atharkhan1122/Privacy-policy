import { ensureWorld, ok } from "@/server/api";
import { SHIPMENT_STATES, type ShipmentState } from "@/core/types";

export const dynamic = "force-dynamic";

/** GET /api/shipments?state=TRANSIT — the fleet, optionally filtered. */
export async function GET(request: Request) {
  const world = await ensureWorld(request);
  const state = new URL(request.url).searchParams.get("state");
  const shipments =
    state && (SHIPMENT_STATES as readonly string[]).includes(state)
      ? world.shipments.filter((s) => s.state === (state as ShipmentState))
      : world.shipments;
  return ok({ shipments, count: shipments.length });
}
