# The Engine Room — Enterprise Architecture

This document is the scale-out blueprint: how the domain core in `src/core` maps onto
an event-driven microservice estate. The rule that governs everything: **the shipment
is the aggregate root of the entire system.** No service owns data that is not
derivable from, or attached to, a shipment.

## 0. What this repository already implements

The blueprint below is not all future tense — each concern has a working,
tested implementation in this repo, behind the same seam its production
counterpart plugs into:

| Concern | Here (working) | Production (this document) |
|---|---|---|
| Event backbone | In-memory typed bus + SSE stream w/ replay (`src/core/events.ts`, `/api/events/stream`) | Kafka/NATS topics, outbox pattern |
| Persistence | Atomic full-world snapshots to disk, hydrate on boot (`src/server/persistence.ts`) | Postgres, schema-per-service |
| Tenancy | One isolated world per API key, per-tenant files, genesis seeding | Row-level security |
| AuthN | API keys (constant-time) + WhatsApp HMAC + opt-in rate limiting (`src/middleware.ts`) | Gateway authn/z |
| Intake AI | Claude structured outputs w/ deterministic fallback (`src/server/claude-extract.ts`) | Multimodal LLM pipeline + review queue |
| Margin model | Win/loss log + logistic win-probability (`src/core/quote-engine.ts`) | Trained model on the quote stream |
| Agent | 4-notch policy engine + night shift (`src/core/agent.ts`, `runNightShift`) | Multi-agent workflow w/ RAG, same policy layer |
| Channels | WhatsApp Business webhook (verification + signatures) | + email, SMS, push |
| Clients | Terminal UI as a live API client (server-sync), REST, SSE | + NestJS service consumers |
| Deploy | Dockerfile (standalone, non-root, healthcheck), compose, k8s manifest | EKS, Terraform, HPA |

## 1. System topology

```
                        ┌─────────────────────────────────────────────┐
                        │                EDGE / CHANNELS              │
                        │  WhatsApp Business API · Email (IMAP/Graph) │
                        │  SMS · Push · Customer Portal · Ops Terminal│
                        └──────────────────┬──────────────────────────┘
                                           │
                        ┌──────────────────▼──────────────────────────┐
                        │              API GATEWAY (NestJS)           │
                        │   authn/z · rate limiting · tenant scoping  │
                        └──────────────────┬──────────────────────────┘
                                           │
        ┌──────────────────────────────────┼───────────────────────────────────┐
        │                       EVENT BACKBONE (Kafka / NATS)                  │
        │   topic per lifecycle event · outbox pattern · exactly-once consumers│
        └───┬────────┬────────┬────────┬────────┬────────┬────────┬────────────┘
            │        │        │        │        │        │        │
        ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼────┐
        │Intake│ │Quote │ │Ship- │ │Docs   │ │Agent │ │Fin-  │ │Graph  │
        │ svc  │ │ svc  │ │ment  │ │ svc   │ │ svc  │ │ance  │ │ svc   │
        │      │ │      │ │ svc  │ │       │ │      │ │ svc  │ │       │
        └──────┘ └──────┘ └──────┘ └───────┘ └──────┘ └──────┘ └───────┘
           Postgres (per-service schema) · Redis (hot state, queues, idempotency)
           S3 (documents, media) · pgvector / Pinecone (embeddings)
```

- **Frontend**: Next.js + React + TypeScript + TailwindCSS (this repo's `src/app` is
  the terminal). Server components for read paths, WebSocket/SSE fan-out for the event
  feed — the UI's `useWorld()` subscription maps 1:1 onto a socket subscription.
- **Backend**: NestJS services, one per bounded context above. Each service consumes
  lifecycle events and emits its own; none call each other synchronously except via
  the gateway for command paths.
- **Data**: PostgreSQL as system of record (schema-per-service, shipment_id foreign
  everywhere), Redis for hot state and idempotency keys, S3 for document blobs,
  a vector store for retrieval.
- **Infra**: Docker images per service, Kubernetes (EKS), HPA on consumer lag,
  multi-AZ. Terraform-managed AWS.

## 2. The shipment service (the atom)

Owns the `shipments` table and the state machine — the only component allowed to
transition state. Transitions are commands (`AdvanceShipment`, `OpenException`);
every transition writes an event to the outbox in the same transaction. The seven
states and the transition guards are exactly `src/core/state-machine.ts`.

Event catalogue = `ShipmentEventType` in `src/core/types.ts`. Consumers:

| Event | Consumers |
|---|---|
| `shipment.created` | quote svc (auto-quote trigger), graph svc, notifications |
| `quote.accepted` | shipment svc (advance), finance svc (invoice), docs svc (generate) |
| `booking.confirmed` | tracking ingestion, portal notifications |
| `tracking.exception` | agent svc (recovery playbooks), portal, notifications |
| `customs.cleared` | shipment svc, finance svc (duty settlement) |
| `payment.received` | finance svc, graph svc (payment-behaviour learning) |
| `shipment.state_changed → SETTLEMENT` | graph svc (`learn()`, +N observations) |

## 3. AI plane

Three seams in the domain core are LLM-backed in production; the interfaces do not change:

1. **Intake** (`extract()`): multimodal pipeline — WhatsApp media → transcription
   (voice notes) / OCR (packing-list photos, PDFs) → LLM structured-output extraction
   into `IntakeExtraction`, preserving per-field confidence and source spans. Human
   review queue below a confidence floor.
2. **Margin brain** (`suggestMarginPct`, `winProbability`): gradient-boosted model over
   win/loss history features (lane, customer segment, urgency, demand index), retrained
   on the `quote.{won,lost,expired}` stream. The logistic shape in code is the
   production model's contract.
3. **Agent** (`propose()`): a multi-agent workflow (planner → tool-calling executor →
   verifier) with RAG over the trade graph and the tenant's operational history. The
   four-notch grant table, value ceilings and the 85% confidence floor are enforced
   *outside* the model in the agent service — the model proposes, deterministic policy
   disposes. Escalations carry full context to a one-tap approval surface.

Conversational assistant and voice-to-action ride the same agent service with the
channel adapters as I/O.

## 4. The covenant, enforced in infrastructure

- Row-level security by tenant on every table; no cross-tenant query path exists.
- The graph service is the only consumer allowed to aggregate across tenants, and it
  publishes only lane-level statistics gated by a minimum-density threshold
  (`MIN_DENSITY` in `src/core/trade-graph.ts`) so no single firm's position can be
  reverse-read.
- Full data export is a first-class, always-available endpoint. A door left unlocked
  is the reason nobody leaves.

## 5. Delivery roadmap

| Phase | Ships | Wedge |
|---|---|---|
| 1 | Intake + Quote engine + shipment object | The 60-second quote |
| 2 | Docs, tracking, control tower, portal | The workflow |
| 3 | Invoicing, payments, financing | The money |
| 4 | Trade graph, predictive ETA/delay, margin optimization | The intelligence |
| 5 | Agent notches 1→4, autonomous night shift | The employee |

Each layer sells the next one for free: CAC(n+1) → 0, LTV(n+1) > LTV(n). The sequence
only compounds if it holds.
