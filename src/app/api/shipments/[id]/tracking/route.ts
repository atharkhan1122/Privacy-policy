import { badRequest, ensureWorld, notFound, ok } from "@/server/api";
import { ingestTracking, shipmentById } from "@/core/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/shipments/:id/tracking {location, description, isException?, at?}
 * — inbound carrier/EDI tracking. An exception flags the shipment, re-scores
 * the ETA, and queues an agent recovery proposal.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureWorld(request);
  const { id } = await params;
  if (!shipmentById(id)) return notFound(`Unknown shipment ${id}`);

  let body: { location?: string; description?: string; isException?: boolean; at?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.location || !body.description) {
    return badRequest("location and description are required");
  }
  const tracking = ingestTracking({
    shipmentId: id,
    location: body.location,
    description: body.description,
    isException: body.isException,
    at: body.at,
  });
  return ok(tracking, 201);
}
