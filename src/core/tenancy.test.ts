import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { GET as getIntake, POST as postIntake } from "@/app/api/intake/route";
import { GET as whoami } from "@/app/api/whoami/route";
import { parseApiKeys } from "@/server/api-keys";

/**
 * The covenant, structurally: one isolated world per API key. Tenant alpha's
 * inbox is invisible to tenant beta; each world persists to its own file; a
 * brand-new tenant starts from the pristine genesis seed.
 */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "engine-room-tenancy-"));

beforeAll(() => {
  process.env.ENGINE_ROOM_DATA = path.join(TMP, "world.json");
  process.env.ENGINE_ROOM_API_KEYS = "erk_alpha_key:alpha, erk_beta_key:beta";
});

afterAll(() => {
  delete process.env.ENGINE_ROOM_API_KEYS;
  fs.rmSync(TMP, { recursive: true, force: true });
});

const as = (key: string, init?: RequestInit) =>
  new Request("http://engine.room/api/intake", {
    ...init,
    headers: { "content-type": "application/json", "x-api-key": key, ...(init?.headers ?? {}) },
  });

describe("multi-tenancy", () => {
  it("parses key:tenant entries and derives ids for bare keys", () => {
    const entries = parseApiKeys("erk_a:Meridian Cargo!,erk_b");
    expect(entries[0]).toEqual({ key: "erk_a", tenant: "meridiancargo" });
    expect(entries[1].key).toBe("erk_b");
    expect(entries[1].tenant).toMatch(/^t_[0-9a-f]{8}$/);
  });

  it("isolates tenant worlds: alpha's intake is invisible to beta", async () => {
    // alpha submits a message
    const created = await postIntake(
      as("erk_alpha_key", {
        method: "POST",
        body: JSON.stringify({ from: "Alpha Forwarding", raw: "alpha-only inquiry, 500 kg Lagos to Jeddah" }),
      })
    );
    expect(created.status).toBe(201);
    const message = await created.json();

    // beta's inbox does not contain it
    const betaInbox = await (await getIntake(as("erk_beta_key"))).json();
    expect(betaInbox.intake.some((m: { id: string }) => m.id === message.id)).toBe(false);

    // alpha still sees it after the world swaps back
    const alphaInbox = await (await getIntake(as("erk_alpha_key"))).json();
    expect(alphaInbox.intake.some((m: { id: string }) => m.id === message.id)).toBe(true);
  });

  it("a fresh tenant starts from the pristine genesis seed", async () => {
    const beta = await (await whoami(as("erk_beta_key"))).json();
    expect(beta.tenant).toBe("beta");
    expect(beta.intake).toBe(4); // exactly the seeded inbox, nothing of alpha's
  });

  it("persists each tenant to its own snapshot file", async () => {
    // alpha was persisted when the world swapped to beta
    expect(fs.existsSync(path.join(TMP, "tenant-alpha.json"))).toBe(true);
    const alphaSnapshot = JSON.parse(
      fs.readFileSync(path.join(TMP, "tenant-alpha.json"), "utf8")
    );
    expect(
      alphaSnapshot.store.world.intake.some((m: { raw: string }) =>
        m.raw.includes("alpha-only inquiry")
      )
    ).toBe(true);
  });

  it("whoami reports the addressed tenant", async () => {
    const alpha = await (await whoami(as("erk_alpha_key"))).json();
    expect(alpha.tenant).toBe("alpha");
    expect(alpha.intake).toBe(5); // the seeded inbox + the alpha-only message
  });
});
