/**
 * Signed session tokens — isomorphic (Web Crypto), usable from both the edge
 * middleware and node route handlers. Format:
 * <accountId>.<issuedAt>.<epoch>.<base64url-hmac>.
 *
 * `epoch` is the account's session epoch at issue time. Bumping the account's
 * epoch (on password change/reset) invalidates every token signed before it —
 * enforced in currentAccount(), which compares the token's epoch to the stored
 * one. The edge middleware can't reach the DB, so it still gates pages on token
 * validity alone; the node layer does the revocation check on data access.
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

export interface SessionPayload {
  id: string;
  issuedAt: number;
  epoch: number;
}

/** Sign a session for an account at a given epoch (its revocation counter). */
export async function signSession(
  accountId: string,
  issuedAt: number,
  epoch = 0
): Promise<string> {
  const payload = `${accountId}.${issuedAt}.${epoch}`;
  return `${payload}.${await hmac(payload)}`;
}

/** Verify a token; returns its payload when valid and unexpired, else null. */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [accountId, issuedAtRaw, epochRaw, sig] = parts;
  const expected = await hmac(`${accountId}.${issuedAtRaw}.${epochRaw}`);
  // constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  const issuedAt = parseInt(issuedAtRaw, 10);
  const epoch = parseInt(epochRaw, 10);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(epoch)) return null;
  if ((Date.now() - issuedAt) / 1000 > SESSION_TTL_SECONDS) return null;
  return { id: accountId, issuedAt, epoch };
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
