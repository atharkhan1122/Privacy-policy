import Anthropic from "@anthropic-ai/sdk";
import type { IntakeExtraction } from "@/core/types";

/**
 * Server-side Claude extraction — shared by /api/extract and the intake
 * command routes. Throws NoCredentialsError when the platform should fall
 * back to the deterministic parser.
 */

export class NoCredentialsError extends Error {}

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

export const EXTRACTION_SCHEMA = {
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
- origin/destination: return "UNLOCODE City" (e.g. "NGLOS Lagos", "AEJEA Jebel Ali"). Dubai resolves to AEJEA Jebel Ali (it is the platform's location key).
- weightKg: kilograms as a number (convert tons ×1000).
- volumeCbm: cubic meters as a number.
- pieces: package count as a number (pallets, cartons, containers).
- incoterm: one of EXW FCA FAS FOB CFR CIF CPT CIP DAP DPU DDP, or null.
- mode: OCEAN, AIR, or LAND; infer AIR from urgency only at low confidence (≤0.6).
- neededBy: the deadline as written, or null.
- customerName: prefer the sender identity provided.
- Every field: value null when absent (never guess), confidence 0..1, and source = the exact fragment of the message it came from (empty string when null).
- overallConfidence: mean confidence of the non-null fields (0 if none).`;

export function hasClaudeCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export const CLAUDE_ENGINE = "claude-opus-4-8";

export async function extractWithClaude(params: {
  raw: string;
  from: string;
}): Promise<IntakeExtraction> {
  if (!hasClaudeCredentials()) {
    throw new NoCredentialsError("No Anthropic credentials configured");
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CLAUDE_ENGINE,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
    },
    messages: [
      { role: "user", content: `Sender: ${params.from}\n\nMessage:\n${params.raw}` },
    ],
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Empty model response");
  }
  return JSON.parse(text.text) as IntakeExtraction;
}
