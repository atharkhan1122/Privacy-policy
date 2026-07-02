import fs from "fs";
import path from "path";
import {
  bootWorld,
  restoreStore,
  storeSnapshot,
  subscribeWorld,
  type StoreSnapshot,
} from "@/core/store";
import { agentSnapshot, restoreAgent, type AgentSnapshot } from "@/core/agent";
import { eventsSnapshot, restoreEvents, type EventsSnapshot } from "@/core/events";
import {
  quoteEngineSnapshot,
  restoreQuoteEngine,
  type QuoteEngineSnapshot,
} from "@/core/quote-engine";
import { graphSnapshot, restoreGraph } from "@/core/trade-graph";
import { documentSeq, restoreDocumentSeq } from "@/core/documents";
import { invoiceSeq, restoreInvoiceSeq } from "@/core/finance";
import { parseApiKeys, presentedKey } from "@/server/api-keys";
import { safeEqual } from "@/server/safe-equal";

/**
 * Durable world — file-backed persistence for the API plane's server-side
 * world. The domain stays in-memory and synchronous; this adapter hydrates
 * every stateful module from a snapshot on boot and debounce-writes an atomic
 * snapshot after each mutation. Restart the server, the world survives.
 *
 * This is deliberately the same seam a database implements: the per-module
 * snapshot/restore functions are the repository interface; swap the JSON file
 * for Postgres and nothing above this layer changes (ARCHITECTURE.md § 1).
 *
 * Config: ENGINE_ROOM_PERSIST=0 disables; ENGINE_ROOM_DATA overrides the
 * snapshot path (default .data/world.json). The browser demo world is
 * untouched — persistence applies to the server process only.
 */

const SNAPSHOT_VERSION = 1;
const SAVE_DEBOUNCE_MS = 300;

interface WorldSnapshotFile {
  version: number;
  savedAt: string;
  store: StoreSnapshot;
  agent: AgentSnapshot;
  events: EventsSnapshot;
  quoteEngine: QuoteEngineSnapshot;
  graph: Record<string, number>;
  documentSeq: number;
  invoiceSeq: number;
}

// ─── Tenancy ─────────────────────────────────────────────────────────────────
// One isolated world per API key. The active tenant's world lives in the
// domain singletons; switching tenants persists the outgoing world and
// restores (or geneses) the incoming one. Node's single-threaded execution
// makes the swap safe for synchronous handlers; the one async handler
// (Claude parse) re-activates its tenant after awaiting. In the Postgres
// implementation tenancy is row-level and this swap disappears.

let activeTenantId = "default";
/** Pristine post-boot world, used to seed brand-new tenants. */
let genesis: string | undefined;

export function activeTenant(): string {
  return activeTenantId;
}

/** Which tenant a request addresses — keyed by its (middleware-validated) API key. */
export function resolveTenant(request: Request): string {
  const entries = parseApiKeys(process.env.ENGINE_ROOM_API_KEYS);
  if (entries.length === 0) return "default";
  const presented = presentedKey(request.headers);
  const entry = presented
    ? entries.find((e) => safeEqual(e.key, presented))
    : undefined;
  return entry?.tenant ?? "default"; // unkeyed = webhook traffic → default world
}

/** Swap the domain singletons to the given tenant's world. */
export function activateTenant(tenant: string): void {
  if (tenant === activeTenantId) return;
  try {
    persistNow(); // save the outgoing tenant synchronously
  } catch {
    // never let a failed save block the incoming tenant
  }
  activeTenantId = tenant;
  if (!hydrateFromDisk() && genesis) {
    applySnapshot(JSON.parse(genesis) as WorldSnapshotFile); // fresh tenant = pristine seed
  }
}

// ─── Snapshot I/O ────────────────────────────────────────────────────────────

export function dataFile(tenant = activeTenantId): string {
  const base = process.env.ENGINE_ROOM_DATA ?? path.join(process.cwd(), ".data", "world.json");
  if (tenant === "default") return base;
  return path.join(path.dirname(base), `tenant-${tenant}.json`);
}

export function persistenceEnabled(): boolean {
  return process.env.ENGINE_ROOM_PERSIST !== "0";
}

function captureSnapshot(): WorldSnapshotFile {
  return {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    store: storeSnapshot(),
    agent: agentSnapshot(),
    events: eventsSnapshot(),
    quoteEngine: quoteEngineSnapshot(),
    graph: graphSnapshot(),
    documentSeq: documentSeq(),
    invoiceSeq: invoiceSeq(),
  };
}

function applySnapshot(snapshot: WorldSnapshotFile): void {
  restoreAgent(snapshot.agent);
  restoreEvents(snapshot.events);
  restoreQuoteEngine(snapshot.quoteEngine);
  restoreGraph(snapshot.graph);
  restoreDocumentSeq(snapshot.documentSeq);
  restoreInvoiceSeq(snapshot.invoiceSeq);
  restoreStore(snapshot.store); // last — its notify() triggers the first save
}

/** Write the active tenant's world snapshot atomically (tmp + rename). */
export function persistNow(): void {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(captureSnapshot()));
  fs.renameSync(tmp, file);
}

/** Restore every stateful module from disk. Returns false when no snapshot. */
export function hydrateFromDisk(): boolean {
  const file = dataFile();
  if (!fs.existsSync(file)) return false;
  let snapshot: WorldSnapshotFile;
  try {
    snapshot = JSON.parse(fs.readFileSync(file, "utf8")) as WorldSnapshotFile;
  } catch {
    return false; // corrupt snapshot — keep the seeded world rather than crash
  }
  if (snapshot.version !== SNAPSHOT_VERSION) return false;
  applySnapshot(snapshot);
  return true;
}

// Next.js dev reloads modules; pin the subscription to globalThis so exactly
// one persistence loop runs per process.
const globalKey = "__engineRoomPersistence" as const;
const g = globalThis as { [globalKey]?: boolean };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function initPersistence(): void {
  if (!persistenceEnabled() || g[globalKey]) return;
  g[globalKey] = true;
  bootWorld();
  genesis = JSON.stringify(captureSnapshot()); // pristine seed for new tenants
  hydrateFromDisk();
  subscribeWorld(() => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        persistNow();
      } catch {
        // a failed save must never take a request down; retry on next mutation
      }
    }, SAVE_DEBOUNCE_MS);
    (saveTimer as { unref?: () => void }).unref?.();
  });
}
