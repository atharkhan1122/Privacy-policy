import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { IntakeExtraction } from "@/core/types";

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

const FIELD = {
  type: "object",
  properties: {
    value: { type: ["string", "number", "null"] },
    confidence: { type: "number" },
    source: { type: "string" },
  },
  required: ["value", "confidence", "source"],
  additionalProperties: false,
} as const;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    origin: FIELD,
    destination: FIELD,
    commodity: FIELD,
    weightKg: FIELD,
    volumeCbm: FIELD,
    pieces: FIELD,
    incoterm: FIELD,
    mode: FIELD,
    neededBy: FIELD,
    customerName: FIELD,
    overallConfidence: { type: "number" },
  },
  required: [
    "origin", "destination", "commodity", "weightKg", "volumeCbm", "pieces",
    "incoterm", "mode", "neededBy", "customerName", "overallConfidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the intake reader of a freight forwarding operating system. You convert messy human shipping inquiries — WhatsApp voice-note transcripts, forwarded email chains, OCR'd packing lists — into structured shipment data.

Rules:
- origin/destination: return "UNLOCODE City" (e.g. "NGLOS Lagos", "AEJEA Jebel Ali"). Dubai resolves to AEJEA Jebel Ali for sea, but keep it AEJEA Jebel Ali for air too (it is the platform's location key).
- weightKg: kilograms as a number (convert tons ×1000).
- volumeCbm: cubic meters as a number.
- pieces: package count as a number (pallets, cartons, containers).
- incoterm: one of EXW FCA FAS FOB CFR CIF CPT CIP DAP DPU DDP, or null.
- mode: OCEAN, AIR, or LAND; infer AIR from urgency only at low confidence (≤0.6).
- neededBy: the deadline as written, or null.
- customerName: prefer the sender identity provided.
- Every field: value null when absent (never guess), confidence 0..1, and source = the exact fragment of the message it came from (empty string when null).
- overallConfidence: mean confidence of the non-null fields (0 if none).`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "No Anthropic credentials configured; use the local parser." },
      { status: 501 }
    );
  }

  let body: { raw?: string; from?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.raw || !body.from) {
    return NextResponse.json({ error: "raw and from are required" }, { status: 400 });
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Sender: ${body.from}\n\nMessage:\n${body.raw}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json({ error: "Empty model response" }, { status: 502 });
    }
    const extraction = JSON.parse(text.text) as IntakeExtraction;
    return NextResponse.json({ extraction, engine: "claude-opus-4-8" });
  } catch (error) {
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
