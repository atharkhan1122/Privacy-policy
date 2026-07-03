import { ensureWorld, ok } from "@/server/api";
import { captureSnapshot } from "@/core/snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/state — the caller's tenant world as one snapshot document.
 * This is what the browser terminal hydrates from in server-sync mode: the
 * UI becomes a read-replica of the server world, re-pulling on SSE events.
 */
export async function GET(request: Request) {
  ensureWorld(request);
  return ok(captureSnapshot());
}
