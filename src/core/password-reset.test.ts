import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { createAccount, verifyCredentials } from "@/server/accounts";
import { outbox } from "@/server/mailer";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-reset-"));
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.data = process.env.ENGINE_ROOM_DATA;
  saved.auth = process.env.ENGINE_ROOM_AUTH;
  saved.hook = process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
  process.env.ENGINE_ROOM_DATA = path.join(dataDir, `world-${Date.now()}-${Math.round(performance.now())}.json`);
  process.env.ENGINE_ROOM_AUTH = "1";
  delete process.env.ENGINE_ROOM_EMAIL_WEBHOOK; // exercise the operator outbox path
});

afterEach(() => {
  for (const [k, envKey] of [
    ["data", "ENGINE_ROOM_DATA"],
    ["auth", "ENGINE_ROOM_AUTH"],
    ["hook", "ENGINE_ROOM_EMAIL_WEBHOOK"],
  ] as const) {
    if (saved[k] === undefined) delete process.env[envKey];
    else process.env[envKey] = saved[k];
  }
});

const forgotReq = (email: string) =>
  new Request("http://engine.room/api/auth/forgot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });

const resetReq = (token: string, newPassword: string) =>
  new Request("http://engine.room/api/auth/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });

function linkTokenFor(email: string): string {
  const entry = outbox().find((m) => m.to === email && m.link);
  if (!entry?.link) throw new Error("no reset link delivered");
  return new URL(entry.link).searchParams.get("token")!;
}

let n = 0;
const email = () => `reset${Date.now()}_${n++}@meridian.test`;

describe("password reset", () => {
  it("returns ok for unknown emails without leaking existence", async () => {
    const res = await forgot(forgotReq("nobody@nowhere.test"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("delivers a link and lets the user set a new password", async () => {
    const e = email();
    createAccount(e, "originalpass");
    expect((await forgot(forgotReq(e))).status).toBe(200);

    const token = linkTokenFor(e);
    const done = await reset(resetReq(token, "brandnewpass"));
    expect(done.status).toBe(200);

    expect(verifyCredentials(e, "originalpass")).toBeNull();
    expect(verifyCredentials(e, "brandnewpass")).not.toBeNull();
  });

  it("rejects a bad token and a spent token", async () => {
    const e = email();
    createAccount(e, "originalpass");
    await forgot(forgotReq(e));
    const token = linkTokenFor(e);

    expect((await reset(resetReq("garbage", "brandnewpass"))).status).toBe(400);
    expect((await reset(resetReq(token, "brandnewpass"))).status).toBe(200);
    // token is single-use
    expect((await reset(resetReq(token, "another-pass"))).status).toBe(400);
  });

  it("rejects a too-short new password", async () => {
    const e = email();
    createAccount(e, "originalpass");
    await forgot(forgotReq(e));
    const token = linkTokenFor(e);
    expect((await reset(resetReq(token, "short"))).status).toBe(400);
  });
});
