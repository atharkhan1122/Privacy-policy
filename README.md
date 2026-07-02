# The Engine Room

**The AI operating system for global freight.**

This is not a CRM. This is not a freight management tool. The entire universe of the
platform revolves around exactly one object — **the shipment** — moving through seven
states:

```
Inquiry → Quote → Booking → Documentation → Transit → Customs → Settlement
```

Every screen, workflow, automation, document, invoice, AI action and dollar of revenue
is simply another view of a shipment in its lifecycle. Every state transition emits an
event; automations, the agent, the financial layer and the trade graph all listen.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck
```

The app boots into a seeded world: a mid-sized Gulf forwarder ("Meridian Cargo LLC,
Dubai") six months into running on the platform, with a live fleet, an intake inbox,
an agent mid-shift and money moving. Timestamps are relative to boot, so the terminal
always feels live.

## The demo loop (2 minutes)

1. **Intake** (`gi`) — two raw messages are waiting: a WhatsApp voice-note transcript
   and a forwarded email chain. Hit **Parse with AI** to see per-field extraction with
   confidence, then **Convert → shipment**.
2. **Shipment** — open the new object. It's in *Inquiry*. Hit **Run quote engine**:
   rate memory + surcharge resolver + margin brain price it in under a second, with a
   win-probability per option.
3. **Accept an option** — the shipment books, documents generate, an invoice issues
   with a financing offer, ETA prediction engages. One click, four modules fired —
   because they're all the same object.
4. **Agent** (`ga`) — the trust dial per task type, the approval queue (one tap, full
   context), and the shift report. Set quoting to notch 4 and watch new quotes execute
   without you.
5. **Portal** (`gp`) — the same shipment, seen from the customer's side.

Keyboard-first: `⌘K` command deck, `g` + key chord navigation (`gt` tower, `gs`
shipments, `gq` quotes…).

## What's real in this codebase

| Layer | Where | What it does |
|---|---|---|
| The Shipment + lifecycle | `src/core/types.ts`, `state-machine.ts` | The single source of truth; seven states; transitions emit events |
| Event bus | `src/core/events.ts` | Typed pub/sub every module listens to |
| AI Intake Engine | `src/core/intake.ts` | Messy text → structured cargo with per-field confidence |
| AI Quote Engine | `src/core/quote-engine.ts` | Rate memory, 7-rule surcharge resolver, margin brain, win/loss learning loop |
| AI Logistics Agent | `src/core/agent.ts` | 4-notch autonomy dial per task type, value ceilings, confidence floors, escalation |
| Predictive ETA / delay | `src/core/trade-graph.ts` | Risk scoring from lane congestion, customs drag, carrier performance |
| Trade Intelligence Graph | `src/core/trade-graph.ts` | Lane aggregates with a minimum-density privacy floor (the covenant, in code) |
| Document Intelligence | `src/core/documents.ts` | Auto-generation from the object + cross-document validation |
| Financial Layer | `src/core/finance.ts` | Invoices, receivables aging, credit terms, financing offers, margin analytics |
| Control Tower & 8 more views | `src/app/**` | Every screen is a query over the same store |

The AI seams are deliberate: `intake.extract()`, the margin brain, and ETA scoring are
deterministic implementations behind the exact interfaces an LLM/RAG stack plugs into.
Swap the internals, keep every consumer. See **[ARCHITECTURE.md](./ARCHITECTURE.md)**
for the full enterprise blueprint (NestJS microservices, Postgres/Redis, Kubernetes,
WhatsApp Business API, vector retrieval, multi-agent workflows).

## Success metrics

Not users. **Shipments completed. Documents exchanged. Transactions processed. Revenue
generated. Human hours eliminated.** The customer should sleep while the platform wins
business, books shipments, prepares documents, monitors exceptions and queues decisions
for one-tap morning approval.
