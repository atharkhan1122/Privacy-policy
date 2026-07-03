import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as verify } from "@/app/api/auth/verify/route";
import { findAccount } from "@/server/accounts";
import { outbox } from "@/server/mailer";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-verify-"));
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.data = process.env.ENGINE_ROOM_DATA;
  saved.auth = process.env.ENGINE_ROOM_AUTH;
  saved.secret = process.env.ENGINE_ROOM_SESSION_SECRET;
  saved.hook = process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
  process.env.ENGINE_ROOM_DATA = path.join(dataDir, `world-${Date.now()}-${Math.round(performance.now())}.json`);
  process.env.ENGINE_ROOM_AUTH = "1";
  process.env.ENGINE_ROOM_SESSION_SECRET = "test-secret";
  delete process.env.ENGINE_ROOM_EMAIL_WEBHOOK;
});

afterEach(() => {
  for (const [k, envKey] of [
    ["data", "ENGINE_ROOM_DATA"],
    ["auth", "ENGINE_ROOM_AUTH"],
    ["secret", "ENGINE_ROOM_SESSION_SECRET"],
    ["hook", "ENGINE_ROOM_EMAIL_WEBHOOK"],
  ] as const) {
    if (saved[k] === undefined) delete process.env[envKey];
    else process.env[envKey] = saved[k];
  }
});

let n = 0;
const email = () => `verify${Date.now()}_${n++}@meridian.test`;

const signupReq = (e: string) =>
  new Request("http://engine.room/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: e, password: "strongpass1" }),
  });

function verifyLinkFor(e: string): string {
  const entry = outbox().find((m) => m.to === e && m.link?.includes("/api/auth/verify"));
  if (!entry?.link) throw new Error("no verification link delivered");
  return entry.link;
}

describe("email verification", () => {
  it("sends a verification email on signup and starts unverified", async () => {
    const e = email();
    const res = await signup(signupReq(e));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.account.emailVerified).toBe(false);
    expect(findAccount(body.account.id)?.emailVerified).toBeFalsy();
    expect(verifyLinkFor(e)).toContain("token=");
  });

  it("verifies the email when the link is followed and is single-use", async () => {
    const e = email();
    const created = await (await signup(signupReq(e))).json();
    const link = verifyLinkFor(e);
    const token = new URL(link).searchParams.get("token")!;

    const req = (t: string) =>
      new Request(`http://engine.room/api/auth/verify?token=${t}`);

    const res = await verify(req(token));
    // redirects to /account?verified=1
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location")).toContain("verified=1");
    expect(findAccount(created.account.id)?.emailVerified).toBe(true);

    // token cleared → a second use fails
    const again = await verify(req(token));
    expect(again.headers.get("location")).toContain("verified=0");
  });

  it("redirects verified=0 for a garbage token", async () => {
    const res = await verify(new Request("http://engine.room/api/auth/verify?token=nope"));
    expect(res.headers.get("location")).toContain("verified=0");
  });
});
