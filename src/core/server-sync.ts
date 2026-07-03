import { applySnapshot, type WorldSnapshotFile } from "./snapshot";
import { forceNotify, setTickerEnabled } from "./store";

/**
 * Server-sync: the browser terminal as a live client of the server world.
 *
 * On boot the UI tries GET /api/state. If it answers, the client world is
 * replaced by the server's tenant world, the local ambience ticker stops,
 * and an EventSource on /api/events/stream triggers a debounced re-pull on
 * every server event — so two tabs, curl, and the WhatsApp webhook all see
 * one world. If /api/state is unreachable (static hosting) or 401s (keyed
 * deployment — EventSource cannot carry an API key), the UI stays in local
 * demo mode with its own in-memory world, exactly as before.
 */

type SyncMode = "local" | "server";

let mode: SyncMode = "local";
let started = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export function syncMode(): SyncMode {
  return mode;
}

export function serverMode(): boolean {
  return mode === "server";
}

export async function refreshFromServer(): Promise<void> {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    applySnapshot((await res.json()) as WorldSnapshotFile);
  } catch {
    // transient — the next event retriggers
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    void refreshFromServer();
  }, 400);
}

export function initServerSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return; // 401 in keyed mode, 404 on static hosts → stay local
      applySnapshot((await res.json()) as WorldSnapshotFile);
      mode = "server";
      setTickerEnabled(false);
      forceNotify(); // re-render with the badge + server world

      const source = new EventSource("/api/events/stream");
      source.addEventListener("shipment-event", scheduleRefresh);
      source.addEventListener("world-changed", scheduleRefresh);
      // EventSource auto-reconnects; nothing to do on error.
      console.info("engine-room: server-synced world");
    } catch (error) {
      // no server world — local demo mode
      console.warn("engine-room: server-sync unavailable, local demo mode", error);
    }
  })();
}
