import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresAccountStore, type Queryable } from "@/server/account-store";
import {
  consumeResetToken,
  consumeVerifyToken,
  createAccount,
  createResetToken,
  createVerifyToken,
  findAccount,
  listAccounts,
  requestUpgrade,
  setAccountStore,
  setPassword,
  setPlan,
  verifyCredentials,
} from "@/server/accounts";

/**
 * Exercises the real Postgres adapter through the full accounts facade, backed
 * by pglite (an in-process Postgres). This runs the actual SQL — schema, insert
 * with the id sequence, unique-email constraint, token lookups, updates — so the
 * production DATABASE_URL path is genuinely verified, not just the file default.
 */

let db: PGlite;
let n = 0;
const email = () => `pg${n++}@meridian.test`;

// One in-process Postgres for the file (booting the WASM engine is the slow
// part). Tests use unique emails, so a shared database keeps them independent.
beforeAll(async () => {
  db = new PGlite();
  const queryable: Queryable = { query: (text, params) => db.query(text, params) };
  setAccountStore(createPostgresAccountStore(queryable));
});

afterAll(async () => {
  setAccountStore(undefined); // restore env-based resolution (file default)
  await db.close();
});

describe("accounts on Postgres (pglite)", () => {
  it("creates, finds, and authenticates an account", async () => {
    const e = email();
    const created = await createAccount(e, "correcthorse");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.account.id).toMatch(/^acc\d+$/);
    expect(created.account.plan).toBe("FREE");

    const found = await findAccount(created.account.id);
    expect(found?.email).toBe(e);

    expect(await verifyCredentials(e, "correcthorse")).not.toBeNull();
    expect(await verifyCredentials(e, "wrongpassword")).toBeNull();
  });

  it("enforces the unique-email constraint", async () => {
    const e = email();
    expect((await createAccount(e, "correcthorse")).ok).toBe(true);
    const dup = await createAccount(e, "correcthorse");
    expect(dup.ok).toBe(false);
  });

  it("assigns distinct sequential ids", async () => {
    const a = await createAccount(email(), "correcthorse");
    const b = await createAccount(email(), "correcthorse");
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(a.account.id).not.toBe(b.account.id);
  });

  it("upgrades the plan and clears the upgrade request", async () => {
    const created = await createAccount(email(), "correcthorse");
    if (!created.ok) throw new Error("setup");
    await requestUpgrade(created.account.id, "ER-PRO-PG");
    expect((await findAccount(created.account.id))?.payoneerReference).toBe("ER-PRO-PG");

    await setPlan(created.account.id, "PRO");
    const after = await findAccount(created.account.id);
    expect(after?.plan).toBe("PRO");
    expect(after?.upgradeRequestedAt).toBeUndefined();
  });

  it("runs the password-reset token roundtrip", async () => {
    const e = email();
    await createAccount(e, "originalpass");
    const issued = await createResetToken(e);
    expect(issued).not.toBeNull();
    const done = await consumeResetToken(issued!.token, "brandnewpass");
    expect(done.ok).toBe(true);
    expect(await verifyCredentials(e, "originalpass")).toBeNull();
    expect(await verifyCredentials(e, "brandnewpass")).not.toBeNull();
    // single-use
    expect((await consumeResetToken(issued!.token, "another-pass")).ok).toBe(false);
  });

  it("runs the email-verification token roundtrip", async () => {
    const created = await createAccount(email(), "correcthorse");
    if (!created.ok) throw new Error("setup");
    const token = await createVerifyToken(created.account.id);
    expect(token).toBeTruthy();
    const result = await consumeVerifyToken(token!);
    expect(result.ok).toBe(true);
    expect((await findAccount(created.account.id))?.emailVerified).toBe(true);
  });

  it("persists and increments the session epoch across a password change", async () => {
    const created = await createAccount(email(), "originalpass");
    if (!created.ok) throw new Error("setup");
    expect((await findAccount(created.account.id))?.sessionEpoch ?? 0).toBe(0);
    await setPassword(created.account.id, "brandnewpass");
    expect((await findAccount(created.account.id))?.sessionEpoch).toBe(1);
  });

  it("lists accounts without leaking credential material", async () => {
    const e = email();
    await createAccount(e, "correcthorse");
    const list = await listAccounts();
    const row = list.find((a) => a.email === e);
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty("passwordHash");
    expect(row).not.toHaveProperty("salt");
  });
});
