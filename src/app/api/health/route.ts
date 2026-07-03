import { NextResponse } from "next/server";
import { persistenceEnabled } from "@/server/persistence";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * GET /api/health — liveness for load balancers and Kubernetes probes.
 * Unauthenticated by design (exempted in the middleware): it reveals nothing
 * tenant-scoped, only that the process is up.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    persistence: persistenceEnabled(),
  });
}
