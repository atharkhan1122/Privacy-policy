import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  CLAUDE_ENGINE,
  NoCredentialsError,
  extractWithClaude,
} from "@/server/claude-extract";

/**
 * LLM-backed intake extraction — the production implementation of the
 * AI Intake Engine seam.
 *
 * POST { raw, from } → IntakeExtraction (same shape the deterministic parser
 * produces, so every consumer is agnostic to which engine ran).
 *
 * Returns 501 when no Anthropic credentials are configured; the client falls
 * back to the deterministic parser and the platform keeps working offline.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { raw?: string; from?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.raw || !body.from) {
    return NextResponse.json({ error: "raw and from are required" }, { status: 400 });
  }

  try {
    const extraction = await extractWithClaude({ raw: body.raw, from: body.from });
    return NextResponse.json({ extraction, engine: CLAUDE_ENGINE });
  } catch (error) {
    if (error instanceof NoCredentialsError) {
      return NextResponse.json(
        { error: "No Anthropic credentials configured; use the local parser." },
        { status: 501 }
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Invalid Anthropic credentials" }, { status: 501 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error: ${error.message}` },
        { status: 502 }
      );
    }
    throw error;
  }
}
