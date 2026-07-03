import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/safe-equal";
import { parseApiKeys, presentedKey } from "@/server/api-keys";

/**
 * API-plane authentication.
 *
 * Set ENGINE_ROOM_API_KEYS to a comma-separated list of `key` or
 * `key:tenant` entries (any opaque strings; convention: `erk_...`) and every
 * /api route requires a key via `x-api-key: <key>` or
 * `Authorization: Bearer <key>`. Each key addresses its own isolated tenant
 * world (see src/server/persistence.ts). Unset, the platform runs in open
 * demo mode — same graceful degradation as the Claude seam.
 *
 * The WhatsApp webhook is exempt: Meta cannot send custom headers, so that
 * route authenticates with the X-Hub-Signature-256 HMAC instead (see
 * src/app/api/webhooks/whatsapp/route.ts).
 */

export const config = {
  matcher: "/api/:path*",
};

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

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const presented = presentedKey(request.headers);

  const limit = rateLimitPerMinute();
  if (limit > 0 && path !== "/api/health") {
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
