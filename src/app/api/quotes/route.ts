import { ensureWorld, ok } from "@/server/api";

export const dynamic = "force-dynamic";

/** GET /api/quotes — every quote on the wire. */
export async function GET() {
  const world = ensureWorld();
  return ok({ quotes: world.quotes, count: world.quotes.length });
}
