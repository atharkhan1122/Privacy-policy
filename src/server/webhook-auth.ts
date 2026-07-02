import crypto from "crypto";
import { safeEqual } from "./safe-equal";

/**
 * Meta webhook signature verification: X-Hub-Signature-256 carries
 * sha256=<hmac-sha256 of the raw body keyed with the app secret>.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(signatureHeader.slice(7), expected);
}
