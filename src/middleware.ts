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

export function middleware(request: NextRequest) {
  const entries = parseApiKeys(process.env.ENGINE_ROOM_API_KEYS);
  if (entries.length === 0) return NextResponse.next(); // open demo mode

  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/webhooks/")) return NextResponse.next(); // HMAC-authenticated
  if (path === "/api/health") return NextResponse.next(); // liveness probes carry no key

  const presented = presentedKey(request.headers);
  if (presented && entries.some((entry) => safeEqual(entry.key, presented))) {
    return NextResponse.next();
  }
  return NextResponse.json(
    { error: "Unauthorized — pass an API key via x-api-key or Authorization: Bearer" },
    { status: 401 }
  );
}
