import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/safe-equal";

/**
 * API-plane authentication.
 *
 * Set ENGINE_ROOM_API_KEYS to a comma-separated list of keys (any opaque
 * strings; convention: `erk_...`) and every /api route requires one via
 * `x-api-key: <key>` or `Authorization: Bearer <key>`. Unset, the platform
 * runs in open demo mode — same graceful degradation as the Claude seam.
 *
 * The WhatsApp webhook is exempt: Meta cannot send custom headers, so that
 * route authenticates with the X-Hub-Signature-256 HMAC instead (see
 * src/app/api/webhooks/whatsapp/route.ts).
 */

export const config = {
  matcher: "/api/:path*",
};

function configuredKeys(): string[] {
  return (process.env.ENGINE_ROOM_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function middleware(request: NextRequest) {
  const keys = configuredKeys();
  if (keys.length === 0) return NextResponse.next(); // open demo mode

  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/webhooks/")) return NextResponse.next(); // HMAC-authenticated

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const presented = request.headers.get("x-api-key") ?? bearer;

  if (presented && keys.some((k) => safeEqual(k, presented))) {
    return NextResponse.next();
  }
  return NextResponse.json(
    { error: "Unauthorized — pass an API key via x-api-key or Authorization: Bearer" },
    { status: 401 }
  );
}
