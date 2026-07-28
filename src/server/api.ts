import { NextResponse } from "next/server";
import { eventHistory } from "@/core/events";
import { agentActions } from "@/core/agent";
import { bootWorld, customerById, shipmentById, worldSnapshot } from "@/core/store";
import { activateTenant, apiKeyTenant, initPersistence, resolveTenant } from "@/server/persistence";
import { authEnabled, tenantForAccount } from "@/server/accounts";
import { currentAccount } from "@/server/current-user";
import type { Shipment } from "@/core/types";

/**
 * API plane helpers.
 *
 * The route handlers operate the same domain core the terminal UI uses — a
 * per-process in-memory world seeded on boot. This is the service seam: the
 * handlers' request/response contracts are what the NestJS services in
 * ARCHITECTURE.md implement against Postgres; swap the store, keep the API.
 */

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Every handler calls this first: seed, arm persistence, and — given the
 * request — swap in the world belonging to the caller's tenant.
 *
 * Under auth the tenant is resolved through the (epoch-checked) session, so a
 * revoked or stale cookie can never address its account's world — it falls back
 * to a partner API key if one is presented, else the default world. Without auth
 * it's keyed by API key (see src/server/persistence.ts § Tenancy).
 */
export async function ensureWorld(request?: Request) {
  bootWorld();
  initPersistence();
  if (request) activateTenant(await tenantFor(request));
  return worldSnapshot();
}

async function tenantFor(request: Request): Promise<string> {
  if (authEnabled()) {
    const account = await currentAccount(request); // verifies the revocation epoch
    if (account) return tenantForAccount(account.id);
    // No valid session — a partner API key may still address its own tenant,
    // but a revoked cookie (header injected pre-check) must not.
    return apiKeyTenant(request) ?? "default";
  }
  return resolveTenant(request);
}

/** The shipment object with every derived view attached — the API's atom. */
export function shipmentDetail(id: string) {
  const shipment = shipmentById(id);
  if (!shipment) return undefined;
  return withViews(shipment);
}

export function withViews(shipment: Shipment) {
  const world = worldSnapshot(); // tenant already active from the handler's ensureWorld
  return {
    ...shipment,
    customer: customerById(shipment.customerId) ?? null,
    quotes: world.quotes.filter((q) => q.shipmentId === shipment.id),
    documents: world.documents.filter((d) => d.shipmentId === shipment.id),
    invoices: world.invoices.filter((i) => i.shipmentId === shipment.id),
    tracking: world.tracking.filter((t) => t.shipmentId === shipment.id),
    agentActions: agentActions().filter((a) => a.shipmentId === shipment.id),
    events: eventHistory().filter((e) => e.shipmentId === shipment.id),
  };
}
