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
All bodies are JSON. Errors return `{ "error": string }` with 400/404/501.

## The shipment (read)

| Method | Path | Description |
|---|---|---|
| GET | `/api/shipments` | The fleet. Optional `?state=INQUIRY\|QUOTE\|BOOKING\|DOCUMENTATION\|TRANSIT\|CUSTOMS\|SETTLEMENT` |
| GET | `/api/shipments/:id` | The object with every derived view attached: customer, quotes, documents, invoices, tracking, agent actions, events |
| GET | `/api/events?limit=50` | The event bus, newest first (max 500) |
| GET | `/api/quotes` | Every quote on the wire |
| GET | `/api/intake` | The raw inbox |
| GET | `/api/graph` | Trade intelligence: lane aggregates (already privacy-floored) + carrier scorecards |

## Commands (write)

| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/api/intake` | `{channel?, from, raw}` | Feed the engine a raw message (201) |
| POST | `/api/intake/:id/parse` | — | Structure it — Claude when `ANTHROPIC_API_KEY` is set, deterministic parser otherwise; `parsedBy` says which ran |
| POST | `/api/intake/:id/convert` | — | Parsed message → live shipment in `INQUIRY` (201) |
| POST | `/api/shipments/:id/quote` | — | Run the quote engine (201, returns the quote) |
| POST | `/api/quotes/:id/accept` | `{optionId}` | The customer's tap: books the carrier, generates documents, issues the invoice, engages the ETA model — one command, four modules |
| POST | `/api/shipments/:id/advance` | — | One lifecycle transition forward (400 if an exception blocks it or the state is terminal) |
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
