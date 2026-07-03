import fs from "fs";
import path from "path";
import type { Account, Plan } from "./accounts";

/**
 * Account persistence, behind a swappable adapter — the same seam the world uses
 * (ARCHITECTURE.md § 1). The default is a file-backed in-memory store (single
 * node); set DATABASE_URL and accounts move to Postgres, which is what lets the
 * account plane run across multiple nodes. The business logic (hashing, tokens,
 * validation) stays in accounts.ts; adapters do pure CRUD.
 */

/** Fields the caller supplies on create; the store assigns the id. */
export type NewAccount = Omit<Account, "id">;

export interface AccountStore {
  create(fields: NewAccount): Promise<Account>; // throws DuplicateEmailError
  byId(id: string): Promise<Account | undefined>;
  byEmail(emailLower: string): Promise<Account | undefined>;
  byResetTokenHash(hash: string): Promise<Account | undefined>;
  byVerifyTokenHash(hash: string): Promise<Account | undefined>;
  save(account: Account): Promise<void>; // persist mutations to an existing row
  all(): Promise<Account[]>;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with that email already exists");
    this.name = "DuplicateEmailError";
  }
}

// ─── File-backed in-memory store (default, single node) ───────────────────────

export class MemoryFileAccountStore implements AccountStore {
  private accounts = new Map<string, Account>();
  private byEmailIdx = new Map<string, string>();
  private seq = 0;
  private loaded = false;

  private file(): string {
    const base =
      process.env.ENGINE_ROOM_DATA ?? path.join(process.cwd(), ".data", "world.json");
    return path.join(path.dirname(base), "accounts.json");
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    const file = this.file();
    if (!fs.existsSync(file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
        seq: number;
        accounts: Account[];
      };
      this.seq = data.seq ?? 0;
      for (const a of data.accounts ?? []) {
        this.accounts.set(a.id, a);
        this.byEmailIdx.set(a.email.toLowerCase(), a.id);
      }
    } catch {
      // corrupt store — start clean rather than crash
    }
  }

  private persist(): void {
    if (process.env.ENGINE_ROOM_PERSIST === "0") return;
    const file = this.file();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify({ seq: this.seq, accounts: [...this.accounts.values()] })
      );
      fs.renameSync(tmp, file);
    } catch {
      // never let a failed save take a request down
    }
  }

  async create(fields: NewAccount): Promise<Account> {
    this.load();
    if (this.byEmailIdx.has(fields.email)) throw new DuplicateEmailError();
    const account: Account = { ...fields, id: `acc${++this.seq}` };
    this.accounts.set(account.id, account);
    this.byEmailIdx.set(account.email, account.id);
    this.persist();
    return account;
  }

  async byId(id: string): Promise<Account | undefined> {
    this.load();
    return this.accounts.get(id);
  }

  async byEmail(emailLower: string): Promise<Account | undefined> {
    this.load();
    const id = this.byEmailIdx.get(emailLower);
    return id ? this.accounts.get(id) : undefined;
  }

  async byResetTokenHash(hash: string): Promise<Account | undefined> {
    this.load();
    return [...this.accounts.values()].find((a) => a.resetTokenHash === hash);
  }

  async byVerifyTokenHash(hash: string): Promise<Account | undefined> {
    this.load();
    return [...this.accounts.values()].find((a) => a.verifyTokenHash === hash);
  }

  async save(account: Account): Promise<void> {
    this.load();
    this.accounts.set(account.id, account);
    this.byEmailIdx.set(account.email, account.id);
    this.persist();
  }

  async all(): Promise<Account[]> {
    this.load();
    return [...this.accounts.values()];
  }
}

// ─── Postgres store (opt-in via DATABASE_URL, multi-node) ─────────────────────

