import { ensureWorld, ok } from "@/server/api";
import { eventHistory } from "@/core/events";

export const dynamic = "force-dynamic";

/** GET /api/events?limit=50 — the nervous system, newest first. */
export async function GET(request: Request) {
  ensureWorld();
  const limit = Math.min(
    Math.max(parseInt(new URL(request.url).searchParams.get("limit") ?? "50", 10) || 50, 1),
    500
  );
  const events = [...eventHistory()].reverse().slice(0, limit);
  return ok({ events, count: events.length });
}
