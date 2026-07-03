import crypto from "crypto";
import {
  type AccountStore,
  DuplicateEmailError,
  MemoryFileAccountStore,
  createPostgresAccountStore,
} from "./account-store";

/**
 * Accounts + plans. Node-only (scrypt). Business logic lives here; persistence
 * is a swappable adapter (account-store.ts): a file-backed store by default, or
 * Postgres when DATABASE_URL is set. Each account owns a tenant world
 * (tenant = t_<id>), so signing up gives a user their own isolated Engine Room.
 */

export type Plan = "FREE" | "PRO";

export interface Account {
  id: string;
  email: string;
  passwordHash: string; // scrypt, hex
  salt: string; // hex
  plan: Plan;
  createdAt: string;
  /** Manual Payoneer upgrade tracking. */
  upgradeRequestedAt?: string;
  payoneerReference?: string;
  /** Password reset: sha256(token) hex + expiry (ms epoch). */
  resetTokenHash?: string;
  resetTokenExp?: number;
  /** Email verification. */
  emailVerified?: boolean;
  verifyTokenHash?: string;
  /** Session revocation counter — bumped on password change/reset. */
  sessionEpoch?: number;
}

export interface PublicAccount {
  id: string;
  email: string;
  plan: Plan;
  tenant: string;
  emailVerified: boolean;
  upgradeRequestedAt?: string;
}

/** Operator's view of an account — everything but the credential material. */
export interface AdminAccount {
  id: string;
  email: string;
  plan: Plan;
  createdAt: string;
  emailVerified: boolean;
  upgradeRequestedAt?: string;
  payoneerReference?: string;
}

export function authEnabled(): boolean {
  return process.env.ENGINE_ROOM_AUTH === "1";
}

export function tenantForAccount(id: string): string {
  return `t_${id}`;
}

// ─── Store resolution ─────────────────────────────────────────────────────────

let defaultStore: AccountStore | undefined;
let storeOverride: AccountStore | undefined;

async function getStore(): Promise<AccountStore> {
  if (storeOverride) return storeOverride;
  if (defaultStore) return defaultStore;
  if (process.env.DATABASE_URL) {
    // Lazy import so `pg` is only loaded when Postgres is actually configured.
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    defaultStore = createPostgresAccountStore({
      query: (text, params) => pool.query(text, params as unknown[]),
    });
  } else {
    defaultStore = new MemoryFileAccountStore();
  }
  return defaultStore;
}

/** Test/advanced seam: swap the backing store (pass undefined to reset). */
export function setAccountStore(store: AccountStore | undefined): void {
  storeOverride = store;
  if (store === undefined) defaultStore = undefined;
}

// ─── Password hashing (scrypt) ───────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const MIN_PASSWORD_LENGTH = 8;
// scrypt cost scales with input; cap length so an oversized password can't be
// used as a CPU-exhaustion vector.
export const MAX_PASSWORD_LENGTH = 200;

/** Shared password policy for signup, change, and reset. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export function toPublic(a: Account): PublicAccount {
  return {
    id: a.id,
    email: a.email,
    plan: a.plan,
    tenant: tenantForAccount(a.id),
    emailVerified: !!a.emailVerified,
    upgradeRequestedAt: a.upgradeRequestedAt,
  };
}

export type SignupResult =
  | { ok: true; account: Account }
  | { ok: false; error: string };

export async function createAccount(email: string, password: string): Promise<SignupResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { ok: false, error: "Enter a valid email" };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { ok: false, error: pwProblem };
  const store = await getStore();
  if (await store.byEmail(normalized)) {
    return { ok: false, error: "An account with that email already exists" };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  try {
    const account = await store.create({
      email: normalized,
      salt,
      passwordHash: hashPassword(password, salt),
      plan: "FREE",
      createdAt: new Date().toISOString(),
      emailVerified: false,
    });
    return { ok: true, account };
  } catch (err) {
    // Unique-index backstop against a concurrent signup of the same email.
    if (err instanceof DuplicateEmailError) {
      return { ok: false, error: "An account with that email already exists" };
    }
    throw err;
  }
}

export async function verifyCredentials(email: string, password: string): Promise<Account | null> {
  const account = await (await getStore()).byEmail(email.trim().toLowerCase());
  if (!account) return null;
  return safeEqualHex(hashPassword(password, account.salt), account.passwordHash) ? account : null;
}

/** Re-hash and store a new password with a fresh salt; bumps the session epoch. */
export async function setPassword(
  id: string,
  newPassword: string
): Promise<{ ok: true; sessionEpoch: number } | { ok: false; error: string }> {
  const store = await getStore();
  const account = await store.byId(id);
  if (!account) return { ok: false, error: "Unknown account" };
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  account.salt = crypto.randomBytes(16).toString("hex");
  account.passwordHash = hashPassword(newPassword, account.salt);
  account.sessionEpoch = (account.sessionEpoch ?? 0) + 1; // revoke old sessions
  await store.save(account);
  return { ok: true, sessionEpoch: account.sessionEpoch };
}

