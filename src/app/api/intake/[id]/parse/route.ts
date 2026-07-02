import { badRequest, ensureWorld, notFound, ok } from "@/server/api";
import { forceNotify, parseIntake } from "@/core/store";
import { extractWithClaude, hasClaudeCredentials, CLAUDE_ENGINE } from "@/server/claude-extract";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake/:id/parse — structure the message. Claude when
 * credentials exist, the deterministic parser otherwise.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const world = ensureWorld(request);
  const { id } = await params;
  const message = world.intake.find((m) => m.id === id);
  if (!message) return notFound(`Unknown intake message ${id}`);
  if (message.status !== "NEW") return badRequest(`Message ${id} is ${message.status}`);

  if (hasClaudeCredentials()) {
    try {
      const extraction = await extractWithClaude({ raw: message.raw, from: message.from });
      // Another tenant may have been activated during the await; re-activate
      // ours and re-find the message in the (possibly re-hydrated) world.
      const fresh = ensureWorld(request).intake.find((m) => m.id === id);
      if (!fresh) return notFound(`Unknown intake message ${id}`);
      if (fresh.status === "NEW") {
        fresh.extraction = extraction;
        fresh.status = "PARSED";
        fresh.parsedBy = CLAUDE_ENGINE;
        forceNotify();
      }
      return ok(fresh);
    } catch {
      ensureWorld(request); // restore our tenant before the local fallback
      // fall through to the deterministic parser
    }
  }
  parseIntake(id);
  const parsed = ensureWorld(request).intake.find((m) => m.id === id);
  return ok(parsed ?? message);
}
