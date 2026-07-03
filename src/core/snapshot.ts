import { restoreStore, storeSnapshot, type StoreSnapshot } from "./store";
import { agentSnapshot, restoreAgent, type AgentSnapshot } from "./agent";
import { eventsSnapshot, restoreEvents, type EventsSnapshot } from "./events";
import {
  quoteEngineSnapshot,
  restoreQuoteEngine,
  type QuoteEngineSnapshot,
} from "./quote-engine";
import { graphSnapshot, restoreGraph } from "./trade-graph";
import { documentSeq, restoreDocumentSeq } from "./documents";
import { invoiceSeq, restoreInvoiceSeq } from "./finance";

/**
 * Full-world snapshot/restore — every stateful module in one document.
 * Framework-free so all three consumers share it: server persistence (disk),
 * tenancy swaps, and browser server-sync (the UI as a read-replica of the
 * server world).
 */

export const SNAPSHOT_VERSION = 1;

export interface WorldSnapshotFile {
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

export function captureSnapshot(): WorldSnapshotFile {
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

export function applySnapshot(snapshot: WorldSnapshotFile): void {
  restoreAgent(snapshot.agent);
  restoreEvents(snapshot.events);
  restoreQuoteEngine(snapshot.quoteEngine);
  restoreGraph(snapshot.graph);
  restoreDocumentSeq(snapshot.documentSeq);
  restoreInvoiceSeq(snapshot.invoiceSeq);
  restoreStore(snapshot.store); // last — its notify() wakes subscribers
}
