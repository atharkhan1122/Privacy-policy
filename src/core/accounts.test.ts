import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createAccount,
  findAccount,
  requestUpgrade,
  setPassword,
  setPlan,
  toPublic,
  verifyCredentials,
} from "@/server/accounts";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { GET as whoami } from "@/app/api/whoami/route";
import { currentAccount } from "@/server/current-user";
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
  it("creates a FREE account, rejects weak passwords and duplicates", async () => {
    const email = uniqueEmail();
    const weak = await createAccount(email, "short");
    expect(weak.ok).toBe(false);

    const created = await createAccount(email, "longenough");
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.account.plan).toBe("FREE");

    const dup = await createAccount(email, "longenough");
    expect(dup.ok).toBe(false);

    // over-long passwords are rejected (scrypt CPU-DoS guard)
    expect((await createAccount(uniqueEmail(), "a".repeat(500))).ok).toBe(false);
  });

  it("verifies credentials only for the right password", async () => {
    const email = uniqueEmail();
    await createAccount(email, "correcthorse");
    expect(await verifyCredentials(email, "correcthorse")).not.toBeNull();
    expect(await verifyCredentials(email, "wrongpass1")).toBeNull();
    expect(await verifyCredentials("nobody@x.test", "correcthorse")).toBeNull();
  });

  it("upgrades and downgrades the plan, clearing the upgrade request on Pro", async () => {
    const created = await createAccount(uniqueEmail(), "correcthorse");
    if (!created.ok) throw new Error("setup");
    const id = created.account.id;
    await requestUpgrade(id, "ER-PRO-TEST");
    expect((await findAccount(id))?.upgradeRequestedAt).toBeTruthy();
    expect((await findAccount(id))?.payoneerReference).toBe("ER-PRO-TEST");

    await setPlan(id, "PRO");
    expect((await findAccount(id))?.plan).toBe("PRO");
    expect((await findAccount(id))?.upgradeRequestedAt).toBeUndefined();
  });

  it("exposes a tenant per account and never leaks the hash", async () => {
    const created = await createAccount(uniqueEmail(), "correcthorse");
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
    expect((await verifySession(token))?.id).toBe("acc42");
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

  it("fails closed when the session secret is unset under auth", async () => {
    delete process.env.ENGINE_ROOM_SESSION_SECRET;
    await expect(signSession("acc1", Date.now())).rejects.toThrow(/SESSION_SECRET/);
    process.env.ENGINE_ROOM_SESSION_SECRET = "test-secret"; // restore for later tests
  });
});

describe("change password", () => {
  const req = (cookie: string | undefined, body: unknown) =>
    new Request("http://engine.room/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  it("rotates the password with the right current one and rejects the old", async () => {
    const email = uniqueEmail();
    const created = await createAccount(email, "originalpass");
    if (!created.ok) throw new Error("setup");
    const cookie = `${SESSION_COOKIE}=${await signSession(created.account.id, Date.now())}`;

    // wrong current password → 401
    expect((await changePassword(req(cookie, { currentPassword: "nope12345", newPassword: "brandnewpass" }))).status).toBe(401);
    // too-short new password → 400
    expect((await changePassword(req(cookie, { currentPassword: "originalpass", newPassword: "short" }))).status).toBe(400);
    // success → 200
    expect((await changePassword(req(cookie, { currentPassword: "originalpass", newPassword: "brandnewpass" }))).status).toBe(200);

    // old password no longer works; new one does
    expect(await verifyCredentials(email, "originalpass")).toBeNull();
    expect(await verifyCredentials(email, "brandnewpass")).not.toBeNull();
  });

  it("401s without a session", async () => {
    expect((await changePassword(req(undefined, { currentPassword: "x", newPassword: "y" }))).status).toBe(401);
  });
});

describe("session revocation", () => {
  const reqWith = (cookie: string) =>
    new Request("http://engine.room/api/state", { headers: { cookie } });

  it("invalidates tokens issued before a password change", async () => {
    const email = uniqueEmail();
    const created = await createAccount(email, "originalpass");
    if (!created.ok) throw new Error("setup");
    const id = created.account.id;

    const oldToken = await signSession(id, Date.now(), created.account.sessionEpoch ?? 0);
    expect((await currentAccount(reqWith(`${SESSION_COOKIE}=${oldToken}`)))?.id).toBe(id);

    // A password change bumps the epoch, revoking the old token everywhere.
    const res = await setPassword(id, "brandnewpass");
    if (!res.ok) throw new Error("setpw");
    expect(await currentAccount(reqWith(`${SESSION_COOKIE}=${oldToken}`))).toBeNull();

    // A token minted at the new epoch is accepted.
    const newToken = await signSession(id, Date.now(), res.sessionEpoch);
    expect((await currentAccount(reqWith(`${SESSION_COOKIE}=${newToken}`)))?.id).toBe(id);
  });

  it("keeps a revoked cookie off the account's tenant world (data plane)", async () => {
    const created = await createAccount(uniqueEmail(), "originalpass");
    if (!created.ok) throw new Error("setup");
    const id = created.account.id;
    const cookie = `${SESSION_COOKIE}=${await signSession(id, Date.now(), created.account.sessionEpoch ?? 0)}`;

    const before = await (await whoami(reqWith(cookie))).json();
    expect(before.tenant).toBe(`t_${id}`);

    // Password change bumps the epoch; the same cookie is now stale.
    const res = await setPassword(id, "brandnewpass");
    if (!res.ok) throw new Error("setpw");

    // A data route resolves the tenant through the epoch check — the stale cookie
    // lands on the default world, never the account's.
    const after = await (await whoami(reqWith(cookie))).json();
    expect(after.tenant).not.toBe(`t_${id}`);
    expect(after.tenant).toBe("default");
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
    expect(apiRes.headers.get("x-middleware-request-x-engine-account")).toBe("acc7");
  });

  it("401s an API call with no session and no key", async () => {
    const res = await middleware(
      new NextRequest("http://engine.room/api/shipments")
    );
    expect(res.status).toBe(401);
  });
});

describe("tenant header hardening", () => {
  const savedKeys = { v: process.env.ENGINE_ROOM_API_KEYS };
  afterEach(() => {
    if (savedKeys.v === undefined) delete process.env.ENGINE_ROOM_API_KEYS;
    else process.env.ENGINE_ROOM_API_KEYS = savedKeys.v;
  });

  it("overwrites an injected x-engine-account with the verified session account", async () => {
    const cookie = `${SESSION_COOKIE}=${await signSession("acc7", Date.now())}`;
    const res = await middleware(
      new NextRequest("http://engine.room/api/shipments", {
        headers: { cookie, "x-engine-account": "victim" },
      })
    );
    expect(res.status).toBe(200);
    // The forged value never survives — tenancy sees the real account.
    expect(res.headers.get("x-middleware-request-x-engine-account")).toBe("acc7");
  });

  it("strips an injected x-engine-account on the API-key path", async () => {
    process.env.ENGINE_ROOM_API_KEYS = "erk_partner_1:acme";
    const res = await middleware(
      new NextRequest("http://engine.room/api/shipments", {
        headers: { "x-api-key": "erk_partner_1", "x-engine-account": "acc7" },
      })
    );
    expect(res.status).toBe(200);
    // A partner key cannot address another account's tenant world.
    expect(res.headers.get("x-middleware-request-x-engine-account")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers") ?? "").not.toContain("x-engine-account");
  });
});
