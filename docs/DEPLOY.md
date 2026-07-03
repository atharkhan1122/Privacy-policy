# Going live

This is the concrete path from the demo you run locally to a public instance
that takes signups and payments. The Engine Room ships as a single Next.js node
with a file-backed world; nothing here needs a database to start.

- [What you're deploying](#what-youre-deploying)
- [1. Generate your secrets](#1-generate-your-secrets)
- [2. Pick a host](#2-pick-a-host)
- [3. Set the go-live environment](#3-set-the-go-live-environment)
- [4. Deploy with Docker Compose](#4-deploy-with-docker-compose)
- [5. Smoke-test the live instance](#5-smoke-test-the-live-instance)
- [6. Wire up email](#6-wire-up-email)
- [7. Take your first payment](#7-take-your-first-payment)
- [8. Persistence & backups](#8-persistence--backups)
- [Scaling & limits](#scaling--limits)
- [Go-live checklist](#go-live-checklist)

---

## What you're deploying

One container running `next start` (standalone). State lives in a single JSON
snapshot on a mounted volume (`ENGINE_ROOM_DATA`), plus an `accounts.json`
beside it. Features are env-gated and off by default — turning on
`ENGINE_ROOM_AUTH=1` flips the app from open demo to a signed-up product with
Free/Pro plans, per-account worlds, and the `/admin` billing console.

> **Host requirement:** you need a **persistent filesystem** and a **single
> writer**. A VPS or a container platform with a volume is ideal. Ephemeral
> serverless (e.g. plain Vercel functions) will lose the world, accounts, and
> the in-memory mail outbox between invocations — don't use it for the stateful
> node. See [Scaling & limits](#scaling--limits).

---

## 1. Generate your secrets

```bash
# Session cookie signing key (required when auth is on)
openssl rand -hex 32
# Operator key for the /admin console and billing confirm
openssl rand -hex 24
```

Keep these out of git. You'll set them as `ENGINE_ROOM_SESSION_SECRET` and
`ENGINE_ROOM_ADMIN_KEY`.

---

## 2. Pick a host

**Recommended: a small VPS with Docker** (DigitalOcean, Hetzner, Lightsail,
Fly.io with a volume, a Render/Railway persistent service, etc.). Any host that
gives you a persistent disk and lets you run one container works.

Point a domain (e.g. `engine.yourcompany.com`) at it and terminate TLS with a
reverse proxy (Caddy/nginx/Traefik) or the platform's built-in HTTPS. The app
listens on port 3000.

---

## 3. Set the go-live environment

Copy `.env.example` and fill in the product-mode block. The minimum to take
signups:

```bash
ENGINE_ROOM_AUTH=1
ENGINE_ROOM_SESSION_SECRET=<openssl rand -hex 32>
ENGINE_ROOM_ADMIN_KEY=<openssl rand -hex 24>
ENGINE_ROOM_PUBLIC_URL=https://engine.yourcompany.com
ENGINE_ROOM_PERSIST=1
# Optional but recommended:
ENGINE_ROOM_PAYONEER_LINK=https://payoneer.com/pay/your-link
ENGINE_ROOM_EMAIL_WEBHOOK=https://your-email-webhook   # see §6
```

Every variable is documented in [`.env.example`](../.env.example) and the
[README env table](../README.md).

---

## 4. Deploy with Docker Compose

The repo ships a production `Dockerfile` (standalone build, non-root user,
healthcheck) and a `docker-compose.yml` with a `engine-data` volume.

```bash
# on the host, in the repo
cp .env.example .env            # fill in the product-mode values
# either reference ${VARS} from .env in compose, or uncomment the block in
# docker-compose.yml and paste your values
docker compose up --build -d
docker compose logs -f          # watch it boot ("Ready in …")
```

The world persists on the `engine-data` volume at `/data/world.json`, so
restarts and redeploys keep every account and shipment.

For Kubernetes, `deploy/k8s.yaml` has a PVC-backed Deployment (single replica,
`Recreate` strategy) and a `Secret` stub — fill `engine-room-secrets` with the
same variables.

---

## 5. Smoke-test the live instance

Replace `$BASE` with your URL.

```bash
BASE=https://engine.yourcompany.com

# liveness (no auth)
curl -s $BASE/api/health

# anonymous root → marketing page
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" $BASE/

# create an account (also sets the session cookie)
curl -s -c cookies.txt -X POST $BASE/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"you@yourcompany.com","password":"a-strong-password"}'

# confirm the session works and reports your plan
curl -s -b cookies.txt $BASE/api/auth/me
```

Then in a browser: `/welcome` sells the product, `/signup` and `/login` work,
`/pricing` shows Free vs Pro, and `/admin` unlocks with your admin key.

---

## 6. Wire up email

Password reset and email verification go through the mailer seam, which uses the
first configured provider:

**Option A — Resend (recommended, no SDK):**

```bash
RESEND_API_KEY=re_...
ENGINE_ROOM_EMAIL_FROM="Engine Room <noreply@yourdomain.com>"   # verified domain
```

Verify your sending domain in Resend first; until then you can only send to your
own address with the default `onboarding@resend.dev` from.

**Option B — your own webhook:** set `ENGINE_ROOM_EMAIL_WEBHOOK` and the app
POSTs JSON to it — wire it to SendGrid/Postmark/Zapier/Make/your handler:

```json
{ "to": "user@example.com", "subject": "…", "text": "…", "link": "https://…" }
```

**Without either**, every reset/verification link lands in the `/admin` → *Mail
to relay* panel so you can send it manually — fine for a first pilot, not for
scale. A **failed** send also falls back to that panel, so a link is never lost.

Set `ENGINE_ROOM_PUBLIC_URL` so the links point at your real domain.

---

## 7. Take your first payment

The billing loop is manual by design (a personal Payoneer account has no billing
API):

1. A customer signs up (Free) and clicks **Upgrade via Payoneer** on `/pricing`.
   They get a reference like `ER-PRO-acc7-…` and your pay instructions.
2. They pay via your Payoneer "Request a Payment", putting the reference in the
   note.
3. You open **`/admin`**, unlock with your `ENGINE_ROOM_ADMIN_KEY`, find the
   account under **Pending Payoneer upgrades** (matched by reference), and click
   **Confirm payment → Pro**.

That's it — the account is now Pro and every gated feature unlocks. Plan limits
are enforced server-side, so nothing unlocks before you confirm.

---

## 8. Persistence & backups

Everything lives under the data directory (`/data` in Docker):

- `world.json` (default tenant) and `tenant-*.json` (per-account worlds)
- `accounts.json` (accounts, hashed passwords, plan state)

Back these up on a schedule:

```bash
docker run --rm -v engine-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/engine-$(date +%F).tgz -C /data .
```

Restore by extracting back into the volume before starting the container.

---

## Scaling & limits

This is a single-node design, and honestly so:

- **One writer.** The world is an in-process singleton persisted to a file;
  tenancy swaps it per request. Run **one replica** (the k8s manifest uses
  `Recreate`). Two replicas would race the file.
- **In-memory bits.** The rate limiter and the mail-relay outbox live in process
  memory — they reset on restart and aren't shared across nodes.
- **When you outgrow it:** the persistence layer is a seam (see
  [`ARCHITECTURE.md`](../ARCHITECTURE.md) § 1). Swapping the JSON snapshot for
  Postgres (row-level tenancy) is what unlocks multiple nodes; the domain and
  API above that line don't change. Move accounts to the same store and put a
  real email provider behind the mailer seam.

For a pilot with one operator and a book of customers, the single node is the
right amount of machine.

---

## Go-live checklist

- [ ] `ENGINE_ROOM_SESSION_SECRET` and `ENGINE_ROOM_ADMIN_KEY` are strong and secret
- [ ] `ENGINE_ROOM_AUTH=1` and `ENGINE_ROOM_PERSIST=1`
- [ ] `ENGINE_ROOM_PUBLIC_URL` is your real HTTPS domain
- [ ] TLS terminated in front of port 3000
- [ ] Data volume mounted; a backup job is scheduled
- [ ] Email webhook set (or you've committed to relaying via `/admin`)
- [ ] Payoneer link set; you've run one signup → upgrade → confirm end-to-end
- [ ] `/api/health` returns ok; `/welcome`, `/signup`, `/login`, `/admin` all load
- [ ] Single replica only
