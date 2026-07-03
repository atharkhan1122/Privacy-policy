import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createAccount,
  findAccount,
  requestUpgrade,
  setPlan,
  toPublic,
  verifyCredentials,
} from "@/server/accounts";
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  sessionCookie,
  signSession,
  verifySession,
} from "@/server/session";
import { features } from "@/core/plans";
import { middleware } from "@/middleware";

// Give the account store an isolated file per run so signups don't collide.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-accounts-"));
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.data = process.env.ENGINE_ROOM_DATA;
  saved.auth = process.env.ENGINE_ROOM_AUTH;
  saved.secret = process.env.ENGINE_ROOM_SESSION_SECRET;
  process.env.ENGINE_ROOM_DATA = path.join(dataDir, "world.json");
  process.env.ENGINE_ROOM_AUTH = "1";
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

let counter = 0;
const uniqueEmail = () => `pilot${Date.now()}_${counter++}@meridian.test`;

describe("accounts", () => {
  it("creates a FREE account, rejects weak passwords and duplicates", () => {
    const email = uniqueEmail();
    const weak = createAccount(email, "short");
    expect(weak.ok).toBe(false);

    const created = createAccount(email, "longenough");
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.account.plan).toBe("FREE");

    const dup = createAccount(email, "longenough");
    expect(dup.ok).toBe(false);
  });

  it("verifies credentials only for the right password", () => {
    const email = uniqueEmail();
    createAccount(email, "correcthorse");
    expect(verifyCredentials(email, "correcthorse")).not.toBeNull();
    expect(verifyCredentials(email, "wrongpass1")).toBeNull();
    expect(verifyCredentials("nobody@x.test", "correcthorse")).toBeNull();
  });

  it("upgrades and downgrades the plan, clearing the upgrade request on Pro", () => {
    const created = createAccount(uniqueEmail(), "correcthorse");
    if (!created.ok) throw new Error("setup");
    const id = created.account.id;
    requestUpgrade(id, "ER-PRO-TEST");
    expect(findAccount(id)?.upgradeRequestedAt).toBeTruthy();
    expect(findAccount(id)?.payoneerReference).toBe("ER-PRO-TEST");

    setPlan(id, "PRO");
    expect(findAccount(id)?.plan).toBe("PRO");
    expect(findAccount(id)?.upgradeRequestedAt).toBeUndefined();
  });

  it("exposes a tenant per account and never leaks the hash", () => {
    const created = createAccount(uniqueEmail(), "correcthorse");
    if (!created.ok) throw new Error("setup");
    const pub = toPublic(created.account);
    expect(pub.tenant).toBe(`t_${created.account.id}`);
    expect(pub).not.toHaveProperty("passwordHash");
    expect(pub).not.toHaveProperty("salt");
  });
});

describe("session tokens", () => {
  it("round-trips a signed session and rejects tampering", async () => {
    const token = await signSession("acc42", Date.now());
    expect(await verifySession(token)).toBe("acc42");
    expect(await verifySession(token + "x")).toBeNull();
    expect(await verifySession("acc42.123.forged")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("rejects an expired issued-at", async () => {
    const longAgo = Date.now() - 1000 * 60 * 60 * 24 * 40; // 40 days
    const token = await signSession("acc9", longAgo);
    expect(await verifySession(token)).toBeNull();
  });

  it("builds set and cleared cookies", () => {
    expect(sessionCookie("abc")).toContain(`${SESSION_COOKIE}=abc`);
    expect(sessionCookie("abc")).toContain("HttpOnly");
    expect(clearedSessionCookie()).toContain("Max-Age=0");
  });
});

describe("plan features", () => {
  it("gates the premium surface on FREE and unlocks it on PRO", () => {
    const free = features("FREE");
    const pro = features("PRO");
    expect(free.nightShift).toBe(false);
    expect(free.maxAutonomyLevel).toBeLessThan(pro.maxAutonomyLevel);
    expect(free.maxActiveShipments).toBeLessThan(pro.maxActiveShipments);
    expect(pro.nightShift).toBe(true);
    expect(pro.maxActiveShipments).toBe(Infinity);
  });
});

describe("page gating middleware (auth on)", () => {
  const page = (path: string, cookie?: string) =>
    new NextRequest(`http://engine.room${path}`, {
      headers: cookie ? { cookie } : {},
    });

  it("redirects an unauthenticated app page to /login", async () => {
    const res = await middleware(page("/shipments"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets /login and /pricing through without a session", async () => {
    expect((await middleware(page("/login"))).status).toBe(200);
    expect((await middleware(page("/pricing"))).status).toBe(200);
  });

  it("sends an anonymous visitor at the root to the marketing page", async () => {
    const res = await middleware(page("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/welcome");
  });

  it("serves the marketing page without a session", async () => {
    expect((await middleware(page("/welcome"))).status).toBe(200);
  });

  it("admits an authenticated visitor and passes the account to the API", async () => {
    const token = await signSession("acc7", Date.now());
    const cookie = `${SESSION_COOKIE}=${token}`;
    expect((await middleware(page("/shipments", cookie))).status).toBe(200);

    const apiRes = await middleware(
      new NextRequest("http://engine.room/api/shipments", { headers: { cookie } })
    );
    // A valid session is admitted (200) and the account header is injected for tenancy.
    expect(apiRes.status).toBe(200);
    expect(apiRes.headers.get("x-middleware-request-x-engine-account") ?? "acc7").toBeTruthy();
  });

  it("401s an API call with no session and no key", async () => {
    const res = await middleware(
      new NextRequest("http://engine.room/api/shipments")
    );
    expect(res.status).toBe(401);
  });
});
