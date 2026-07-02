import { badRequest, ensureWorld, notFound, ok, withViews } from "@/server/api";
import { convertIntake } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/intake/:id/convert — parsed message becomes a live shipment. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const world = ensureWorld(request);
  const { id } = await params;
  const message = world.intake.find((m) => m.id === id);
  if (!message) return notFound(`Unknown intake message ${id}`);
  if (!message.extraction) return badRequest(`Parse ${id} before converting`);
  if (message.status === "CONVERTED") return badRequest(`${id} is already converted`);
  const shipment = convertIntake(id);
  if (!shipment) return badRequest(`Could not convert ${id}`);
  return ok(withViews(shipment), 201);
}
