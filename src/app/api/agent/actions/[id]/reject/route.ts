import { ensureWorld, notFound, ok } from "@/server/api";
import { reject } from "@/core/agent";
import { forceNotify } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/agent/actions/:id/reject — the human declines. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWorld(request);
  const { id } = await params;
  const action = reject(id);
  if (!action) return notFound(`Unknown agent action ${id}`);
  forceNotify();
  return ok(action);
}
