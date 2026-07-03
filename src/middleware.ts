import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/safe-equal";
import { parseApiKeys, presentedKey } from "@/server/api-keys";
import { SESSION_COOKIE, verifySession } from "@/server/session";

/**
 * Two authentication planes, both opt-in and independent:
 *
 *  1. Accounts (ENGINE_ROOM_AUTH=1) — HMAC session cookies gate the app pages
 *     (logged-out visitors are redirected to /login) and address each account's
 *     own tenant world. This is the login / Free-vs-Pro plane.
 *
 *  2. API keys (ENGINE_ROOM_API_KEYS) — a comma-separated list of `key` or
 *     `key:tenant` entries for partner/integration access to the /api plane via
 *     `x-api-key` or `Authorization: Bearer`.
 *
 * Both off, the platform runs in open demo mode — the same graceful degradation
 * as the Claude seam. The WhatsApp webhook is always exempt (Meta cannot send
 * custom headers; it authenticates with its X-Hub-Signature-256 HMAC instead).
 */

export const config = {
  // Everything except Next internals and static asset files. Covers pages + /api.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};

// The admin console authenticates with the operator key, not a customer
// session, so it stands outside the session gate.
const PUBLIC_PAGES = new Set([
  "/welcome",
  "/login",
  "/signup",
  "/pricing",
  "/admin",
  "/forgot",
  "/reset",
]);
// Endpoints reachable without a session: auth flow, liveness, and the
// admin-keyed billing confirm (it enforces its own admin key). The webhook
// (HMAC) and the /api/admin/ plane are handled by prefix below.
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/health",
  "/api/billing/confirm",
]);

function authEnabled(): boolean {
  return process.env.ENGINE_ROOM_AUTH === "1";
}

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

// ─── Rate limiting (opt-in) ──────────────────────────────────────────────────
// ENGINE_ROOM_RATE_LIMIT=<requests per minute> arms a fixed-window counter
// per caller (API key when presented, else client IP), per middleware
// instance. Good enough for a single node; the production estate rate-limits
// at the gateway (ARCHITECTURE.md § 1).

interface RateWindow {
  windowStart: number;
  count: number;
}

const rateKey = "__engineRoomRate" as const;
const g = globalThis as { [rateKey]?: Map<string, RateWindow> };

export function rateLimitPerMinute(): number {
  const raw = parseInt(process.env.ENGINE_ROOM_RATE_LIMIT ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function rateLimited(caller: string, limit: number, now = Date.now()): boolean {
  const windows = (g[rateKey] ??= new Map());
  const window = windows.get(caller);
  if (!window || now - window.windowStart >= 60_000) {
    windows.set(caller, { windowStart: now, count: 1 });
    if (windows.size > 10_000) windows.clear(); // unbounded-caller backstop
    return false;
  }
  window.count += 1;
  return window.count > limit;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path === "/api" || path.startsWith("/api/");
  const presented = presentedKey(request.headers);

  // Rate limiting applies to the API plane only.
  const limit = rateLimitPerMinute();
  if (isApi && limit > 0 && path !== "/api/health") {
    const caller =
      presented ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anonymous";
    if (rateLimited(caller, limit)) {
      return NextResponse.json(
        { error: `Rate limit exceeded (${limit}/min)` },
        { status: 429, headers: { "retry-after": "60" } }
      );
    }
  }

  // ── Accounts plane ──────────────────────────────────────────────────────────
  if (authEnabled()) {
    const accountId = await verifySession(
      cookieValue(request.headers.get("cookie"), SESSION_COOKIE)
    );

    if (!isApi) {
      if (PUBLIC_PAGES.has(path)) return NextResponse.next();
      if (!accountId) {
        const url = request.nextUrl.clone();
        // Anonymous visitors land on the marketing page; a deep link into the
        // app remembers where it was headed and sends them to sign in.
        if (path === "/") {
          url.pathname = "/welcome";
          url.search = "";
        } else {
          url.pathname = "/login";
          url.search = `?next=${encodeURIComponent(path)}`;
        }
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // API under auth: public endpoints, the webhook, and the admin-keyed
    // console plane always pass (each enforces its own auth downstream).
    if (
      path.startsWith("/api/webhooks/") ||
      path.startsWith("/api/admin/") ||
      PUBLIC_API.has(path)
    ) {
      return NextResponse.next();
    }
    // A valid session addresses that account's tenant world.
    if (accountId) {
      const headers = new Headers(request.headers);
      headers.set("x-engine-account", accountId);
      return NextResponse.next({ request: { headers } });
    }
    // No session — allow a valid partner API key, else reject.
    const entries = parseApiKeys(process.env.ENGINE_ROOM_API_KEYS);
    if (entries.length > 0 && presented && entries.some((e) => safeEqual(e.key, presented))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  // ── API-key plane (auth off) ────────────────────────────────────────────────
  if (!isApi) return NextResponse.next(); // pages are open when accounts are off

  const entries = parseApiKeys(process.env.ENGINE_ROOM_API_KEYS);
  if (entries.length === 0) return NextResponse.next(); // open demo mode

  if (path.startsWith("/api/webhooks/")) return NextResponse.next(); // HMAC-authenticated
  if (path === "/api/health") return NextResponse.next(); // liveness probes carry no key

  if (presented && entries.some((entry) => safeEqual(entry.key, presented))) {
    return NextResponse.next();
  }
  return NextResponse.json(
    { error: "Unauthorized — pass an API key via x-api-key or Authorization: Bearer" },
    { status: 401 }
  );
}
