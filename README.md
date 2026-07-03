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
npm test           # domain-core test suite (Vitest)
```

Or deploy it:

```bash
docker compose up --build   # standalone build, durable world on the engine-data volume
```

Or to a cluster: `kubectl apply -f deploy/k8s.yaml` (PVC-backed world,
liveness/readiness probes, secret-fed config).

| Env var | Effect |
|---|---|
| `ENGINE_ROOM_AUTH` | `1` turns on accounts: login/signup, Free vs Pro plans, one tenant world per account, app pages gated behind `/login` |
| `ENGINE_ROOM_SESSION_SECRET` | HMAC key for session cookies (set a strong value when auth is on) |
| `ENGINE_ROOM_ADMIN_KEY` | Operator key for `POST /api/billing/confirm` — flips an account to Pro once a Payoneer payment lands (sent as `x-admin-key`) |
| `ENGINE_ROOM_PAYONEER_LINK` | Optional Payoneer "Request a Payment" link shown on the upgrade screen |
| `ENGINE_ROOM_API_KEYS` | API auth + one isolated tenant world per key (`erk_key:tenant`) |
| `ENGINE_ROOM_WHATSAPP_SECRET` | Require signed WhatsApp webhook deliveries |
| `ANTHROPIC_API_KEY` | Intake extraction through Claude |
| `ENGINE_ROOM_RATE_LIMIT` | Requests/min per caller (off when unset) |
| `ENGINE_ROOM_DATA` / `ENGINE_ROOM_PERSIST` | Snapshot path / `0` disables persistence |

### Accounts, plans & manual Payoneer billing

Off by default — the demo runs open with every feature unlocked. Set
`ENGINE_ROOM_AUTH=1` (plus a `ENGINE_ROOM_SESSION_SECRET`) to turn the platform
into a signed-up product:

- **`/signup`** creates a **Free** account (up to 5 active shipments, agent to
  notch 2, no Night Shift, no trade graph); **`/login`** signs back in. Each
  account gets its own isolated world (`tenant = t_<id>`).
- **`/pricing`** shows Free vs **Pro** ($299/mo — unlimited shipments, the
  autonomous Night Shift, full autonomy, Claude intake, trade graph).
- **Upgrading** uses a **manual Payoneer** flow (built for a personal Payoneer
  account, which has no billing API): the customer clicks *Upgrade via Payoneer*,
  gets a reference like `ER-PRO-acc1-…`, and pays via your Payoneer "Request a
  Payment" (optionally linked with `ENGINE_ROOM_PAYONEER_LINK`). Once the money
  lands you confirm it:
  ```bash
  curl -X POST https://your-host/api/billing/confirm \
    -H "x-admin-key: $ENGINE_ROOM_ADMIN_KEY" \
    -H 'content-type: application/json' \
    -d '{"accountId":"acc1"}'      # flips the account to Pro
  ```
  Plan limits are enforced server-side (a blocked feature returns `402` with
  `{upgrade:true}`), so the gate holds even if the UI is bypassed.
- **Operator console** — visit **`/admin`** and unlock with your
  `ENGINE_ROOM_ADMIN_KEY`. It lists every account, floats pending Payoneer
  upgrades (with their reference) to the top, and confirms a payment → Pro with
  one click (or downgrades). The key is sent as `x-admin-key` per action and
  never leaves the tab — no curl needed for day-to-day billing.

The app boots into a seeded world: a mid-sized Gulf forwarder ("Meridian Cargo LLC,
Dubai") six months into running on the platform, with a live fleet, an intake inbox,
an agent mid-shift and money moving. Timestamps are relative to boot, so the terminal
always feels live.

## The demo loop (2 minutes)

1. **Intake** (`gi`) — two raw messages are waiting: a WhatsApp voice-note transcript
   and a forwarded email chain. Hit **Parse with AI** to see per-field extraction with
   confidence, then **Convert → shipment**. Or type your own inquiry into the **live
   composer** at the top and send it into the engine. With `ANTHROPIC_API_KEY` set,
   parsing runs through Claude (`claude-opus-4-8`, structured outputs via
   `/api/extract`); without it, the deterministic parser takes over — same shape, same
   flow, and the extraction panel shows which engine ran.
2. **Shipment** — open the new object. It's in *Inquiry*. Hit **Run quote engine**:
   rate memory + surcharge resolver + margin brain price it in under a second, with a
   win-probability per option.
3. **Accept an option** — the shipment books, documents generate, an invoice issues
   with a financing offer, ETA prediction engages. One click, four modules fired —
   because they're all the same object.
4. **Agent** (`ga`) — the trust dial per task type, the approval queue (one tap, full
   context), and the shift report. Set quoting to notch 4 and watch new quotes execute
   without you. Then press **▶ Run 8h autonomous shift**: the night shift parses the
   inbox, prices, books inside its ceilings, holds the big booking for 07:00, sends
   delay advisories before customers ask, drafts collections — and files a
   minute-stamped report of the hours it just eliminated.
5. **Portal** (`gp`) — the same shipment, seen from the customer's side.

Keyboard-first: `⌘K` command deck, `⌘J` **Ask the Engine** (conversational assistant
answering from the live shipment graph — try "what's stuck", "what's overdue", a
shipment id, or a customer name), `g` + key chord navigation (`gt` tower, `gs`
shipments, `gq` quotes…).

The Control Tower opens with **"What needs a human — ranked"**: the escalation
engine scores every agent hand-off, stuck shipment, document error, overdue invoice,
expiring quote and unparsed inquiry into one queue, each entry arguing for its own
rank.

## What's real in this codebase

| Layer | Where | What it does |
|---|---|---|
| The Shipment + lifecycle | `src/core/types.ts`, `state-machine.ts` | The single source of truth; seven states; transitions emit events |
| Event bus | `src/core/events.ts` | Typed pub/sub every module listens to |
| AI Intake Engine | `src/core/intake.ts` | Messy text → structured cargo with per-field confidence |
| Claude-backed extraction | `src/app/api/extract/route.ts` | Same extraction via `claude-opus-4-8` structured outputs; auto-fallback to the local parser when no key is set |
| AI Quote Engine | `src/core/quote-engine.ts` | Rate memory, 7-rule surcharge resolver, margin brain, win/loss learning loop |
| AI Logistics Agent | `src/core/agent.ts` | 4-notch autonomy dial per task type, value ceilings, confidence floors, escalation |
| Predictive ETA / delay | `src/core/trade-graph.ts` | Risk scoring from lane congestion, customs drag, carrier performance |
| Trade Intelligence Graph | `src/core/trade-graph.ts` | Lane aggregates with a minimum-density privacy floor (the covenant, in code) |
| Document Intelligence | `src/core/documents.ts` | Auto-generation from the object + cross-document validation |
| Financial Layer | `src/core/finance.ts` | Invoices, receivables aging, credit terms, financing offers, margin analytics |
| The Night Shift | `src/core/store.ts` (`runNightShift`) | 8h autonomous run composed of the same domain commands a human clicks, with a shift report |
| Revenue forecasting | `src/core/forecast.ts` | Booked + probability-weighted quotes + inquiry estimate |
| Escalation engine / prioritization | `src/core/priority.ts` | One ranked queue of everything needing a human, self-explaining scores |
| Conversational assistant | `src/core/assistant.ts` | Grounded Q&A over the world state (⌘J), production seam for tool-calling LLM |
| Control Tower & 8 more views | `src/app/**` | Every screen is a query over the same store |
| The API plane | `src/app/api/**` | The full domain as REST commands — intake → parse → convert → quote → accept → advance, night shift, events, graph — plus a WhatsApp Business webhook receiver. See [docs/API.md](./docs/API.md) |
| The durable world | `src/server/persistence.ts` | Server world hydrates from a disk snapshot on boot and atomically re-saves after every mutation — state survives restarts; the snapshot/restore seam is where Postgres plugs in |
| Multi-tenancy | `src/server/persistence.ts` § Tenancy | One isolated, separately-persisted world per API key (`erk_key:tenant`) — the covenant's "your data is yours" enforced structurally, not by convention |
| One shared world | `src/core/server-sync.ts`, `src/core/commands.ts` | The browser terminal is a live client of the server world: hydrates from `/api/state`, re-pulls on SSE `world-changed` frames, and every button routes through the API — two tabs, curl, and the WhatsApp webhook see the same world. Falls back to local demo mode when no server world answers (the header badge says which) |

The domain core is covered by a Vitest suite (`src/core/*.test.ts` — lifecycle,
intake extraction, pricing & surcharges, agent autonomy policy, finance, graph
privacy floor, priority scoring, assistant grounding), run in CI on every push.

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
