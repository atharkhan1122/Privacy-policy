import { ensureWorld, ok } from "@/server/api";

export const dynamic = "force-dynamic";

/** GET /api/quotes — every quote on the wire. */
export async function GET(request: Request) {
  const world = ensureWorld(request);
  return ok({ quotes: world.quotes, count: world.quotes.length });
}
