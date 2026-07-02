# The Engine Room — API Plane

Every route operates the same domain core the terminal UI uses. These
request/response contracts are the service seam: the NestJS services in
[ARCHITECTURE.md](../ARCHITECTURE.md) implement exactly these shapes against
Postgres.

**Durability:** the server world is persisted to disk — hydrated from a
snapshot on boot, atomically re-written (debounced) after every mutation.
Restart the server and shipments, quotes, agent trust, learned margins and
the event history all survive. Configuration:

| Env var | Default | Meaning |
|---|---|---|
| `ENGINE_ROOM_PERSIST` | on | Set `0` to run purely in-memory |
| `ENGINE_ROOM_DATA` | `.data/world.json` | Snapshot path |

The per-module `snapshot()/restore()` functions are the repository
interface — swap the JSON file for Postgres and nothing above the
persistence adapter changes. The browser demo world remains in-memory.

Base URL: wherever the Next.js app runs (`http://localhost:3000` in dev).
All bodies are JSON. Errors return `{ "error": string }` with 400/401/404/501.

## Authentication

| Env var | Effect |
|---|---|
| `ENGINE_ROOM_API_KEYS` | Comma-separated API keys (convention `erk_…`). When set, every `/api` route requires one via `x-api-key: <key>` or `Authorization: Bearer <key>` (constant-time compared). Unset = open demo mode. |
| `ENGINE_ROOM_WHATSAPP_SECRET` | Meta app secret. When set, webhook deliveries must carry a valid `X-Hub-Signature-256` HMAC of the raw body. Unset = open demo mode. |

The webhook route is exempt from the API-key check (Meta cannot send custom
headers) — the HMAC signature is its authentication.

## Multi-tenancy — the covenant, structurally

Every API key addresses its **own isolated world**. Key entries may carry a
tenant alias (`erk_abc:meridian`); without one the tenant id derives from the
key. A brand-new tenant starts from the pristine seeded world (the genesis
snapshot); each tenant persists to its own file (`tenant-<id>.json` beside
the default `world.json`). One key can never read another key's shipments,
rates, margins, or events — `GET /api/whoami` reports which tenant a key
addresses. Unkeyed webhook traffic lands in the `default` tenant.

Implementation note: the active tenant's world lives in the domain
singletons and swaps atomically per request (persist-out, hydrate-in) —
sound for Node's single-threaded execution; the Postgres implementation
replaces the swap with row-level security (ARCHITECTURE.md § 4).

| Method | Path | Description |
|---|---|---|
| GET | `/api/whoami` | `{tenant, persisted, shipments, intake, hoursEliminated}` for the presenting key |

## The shipment (read)

| Method | Path | Description |
|---|---|---|
| GET | `/api/shipments` | The fleet. Optional `?state=INQUIRY\|QUOTE\|BOOKING\|DOCUMENTATION\|TRANSIT\|CUSTOMS\|SETTLEMENT` |
| GET | `/api/shipments/:id` | The object with every derived view attached: customer, quotes, documents, invoices, tracking, agent actions, events |
| GET | `/api/events?limit=50` | The event bus, newest first (max 500) |
| GET | `/api/events/stream?replay=20` | The event bus over **Server-Sent Events**: a `hello` frame, the last `replay` events (max 100), then every live event as it is emitted, with 15s heartbeats. `curl -N localhost:3000/api/events/stream?replay=20` and watch commands land in real time |
| GET | `/api/quotes` | Every quote on the wire |
| GET | `/api/intake` | The raw inbox |
| GET | `/api/graph` | Trade intelligence: lane aggregates (already privacy-floored) + carrier scorecards |
| GET | `/api/health` | Liveness for load balancers / k8s probes — unauthenticated, reveals nothing tenant-scoped |

## Commands (write)

| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/api/intake` | `{channel?, from, raw}` | Feed the engine a raw message (201) |
| POST | `/api/intake/:id/parse` | — | Structure it — Claude when `ANTHROPIC_API_KEY` is set, deterministic parser otherwise; `parsedBy` says which ran |
| POST | `/api/intake/:id/convert` | — | Parsed message → live shipment in `INQUIRY` (201) |
| POST | `/api/shipments/:id/quote` | — | Run the quote engine (201, returns the quote) |
| POST | `/api/quotes/:id/accept` | `{optionId}` | The customer's tap: books the carrier, generates documents, issues the invoice, engages the ETA model — one command, four modules |
| POST | `/api/shipments/:id/advance` | — | One lifecycle transition forward (400 if an exception blocks it or the state is terminal) |
| POST | `/api/shipments/:id/tracking` | `{location, description, isException?, at?}` | Inbound carrier/EDI tracking. An exception flags the shipment (blocking advance), re-scores the ETA, and queues an agent recovery proposal (201) |
| POST | `/api/shipments/:id/resolve-exception` | — | Recovery executed — unblock the shipment |
| POST | `/api/night-shift` | — | Run the 8-hour autonomous shift; returns the minute-stamped shift report |
| POST | `/api/extract` | `{raw, from}` | Standalone Claude extraction (501 without credentials — callers fall back to the local parser) |

## Webhooks

| Method | Path | Description |
|---|---|---|
| GET | `/api/webhooks/whatsapp` | Meta verification handshake (`hub.challenge` echo) |
| POST | `/api/webhooks/whatsapp` | WhatsApp Business API envelope (`entry[].changes[].value.messages[]`). Text, audio, image and document messages drop into intake (voice notes and images are tagged `transcription/OCR pending` — that step precedes extraction in production) |

## The canonical flow

```bash
# A customer messages you on WhatsApp…
curl -sX POST localhost:3000/api/webhooks/whatsapp -H 'content-type: application/json' -d '{
  "entry":[{"changes":[{"value":{
    "contacts":[{"profile":{"name":"Adeyemi Machinery Ltd"}}],
    "messages":[{"type":"text","text":{"body":"3 pallets machine parts, 1,240 kg, from Lagos to Jebel Ali by air, CIF, before 15 Jul"}}]
  }}]}]}'
# → {"accepted":["in-101"],"count":1}

curl -sX POST localhost:3000/api/intake/in-101/parse     # structure it
curl -sX POST localhost:3000/api/intake/in-101/convert   # → ENG-2026-0849 in INQUIRY
curl -sX POST localhost:3000/api/shipments/ENG-2026-0849/quote   # → Q-100x with options
curl -sX POST localhost:3000/api/quotes/Q-100x/accept -H 'content-type: application/json' \
  -d '{"optionId":"qo-x"}'   # booked, documents generated, invoice issued
```

Or skip the choreography entirely:

```bash
curl -sX POST localhost:3000/api/night-shift   # the machine runs the shift and files the report
```
