/**
 * Constant-time string comparison — shared by the edge middleware (API keys)
 * and the node webhook route (HMAC signatures). No node APIs so the edge
 * runtime can import it.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
