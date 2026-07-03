import { type Account, authEnabled, findAccount } from "@/server/accounts";
import { SESSION_COOKIE, verifySession } from "@/server/session";

/** Read a cookie value from a request. */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** The signed-in account for a request, or null (also null when auth is off). */
export async function currentAccount(request: Request): Promise<Account | null> {
  if (!authEnabled()) return null;
  const id = await verifySession(readCookie(request, SESSION_COOKIE));
  return (id ? await findAccount(id) : null) ?? null;
}
