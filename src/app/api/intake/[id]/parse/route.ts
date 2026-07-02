import { badRequest, ensureWorld, notFound, ok } from "@/server/api";
import { forceNotify, parseIntake } from "@/core/store";
import { extractWithClaude, hasClaudeCredentials, CLAUDE_ENGINE } from "@/server/claude-extract";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake/:id/parse — structure the message. Claude when
 * credentials exist, the deterministic parser otherwise.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const world = ensureWorld();
  const { id } = await params;
  const message = world.intake.find((m) => m.id === id);
  if (!message) return notFound(`Unknown intake message ${id}`);
  if (message.status !== "NEW") return badRequest(`Message ${id} is ${message.status}`);

  if (hasClaudeCredentials()) {
    try {
      message.extraction = await extractWithClaude({ raw: message.raw, from: message.from });
      message.status = "PARSED";
      message.parsedBy = CLAUDE_ENGINE;
      forceNotify();
      return ok(message);
    } catch {
      // fall through to the deterministic parser
    }
  }
  parseIntake(id);
  return ok(message);
}
