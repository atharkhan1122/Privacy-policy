import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listInvoices } from "@/app/api/invoices/route";
import { POST as payRoute } from "@/app/api/invoices/[id]/pay/route";
import { middleware, rateLimitPerMinute } from "@/middleware";
import { bootWorld, worldSnapshot } from "./store";
import { eventHistory } from "./events";

const p = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string) =>
  new Request(`http://engine.room${url}`, { method: "POST" });

describe("payment collection", () => {
  bootWorld();

  it("settles an open invoice and emits payment.received", async () => {
    const open = worldSnapshot().invoices.find((i) => i.status === "ISSUED")!;
    const res = await payRoute(post(`/api/invoices/${open.id}/pay`), p(open.id));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("PAID");
    expect(
      [...eventHistory()].reverse().find((e) => e.type === "payment.received")?.summary
    ).toContain(open.id);
  });

  it("rejects double payment and unknown invoices", async () => {
    const paid = worldSnapshot().invoices.find((i) => i.status === "PAID")!;
    expect((await payRoute(post(`x`), p(paid.id))).status).toBe(400);
    expect((await payRoute(post(`x`), p("INV-000"))).status).toBe(404);
  });

  it("lists the ledger", async () => {
    const res = await listInvoices(new Request("http://engine.room/api/invoices"));
    expect((await res.json()).count).toBeGreaterThan(0);
  });
});

describe("rate limiting", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved.limit = process.env.ENGINE_ROOM_RATE_LIMIT;
    saved.keys = process.env.ENGINE_ROOM_API_KEYS;
    delete process.env.ENGINE_ROOM_API_KEYS;
  });
  afterEach(() => {
    if (saved.limit === undefined) delete process.env.ENGINE_ROOM_RATE_LIMIT;
    else process.env.ENGINE_ROOM_RATE_LIMIT = saved.limit;
    if (saved.keys === undefined) delete process.env.ENGINE_ROOM_API_KEYS;
    else process.env.ENGINE_ROOM_API_KEYS = saved.keys;
  });

  const req = (headers: Record<string, string> = {}) =>
    new NextRequest("http://engine.room/api/shipments", { headers });

  it("is off by default", async () => {
    delete process.env.ENGINE_ROOM_RATE_LIMIT;
    expect(rateLimitPerMinute()).toBe(0);
    for (let i = 0; i < 10; i++) expect((await middleware(req())).status).toBe(200);
  });

  it("returns 429 past the per-caller window and isolates callers", async () => {
    process.env.ENGINE_ROOM_RATE_LIMIT = "3";
    const caller = { "x-forwarded-for": `10.0.0.${Date.now() % 250}` };
    for (let i = 0; i < 3; i++) expect((await middleware(req(caller))).status).toBe(200);
    const limited = await middleware(req(caller));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    // A different caller is unaffected.
    expect((await middleware(req({ "x-forwarded-for": "10.9.9.9" }))).status).toBe(200);
  });

  it("never throttles the health probe", async () => {
    process.env.ENGINE_ROOM_RATE_LIMIT = "1";
    for (let i = 0; i < 5; i++) {
      expect((await middleware(new NextRequest("http://engine.room/api/health"))).status).toBe(200);
    }
  });
});
