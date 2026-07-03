import { safeEqual } from "@/server/safe-equal";

/**
 * Operator authentication for the admin plane (/api/admin/*, billing confirm).
 * A single shared secret in ENGINE_ROOM_ADMIN_KEY, presented as x-admin-key.
 * This is deliberately separate from customer accounts — it's the operator, not
 * a tenant.
 *
 * Returns null when the request is authorised, or an { error, status } to
 * return otherwise.
 */
export function checkAdmin(request: Request): { error: string; status: number } | null {
  const adminKey = process.env.ENGINE_ROOM_ADMIN_KEY;
  if (!adminKey) return { error: "ENGINE_ROOM_ADMIN_KEY not configured", status: 400 };
  const presented = request.headers.get("x-admin-key") ?? "";
  if (!safeEqual(adminKey, presented)) return { error: "Unauthorized", status: 401 };
  return null;
}
