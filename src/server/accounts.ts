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
}

export interface PublicAccount {
  id: string;
  email: string;
  plan: Plan;
  tenant: string;
  upgradeRequestedAt?: string;
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
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters" };
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

export function findAccount(id: string): Account | undefined {
  load();
  return accounts.get(id);
}

export function setPlan(id: string, plan: Plan): Account | undefined {
  const a = findAccount(id);
  if (!a) return undefined;
  a.plan = plan;
  if (plan === "PRO") a.upgradeRequestedAt = undefined;
  persist();
  return a;
}

export function requestUpgrade(id: string, reference: string): Account | undefined {
  const a = findAccount(id);
  if (!a) return undefined;
  a.upgradeRequestedAt = new Date().toISOString();
  a.payoneerReference = reference;
  persist();
  return a;
}
