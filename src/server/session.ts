/**
 * Signed session tokens — isomorphic (Web Crypto), usable from both the edge
 * middleware and node route handlers. Format:
 * <accountId>.<issuedAt>.<base64url-hmac>.
 *
 * This is demo-grade auth suitable for pilots: HMAC-signed httpOnly cookies,
 * scrypt-hashed passwords (see accounts.ts). For large-scale production you
 * would front this with a managed identity provider; the seam is the same.
 *
 * No node APIs (no Buffer) — btoa/TextEncoder/crypto.subtle only — so the edge
 * middleware can verify a session without pulling in the node runtime.
 */

export const SESSION_COOKIE = "er_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const configured = process.env.ENGINE_ROOM_SESSION_SECRET;
  if (configured && configured.length > 0) return configured;
  // Fail closed: a known default would let anyone forge a session for any
  // account. In product mode the secret is mandatory; only the open demo
  // (auth off) may fall back to the throwaway dev key.
  if (process.env.ENGINE_ROOM_AUTH === "1") {
    throw new Error(
      "ENGINE_ROOM_SESSION_SECRET must be set when ENGINE_ROOM_AUTH=1 (generate one with `openssl rand -hex 32`)"
    );
  }
  return "engine-room-dev-session-secret-change-me";
}

function b64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(sig);
}

/** Sign a session for an account. Payload carries the id and an issued-at stamp. */
export async function signSession(accountId: string, issuedAt: number): Promise<string> {
  const payload = `${accountId}.${issuedAt}`;
  return `${payload}.${await hmac(payload)}`;
}

/** Verify a token; returns the accountId when valid and unexpired, else null. */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [accountId, issuedAtRaw, sig] = parts;
  const expected = await hmac(`${accountId}.${issuedAtRaw}`);
  // constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  const issuedAt = parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt)) return null;
  if ((Date.now() - issuedAt) / 1000 > SESSION_TTL_SECONDS) return null;
  return accountId;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
