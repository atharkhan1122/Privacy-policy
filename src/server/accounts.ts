import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Accounts + plans. Node-only (scrypt + fs). Persisted to accounts.json beside
 * the world snapshot. Each account owns a tenant world (tenant = t_<id>), so
 * signing up gives a user their own isolated Engine Room.
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

// ─── Storage ─────────────────────────────────────────────────────────────────

const accounts = new Map<string, Account>();
const byEmail = new Map<string, string>();
let loaded = false;
let seq = 0;

function accountsFile(): string {
  const base =
    process.env.ENGINE_ROOM_DATA ?? path.join(process.cwd(), ".data", "world.json");
  return path.join(path.dirname(base), "accounts.json");
}

function persist(): void {
  if (process.env.ENGINE_ROOM_PERSIST === "0") return;
  const file = accountsFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ seq, accounts: [...accounts.values()] }));
    fs.renameSync(tmp, file);
  } catch {
    // never let a failed save take a request down
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  const file = accountsFile();
  if (!fs.existsSync(file)) return;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { seq: number; accounts: Account[] };
    seq = data.seq ?? 0;
    for (const a of data.accounts ?? []) {
      accounts.set(a.id, a);
      byEmail.set(a.email.toLowerCase(), a.id);
    }
  } catch {
    // corrupt store — start clean rather than crash
  }
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

export function createAccount(email: string, password: string): SignupResult {
  load();
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { ok: false, error: "Enter a valid email" };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { ok: false, error: pwProblem };
  if (byEmail.has(normalized)) return { ok: false, error: "An account with that email already exists" };
  const salt = crypto.randomBytes(16).toString("hex");
  const account: Account = {
    id: `acc${++seq}`,
    email: normalized,
    salt,
    passwordHash: hashPassword(password, salt),
    plan: "FREE",
    createdAt: new Date().toISOString(),
  };
  accounts.set(account.id, account);
  byEmail.set(normalized, account.id);
  persist();
  return { ok: true, account };
}

export function verifyCredentials(email: string, password: string): Account | null {
  load();
  const id = byEmail.get(email.trim().toLowerCase());
  const account = id ? accounts.get(id) : undefined;
  if (!account) return null;
  return safeEqualHex(hashPassword(password, account.salt), account.passwordHash) ? account : null;
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

/** Re-hash and store a new password with a fresh salt. */
export function setPassword(id: string, newPassword: string): { ok: true } | { ok: false; error: string } {
  const account = findAccount(id);
  if (!account) return { ok: false, error: "Unknown account" };
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  account.salt = crypto.randomBytes(16).toString("hex");
  account.passwordHash = hashPassword(newPassword, account.salt);
  persist();
  return { ok: true };
}

export function findAccount(id: string): Account | undefined {
  load();
  return accounts.get(id);
}

/** All accounts for the operator console (no password hashes/salts). */
export function listAccounts(): AdminAccount[] {
  load();
  return [...accounts.values()].map((a) => ({
    id: a.id,
    email: a.email,
    plan: a.plan,
    createdAt: a.createdAt,
    emailVerified: !!a.emailVerified,
    upgradeRequestedAt: a.upgradeRequestedAt,
    payoneerReference: a.payoneerReference,
  }));
}

export function setPlan(id: string, plan: Plan): Account | undefined {
  const a = findAccount(id);
  if (!a) return undefined;
  a.plan = plan;
  if (plan === "PRO") a.upgradeRequestedAt = undefined;
  persist();
  return a;
}

// ─── Password reset tokens ───────────────────────────────────────────────────
// The raw token is high-entropy random, so a plain sha256 (not scrypt) is the
// right store: fast to check, and useless to an attacker who reads the file.

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Mint a reset token for an email. Returns the raw token (to put in the link)
 * and the account, or null if no such email — the caller responds the same
 * either way so account existence never leaks.
 */
export function createResetToken(email: string): { token: string; account: Account } | null {
  load();
  const id = byEmail.get(email.trim().toLowerCase());
  const account = id ? accounts.get(id) : undefined;
  if (!account) return null;
  const token = crypto.randomBytes(32).toString("hex");
  account.resetTokenHash = sha256(token);
  account.resetTokenExp = Date.now() + RESET_TTL_MS;
  persist();
  return { token, account };
}

/** Spend a reset token: set the new password and clear the token. */
export function consumeResetToken(
  token: string,
  newPassword: string
): { ok: true } | { ok: false; error: string } {
  load();
  if (!token) return { ok: false, error: "Invalid or expired reset link" };
  const hash = sha256(token);
  const account = [...accounts.values()].find((a) => a.resetTokenHash === hash);
  if (!account || !account.resetTokenExp || account.resetTokenExp < Date.now()) {
    return { ok: false, error: "Invalid or expired reset link" };
  }
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  account.salt = crypto.randomBytes(16).toString("hex");
  account.passwordHash = hashPassword(newPassword, account.salt);
  account.resetTokenHash = undefined;
  account.resetTokenExp = undefined;
  persist();
  return { ok: true };
}

// ─── Email verification tokens ───────────────────────────────────────────────

/** Mint a verification token for an account; returns the raw token for the link. */
export function createVerifyToken(id: string): string | undefined {
  const account = findAccount(id);
  if (!account) return undefined;
  const token = crypto.randomBytes(32).toString("hex");
  account.verifyTokenHash = sha256(token);
  persist();
  return token;
}

/** Spend a verification token; marks the email verified. */
export function consumeVerifyToken(token: string): { ok: true; id: string } | { ok: false } {
  load();
  if (!token) return { ok: false };
  const hash = sha256(token);
  const account = [...accounts.values()].find((a) => a.verifyTokenHash === hash);
  if (!account) return { ok: false };
  account.emailVerified = true;
  account.verifyTokenHash = undefined;
  persist();
  return { ok: true, id: account.id };
}

export function requestUpgrade(id: string, reference: string): Account | undefined {
  const a = findAccount(id);
  if (!a) return undefined;
  a.upgradeRequestedAt = new Date().toISOString();
  a.payoneerReference = reference;
  persist();
  return a;
}