export async function findAccount(id: string): Promise<Account | undefined> {
  return (await getStore()).byId(id);
}

/** All accounts for the operator console (no password hashes/salts). */
export async function listAccounts(): Promise<AdminAccount[]> {
  const accounts = await (await getStore()).all();
  return accounts.map((a) => ({
    id: a.id,
    email: a.email,
    plan: a.plan,
    createdAt: a.createdAt,
    emailVerified: !!a.emailVerified,
    upgradeRequestedAt: a.upgradeRequestedAt,
    payoneerReference: a.payoneerReference,
  }));
}

export async function setPlan(id: string, plan: Plan): Promise<Account | undefined> {
  const store = await getStore();
  const account = await store.byId(id);
  if (!account) return undefined;
  account.plan = plan;
  if (plan === "PRO") account.upgradeRequestedAt = undefined;
  await store.save(account);
  return account;
}

// ─── Password reset tokens ───────────────────────────────────────────────────
// The raw token is high-entropy random, so a plain sha256 (not scrypt) is the
// right store: fast to check, and useless to an attacker who reads it.

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Mint a reset token for an email. Returns the raw token (to put in the link)
 * and the account, or null if no such email — the caller responds the same
 * either way so account existence never leaks.
 */
export async function createResetToken(
  email: string
): Promise<{ token: string; account: Account } | null> {
  const store = await getStore();
  const account = await store.byEmail(email.trim().toLowerCase());
  if (!account) return null;
  const token = crypto.randomBytes(32).toString("hex");
  account.resetTokenHash = sha256(token);
  account.resetTokenExp = Date.now() + RESET_TTL_MS;
  await store.save(account);
  return { token, account };
}

/** Spend a reset token: set the new password and clear the token. */
export async function consumeResetToken(
  token: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "Invalid or expired reset link" };
  const store = await getStore();
  const account = await store.byResetTokenHash(sha256(token));
  if (!account || !account.resetTokenExp || account.resetTokenExp < Date.now()) {
    return { ok: false, error: "Invalid or expired reset link" };
  }
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  account.salt = crypto.randomBytes(16).toString("hex");
  account.passwordHash = hashPassword(newPassword, account.salt);
  account.resetTokenHash = undefined;
  account.resetTokenExp = undefined;
  account.sessionEpoch = (account.sessionEpoch ?? 0) + 1; // revoke old sessions
  await store.save(account);
  return { ok: true };
}

// ─── Email verification tokens ───────────────────────────────────────────────

/** Mint a verification token for an account; returns the raw token for the link. */
export async function createVerifyToken(id: string): Promise<string | undefined> {
  const store = await getStore();
  const account = await store.byId(id);
  if (!account) return undefined;
  const token = crypto.randomBytes(32).toString("hex");
  account.verifyTokenHash = sha256(token);
  await store.save(account);
  return token;
}

/** Spend a verification token; marks the email verified. */
export async function consumeVerifyToken(
  token: string
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!token) return { ok: false };
  const store = await getStore();
  const account = await store.byVerifyTokenHash(sha256(token));
  if (!account) return { ok: false };
  account.emailVerified = true;
  account.verifyTokenHash = undefined;
  await store.save(account);
  return { ok: true, id: account.id };
}

export async function requestUpgrade(id: string, reference: string): Promise<Account | undefined> {
  const store = await getStore();
  const account = await store.byId(id);
  if (!account) return undefined;
  account.upgradeRequestedAt = new Date().toISOString();
  account.payoneerReference = reference;
  await store.save(account);
  return account;
}