/** Minimal query surface satisfied by both `pg`'s Pool and pglite. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: row.id as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    salt: row.salt as string,
    plan: row.plan as Plan,
    createdAt: row.created_at as string,
    upgradeRequestedAt: (row.upgrade_requested_at as string) ?? undefined,
    payoneerReference: (row.payoneer_reference as string) ?? undefined,
    resetTokenHash: (row.reset_token_hash as string) ?? undefined,
    resetTokenExp:
      row.reset_token_exp == null ? undefined : Number(row.reset_token_exp),
    emailVerified: !!row.email_verified,
    verifyTokenHash: (row.verify_token_hash as string) ?? undefined,
  };
}

// One statement per entry: both node-postgres and pglite run single statements
// through query(), so we avoid multi-statement strings.
const SCHEMA_STATEMENTS = [
  `create sequence if not exists accounts_seq`,
  `create table if not exists accounts (
    id text primary key,
    email text unique not null,
    password_hash text not null,
    salt text not null,
    plan text not null,
    created_at text not null,
    upgrade_requested_at text,
    payoneer_reference text,
    reset_token_hash text,
    reset_token_exp bigint,
    email_verified boolean not null default false,
    verify_token_hash text
  )`,
  `create index if not exists accounts_reset_token_hash_idx on accounts(reset_token_hash)`,
  `create index if not exists accounts_verify_token_hash_idx on accounts(verify_token_hash)`,
];

class PostgresAccountStore implements AccountStore {
  private ready?: Promise<void>;
  constructor(private db: Queryable) {}

  private init(): Promise<void> {
    // Run the schema once per process; concurrent callers share the promise.
    return (this.ready ??= (async () => {
      for (const stmt of SCHEMA_STATEMENTS) await this.db.query(stmt);
    })());
  }

  private async one(text: string, params: unknown[]): Promise<Account | undefined> {
    await this.init();
    const { rows } = await this.db.query(text, params);
    return rows[0] ? rowToAccount(rows[0]) : undefined;
  }

  async create(fields: NewAccount): Promise<Account> {
    await this.init();
    try {
      const { rows } = await this.db.query(
        `insert into accounts
           (id, email, password_hash, salt, plan, created_at, email_verified)
         values ('acc' || nextval('accounts_seq'), $1, $2, $3, $4, $5, $6)
         returning *`,
        [fields.email, fields.passwordHash, fields.salt, fields.plan, fields.createdAt, !!fields.emailVerified]
      );
      return rowToAccount(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateEmailError();
      throw err;
    }
  }

  byId(id: string) {
    return this.one("select * from accounts where id = $1", [id]);
  }
  byEmail(emailLower: string) {
    return this.one("select * from accounts where email = $1", [emailLower]);
  }
  byResetTokenHash(hash: string) {
    return this.one("select * from accounts where reset_token_hash = $1", [hash]);
  }
  byVerifyTokenHash(hash: string) {
    return this.one("select * from accounts where verify_token_hash = $1", [hash]);
  }

  async save(a: Account): Promise<void> {
    await this.init();
    await this.db.query(
      `update accounts set
         email = $2, password_hash = $3, salt = $4, plan = $5, created_at = $6,
         upgrade_requested_at = $7, payoneer_reference = $8,
         reset_token_hash = $9, reset_token_exp = $10,
         email_verified = $11, verify_token_hash = $12
       where id = $1`,
      [
        a.id, a.email, a.passwordHash, a.salt, a.plan, a.createdAt,
        a.upgradeRequestedAt ?? null, a.payoneerReference ?? null,
        a.resetTokenHash ?? null, a.resetTokenExp ?? null,
        !!a.emailVerified, a.verifyTokenHash ?? null,
      ]
    );
  }

  async all(): Promise<Account[]> {
    await this.init();
    const { rows } = await this.db.query("select * from accounts order by id", []);
    return rows.map(rowToAccount);
  }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "23505" || /duplicate key|unique constraint/i.test(e?.message ?? "");
}

export function createPostgresAccountStore(db: Queryable): AccountStore {
  return new PostgresAccountStore(db);
}
