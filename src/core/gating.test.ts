import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { POST as payRoute } from "@/app/api/invoices/[id]/pay/route";
import { POST as nightShift } from "@/app/api/night-shift/route";
import { POST as setAutonomy } from "@/app/api/agent/autonomy/route";
import { createAccount } from "@/server/accounts";
import { signSession, SESSION_COOKIE } from "@/server/session";
import { bootWorld, worldSnapshot } from "./store";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-gating-"));
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.data = process.env.ENGINE_ROOM_DATA;
  saved.auth = process.env.ENGINE_ROOM_AUTH;
  saved.secret = process.env.ENGINE_ROOM_SESSION_SECRET;
  process.env.ENGINE_ROOM_SESSION_SECRET = "test-secret";
});

afterEach(() => {
  for (const [k, envKey] of [
    ["data", "ENGINE_ROOM_DATA"],
    ["auth", "ENGINE_ROOM_AUTH"],
    ["secret", "ENGINE_ROOM_SESSION_SECRET"],
  ] as const) {
    if (saved[k] === undefined) delete process.env[envKey];
    else process.env[envKey] = saved[k];
  }
});

const p = (id: string) => ({ params: Promise.resolve({ id }) });

describe("manual payment recording (auth off)", () => {
  beforeEach(() => {
    delete process.env.ENGINE_ROOM_AUTH;
    bootWorld();
  });

  it("records the method and reference on a manual settlement", async () => {
    const open = worldSnapshot().invoices.find((i) => i.status === "ISSUED")!;
    const res = await payRoute(
      new Request(`http://engine.room/api/invoices/${open.id}/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "PAYONEER", reference: "ER-NOTE-123" }),
      }),
      p(open.id)
    );
    expect(res.status).toBe(200);
    const invoice = await res.json();
    expect(invoice.status).toBe("PAID");
    expect(invoice.paymentMethod).toBe("PAYONEER");
    expect(invoice.paymentReference).toBe("ER-NOTE-123");
    expect(invoice.paidAt).toBeTruthy();
  });
});

describe("plan gating (auth on)", () => {
  async function freeSession() {
    process.env.ENGINE_ROOM_AUTH = "1";
    process.env.ENGINE_ROOM_DATA = path.join(dataDir, `world-${Date.now()}.json`);
    const created = createAccount(`free${Date.now()}@meridian.test`, "correcthorse");
    if (!created.ok) throw new Error("setup");
    const token = await signSession(created.account.id, Date.now());
    return { id: created.account.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  function withAccount(url: string, cookie: string, body?: unknown) {
    return new Request(`http://engine.room${url}`, {
      method: "POST",
      // The middleware injects x-engine-account after verifying the cookie; in a
      // direct handler test we set it explicitly to the same effect.
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it("blocks the Night Shift for FREE with 402", async () => {
    const { cookie } = await freeSession();
    const res = await nightShift(withAccount("/api/night-shift", cookie));
    expect(res.status).toBe(402);
    expect((await res.json()).upgrade).toBe(true);
  });

  it("caps autonomy for FREE with 402 above notch 2", async () => {
    const { cookie } = await freeSession();
    const ok = await setAutonomy(
      withAccount("/api/agent/autonomy", cookie, { taskType: "QUOTE", level: 2 })
    );
    expect(ok.status).toBe(200);
    const blocked = await setAutonomy(
      withAccount("/api/agent/autonomy", cookie, { taskType: "QUOTE", level: 4 })
    );
    expect(blocked.status).toBe(402);
  });
});
