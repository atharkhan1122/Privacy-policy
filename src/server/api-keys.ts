/**
 * API-key configuration parsing — edge-safe (no node APIs).
 *
 * ENGINE_ROOM_API_KEYS is a comma-separated list of `key` or `key:tenant`
 * entries. The tenant alias names the key's isolated world; without one the
 * tenant id is derived from the key (FNV-1a — an identifier, not a secret;
 * the key itself is the secret).
 */

export interface ApiKeyEntry {
  key: string;
  tenant: string;
}

function tinyHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function parseApiKeys(raw: string | undefined): ApiKeyEntry[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator > 0) {
        const key = entry.slice(0, separator);
        const alias = entry
          .slice(separator + 1)
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 32);
        return { key, tenant: alias || `t_${tinyHash(key)}` };
      }
      return { key: entry, tenant: `t_${tinyHash(entry)}` };
    });
}

/** The key a request presents, via x-api-key or Authorization: Bearer. */
export function presentedKey(headers: Headers): string {
  const authorization = headers.get("authorization") ?? "";
  return (
    headers.get("x-api-key") ??
    (authorization.startsWith("Bearer ") ? authorization.slice(7) : "")
  );
}
