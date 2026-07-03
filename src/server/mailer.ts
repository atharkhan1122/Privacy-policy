/**
 * Email seam. Same graceful-degradation pattern as the Claude and Payoneer
 * seams: if ENGINE_ROOM_EMAIL_WEBHOOK is set, outbound mail is POSTed there as
 * JSON (point it at Resend/SendGrid/Postmark or a Zapier/Make webhook). With
 * nothing configured, messages land in an in-memory outbox the operator console
 * reads, so a self-hosted single node can still run password resets by relaying
 * the link out-of-band. Swap this file for a real provider and nothing above it
 * changes.
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
const outboxStore: OutboxEntry[] = [];

export function emailConfigured(): boolean {
  return !!process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
}

/** The recent operator-relay outbox (only populated when no webhook is set). */
export function outbox(): OutboxEntry[] {
  return [...outboxStore].reverse(); // newest first
}

export async function deliver(email: OutgoingEmail): Promise<void> {
  const webhook = process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(email),
      });
    } catch {
      // A failed send must not take the request down; the user still gets the
      // generic "if that email exists…" response.
    }
    return;
  }
  // No provider — record for the operator to relay, and log for good measure.
  outboxStore.push({ ...email, at: new Date().toISOString() });
  if (outboxStore.length > OUTBOX_LIMIT) outboxStore.shift();
  // eslint-disable-next-line no-console
  console.log(`[engine-room mail] to=${email.to} subject="${email.subject}"${email.link ? ` link=${email.link}` : ""}`);
}
