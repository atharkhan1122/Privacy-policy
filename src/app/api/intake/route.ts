import { badRequest, ensureWorld, ok } from "@/server/api";
import { submitIntake } from "@/core/store";
import type { IntakeChannel } from "@/core/types";

export const dynamic = "force-dynamic";

const CHANNELS: IntakeChannel[] = ["WHATSAPP", "EMAIL", "VOICE_NOTE", "PDF", "IMAGE"];

/** GET /api/intake — the raw inbox. */
export async function GET() {
  const world = ensureWorld();
  return ok({ intake: world.intake, count: world.intake.length });
}

/** POST /api/intake {channel, from, raw} — feed the engine a message. */
export async function POST(request: Request) {
  ensureWorld();
  let body: { channel?: string; from?: string; raw?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.from || !body.raw) return badRequest("from and raw are required");
  const channel = CHANNELS.includes(body.channel as IntakeChannel)
    ? (body.channel as IntakeChannel)
    : "WHATSAPP";
  const message = submitIntake({ channel, from: body.from, raw: body.raw });
  return ok(message, 201);
}
