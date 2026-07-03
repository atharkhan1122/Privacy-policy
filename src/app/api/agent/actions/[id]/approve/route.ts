import { ensureWorld, notFound, ok } from "@/server/api";
import { approve } from "@/core/agent";
import { forceNotify } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/agent/actions/:id/approve — the one-tap human approval. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureWorld(request);
  const { id } = await params;
  const action = approve(id);
  if (!action) return notFound(`Unknown agent action ${id}`);
  forceNotify();
  return ok(action);
}
