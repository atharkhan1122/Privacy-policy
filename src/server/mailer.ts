/**
 * Email seam. Graceful degradation, same as the Claude/Payoneer seams. Delivery
 * picks the first configured provider:
 *
 *   1. Resend      — RESEND_API_KEY (+ ENGINE_ROOM_EMAIL_FROM). REST over fetch,
 *                    no SDK dependency.
 *   2. Webhook     — ENGINE_ROOM_EMAIL_WEBHOOK. POST the message as JSON; point
 *                    it at SendGrid/Postmark/Zapier/Make/your own handler.
 *   3. Outbox      — nothing configured: record in memory for the operator to
 *                    relay from /admin, so a single self-hosted node still works.
 *
 * Add another provider by extending deliver(); nothing above this file changes.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  link?: string;
}

export interface OutboxEntry extends OutgoingEmail {
  at: string;
}

const OUTBOX_LIMIT = 50;
const SEND_TIMEOUT_MS = 5000;
const outboxStore: OutboxEntry[] = [];

function resendKey(): string | undefined {
  return process.env.RESEND_API_KEY || undefined;
}

function webhookUrl(): string | undefined {
  return process.env.ENGINE_ROOM_EMAIL_WEBHOOK || undefined;
}

/** Which delivery path is live — drives the /admin outbox panel visibility. */
export function emailProvider(): "resend" | "webhook" | "outbox" {
  if (resendKey()) return "resend";
  if (webhookUrl()) return "webhook";
  return "outbox";
}

export function emailConfigured(): boolean {
  return emailProvider() !== "outbox";
}

/** The recent operator-relay outbox (only populated with no real provider). */
export function outbox(): OutboxEntry[] {
  return [...outboxStore].reverse(); // newest first
}

async function sendViaResend(key: string, email: OutgoingEmail): Promise<void> {
  const from = process.env.ENGINE_ROOM_EMAIL_FROM || "Engine Room <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}

async function sendViaWebhook(url: string, email: OutgoingEmail): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(email),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Email webhook ${res.status}`);
}

export async function deliver(email: OutgoingEmail): Promise<void> {
  const key = resendKey();
  const url = webhookUrl();

  if (key || url) {
    try {
      if (key) await sendViaResend(key, email);
      else if (url) await sendViaWebhook(url, email);
      return;
    } catch (err) {
      // A failed send must never take the request down — the user still gets the
      // generic "if that email exists…" response. Log so the operator can see it,
      // and fall through to the outbox so the link isn't lost.
      // eslint-disable-next-line no-console
      console.error(`[engine-room mail] delivery failed, falling back to outbox: ${String(err)}`);
    }
  }

  // No provider (or a failed send) — record for the operator to relay.
  outboxStore.push({ ...email, at: new Date().toISOString() });
  if (outboxStore.length > OUTBOX_LIMIT) outboxStore.shift();
  // eslint-disable-next-line no-console
  console.log(`[engine-room mail] to=${email.to} subject="${email.subject}"${email.link ? ` link=${email.link}` : ""}`);
}
