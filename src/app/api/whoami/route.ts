import fs from "fs";
import { ensureWorld, ok } from "@/server/api";
import { activeTenant, dataFile } from "@/server/persistence";

export const dynamic = "force-dynamic";

/** GET /api/whoami — which tenant this key addresses, and its world's stats. */
export async function GET(request: Request) {
  const world = await ensureWorld(request);
  return ok({
    tenant: activeTenant(),
    persisted: fs.existsSync(dataFile()),
    shipments: world.shipments.length,
    intake: world.intake.length,
    hoursEliminated: world.hoursEliminated,
  });
}
