import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { GET as listAccountsRoute } from "@/app/api/admin/accounts/route";
import { POST as confirmRoute } from "@/app/api/billing/confirm/route";
import { createAccount, findAccount, requestUpgrade } from "@/server/accounts";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-admin-"));
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.data = process.env.ENGINE_ROOM_DATA;
  saved.auth = process.env.ENGINE_ROOM_AUTH;
  saved.admin = process.env.ENGINE_ROOM_ADMIN_KEY;
  process.env.ENGINE_ROOM_DATA = path.join(dataDir, `world-${Date.now()}-${Math.round(performance.now())}.json`);
  process.env.ENGINE_ROOM_AUTH = "1";
  process.env.ENGINE_ROOM_ADMIN_KEY = "operator-secret";
});

afterEach(() => {
  for (const [k, envKey] of [
    ["data", "ENGINE_ROOM_DATA"],
    ["auth", "ENGINE_ROOM_AUTH"],
    ["admin", "ENGINE_ROOM_ADMIN_KEY"],
  ] as const) {
    if (saved[k] === undefined) delete process.env[envKey];
    else process.env[envKey] = saved[k];
  }
});

const listReq = (adminKey?: string) =>
  new Request("http://engine.room/api/admin/accounts", {
    headers: adminKey ? { "x-admin-key": adminKey } : {},
  });

const confirmReq = (body: unknown, adminKey?: string) =>
  new Request("http://engine.room/api/billing/confirm", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(adminKey ? { "x-admin-key": adminKey } : {}),
    },
    body: JSON.stringify(body),
  });

describe("admin console API", () => {
  it("rejects the account list without the admin key", async () => {
    expect((await listAccountsRoute(listReq())).status).toBe(401);
    expect((await listAccountsRoute(listReq("wrong"))).status).toBe(401);
  });

  it("lists accounts (no credential material) with the admin key", async () => {
    const created = await createAccount(`op${Date.now()}@meridian.test`, "correcthorse");
    if (!created.ok) throw new Error("setup");
    await requestUpgrade(created.account.id, "ER-PRO-REF");

    const res = await listAccountsRoute(listReq("operator-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authEnabled).toBe(true);
    const row = body.accounts.find((a: { id: string }) => a.id === created.account.id);
    expect(row).toBeTruthy();
    expect(row.payoneerReference).toBe("ER-PRO-REF");
    expect(row).not.toHaveProperty("passwordHash");
    expect(row).not.toHaveProperty("salt");
  });

  it("confirms a payment → Pro and can downgrade, only with the key", async () => {
    const created = await createAccount(`up${Date.now()}@meridian.test`, "correcthorse");
    if (!created.ok) throw new Error("setup");
    const id = created.account.id;

    expect((await confirmRoute(confirmReq({ accountId: id }))).status).toBe(401);

    const up = await confirmRoute(confirmReq({ accountId: id }, "operator-secret"));
    expect(up.status).toBe(200);
    expect((await findAccount(id))?.plan).toBe("PRO");

    const down = await confirmRoute(confirmReq({ accountId: id, plan: "FREE" }, "operator-secret"));
    expect(down.status).toBe(200);
    expect((await findAccount(id))?.plan).toBe("FREE");
  });

  it("404s an unknown account", async () => {
    const res = await confirmRoute(confirmReq({ accountId: "nope" }, "operator-secret"));
    expect(res.status).toBe(404);
  });
});
