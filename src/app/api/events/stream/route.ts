import { ensureWorld } from "@/server/api";
import { eventHistory, subscribe } from "@/core/events";
import { subscribeWorld } from "@/core/store";
import { activeTenant, resolveTenant } from "@/server/persistence";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const MAX_REPLAY = 100;

/**
 * GET /api/events/stream?replay=20 — the event bus over Server-Sent Events.
 *
 * On connect: a `hello` event, then the last `replay` events from history
 * (default 0, max 100), then every live event as it is emitted. Comment-line
 * heartbeats every 15s keep intermediaries from closing the connection.
 *
 * This is the nervous system made external: everything the terminal's live
 * feed shows, any consumer can subscribe to — a customer's TMS, a Slack bot,
 * a wallboard. In production this endpoint fronts the Kafka topics
 * (ARCHITECTURE.md § 2); the wire format here is the contract.
 */
export async function GET(request: Request) {
  ensureWorld(request);
  const tenant = resolveTenant(request);
  const url = new URL(request.url);
  const replay = Math.min(
    Math.max(parseInt(url.searchParams.get("replay") ?? "0", 10) || 0, 0),
    MAX_REPLAY
  );

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let unsubscribeWorld: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const push = (payload: string, eventName?: string) => {
        try {
          controller.enqueue(
            encoder.encode(`${eventName ? `event: ${eventName}\n` : ""}data: ${payload}\n\n`)
          );
        } catch {
          // consumer already gone — cleanup happens via abort/cancel
        }
      };

      push(
        JSON.stringify({ connectedAt: new Date().toISOString(), replay, tenant }),
        "hello"
      );
      const backlog = replay > 0 ? [...eventHistory()].slice(-replay) : [];
      for (const event of backlog) {
        push(JSON.stringify(event), "shipment-event");
      }

      unsubscribe = subscribe((event) => {
        // Events belong to whichever tenant's world is active when they are
        // emitted — only forward the subscriber's own.
        if (activeTenant() !== tenant) return;
        push(JSON.stringify(event), "shipment-event");
      });

      // Not every mutation emits a bus event (intake arrivals, parses) — the
      // world-changed frame is the sync heartbeat server-synced UIs re-pull on.
      unsubscribeWorld = subscribeWorld(() => {
        if (activeTenant() !== tenant) return;
        push("{}", "world-changed");
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          // ignore — stream is closing
        }
      }, HEARTBEAT_MS);
      (heartbeat as { unref?: () => void }).unref?.();

      const close = () => {
        unsubscribe?.();
        unsubscribeWorld?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
      unsubscribeWorld?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
