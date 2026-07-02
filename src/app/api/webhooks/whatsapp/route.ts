import { NextResponse } from "next/server";
import { badRequest, ensureWorld, ok } from "@/server/api";
import { submitIntake } from "@/core/store";
import { verifySignature } from "@/server/webhook-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/whatsapp — WhatsApp Business API webhook receiver.
 *
 * Accepts the Meta webhook envelope (entry[].changes[].value.messages[]) and
 * drops every text/audio message straight into the intake engine. Voice notes
 * arrive as audio references; in production the transcription step runs
 * before extraction — here the caption/placeholder text is used.
 *
 * GET implements the hub.challenge verification handshake Meta performs when
 * the webhook URL is registered.
 *
 * Authentication: Meta signs every delivery with the app secret
 * (X-Hub-Signature-256: sha256=<hmac-sha256 of the raw body>). When
 * ENGINE_ROOM_WHATSAPP_SECRET is set, deliveries must carry a valid
 * signature (src/server/webhook-auth.ts); unset, the webhook is open (demo
 * mode). This route is exempt from the API-key middleware because Meta
 * cannot send custom headers.
 */

interface WhatsAppWebhook {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          from?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string; caption?: string };
          image?: { id?: string; caption?: string };
          document?: { id?: string; caption?: string; filename?: string };
        }[];
      };
    }[];
  }[];
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.challenge")) {
    // In production, verify hub.verify_token against the configured secret.
    return new Response(params.get("hub.challenge"), { status: 200 });
  }
  return badRequest("Not a verification request");
}

export async function POST(request: Request) {
  ensureWorld();
  const rawBody = await request.text();

  const secret = process.env.ENGINE_ROOM_WHATSAPP_SECRET;
  if (secret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  let payload: WhatsAppWebhook;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhook;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const accepted: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const senderName =
        value.contacts?.[0]?.profile?.name ?? value.contacts?.[0]?.wa_id ?? "WhatsApp sender";
      for (const message of value.messages) {
        let raw: string | undefined;
        let channel: "WHATSAPP" | "VOICE_NOTE" | "IMAGE" | "PDF" = "WHATSAPP";
        switch (message.type) {
          case "text":
            raw = message.text?.body;
            break;
          case "audio":
            channel = "VOICE_NOTE";
            raw = `[voice note · transcription pending] ${message.audio?.caption ?? ""}`.trim();
            break;
          case "image":
            channel = "IMAGE";
            raw = `[image · OCR pending] ${message.image?.caption ?? ""}`.trim();
            break;
          case "document":
            channel = "PDF";
            raw = `[document ${message.document?.filename ?? ""} · OCR pending] ${message.document?.caption ?? ""}`.trim();
            break;
          default:
            continue;
        }
        if (!raw) continue;
        const intake = submitIntake({
          channel,
          from: senderName,
          raw,
        });
        accepted.push(intake.id);
      }
    }
  }

  if (accepted.length === 0) return badRequest("No processable messages in payload");
  return ok({ accepted, count: accepted.length }, 201);
}
