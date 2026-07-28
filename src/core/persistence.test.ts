import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  bootWorld,
  submitIntake,
  worldSnapshot,
} from "./store";
import { autonomyGrants, setAutonomyLevel } from "./agent";
import { recordVerdict, suggestMarginPct } from "./quote-engine";
import { dataFile, hydrateFromDisk, persistNow } from "@/server/persistence";

/**
 * The durable world: full snapshot to disk, mutate everything, hydrate back,
 * and every stateful module returns to the persisted state — the same seam a
 * database implements.
 */

const SNAPSHOT_PATH = path.join(os.tmpdir(), `engine-room-test-${process.pid}.json`);

beforeAll(() => {
  process.env.ENGINE_ROOM_DATA = SNAPSHOT_PATH;
  if (fs.existsSync(SNAPSHOT_PATH)) fs.rmSync(SNAPSHOT_PATH);
  bootWorld();
});

describe("the durable world", () => {
  it("resolves the snapshot path from ENGINE_ROOM_DATA", () => {
    expect(dataFile()).toBe(SNAPSHOT_PATH);
  });

  it("reports no snapshot before the first save", () => {
    expect(hydrateFromDisk()).toBe(false);
  });

  it("round-trips the entire world through disk", () => {
    // State to persist: a new intake message, a notch change, a learned verdict.
    const persisted = submitIntake({
      channel: "EMAIL",
      from: "Rheinland Autoteile GmbH",
      raw: "quote please: 12 tons of brake assemblies, 18 cbm, Nhava Sheva to Hamburg by sea, FOB",
    });
    setAutonomyLevel("COLLECTIONS", 4);
    recordVerdict("AEJEA → KEMBA", 12, "LOST");
    const marginAfterLoss = suggestMarginPct("AEJEA → KEMBA");

    persistNow();
    expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true);

    // Diverge from the persisted state.
    const ephemeral = submitIntake({ channel: "WHATSAPP", from: "Gulf Horizon Trading", raw: "ignore me" });
    setAutonomyLevel("COLLECTIONS", 1);
    recordVerdict("AEJEA → KEMBA", 12, "WON");
    recordVerdict("AEJEA → KEMBA", 12, "WON");

    // Hydrate: the world returns to the snapshot, divergence gone.
    expect(hydrateFromDisk()).toBe(true);
    const world = worldSnapshot();
    expect(world.intake.some((m) => m.id === persisted.id)).toBe(true);
    expect(world.intake.some((m) => m.id === ephemeral.id)).toBe(false);
    expect(autonomyGrants().find((g) => g.taskType === "COLLECTIONS")!.level).toBe(4);
    expect(suggestMarginPct("AEJEA → KEMBA")).toBe(marginAfterLoss);
  });

  it("keeps id sequences monotonic across hydration — no collisions", () => {
    const next = submitIntake({ channel: "WHATSAPP", from: "x", raw: "post-hydration message" });
    const world = worldSnapshot();
    const ids = world.intake.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(next.id);
  });

  it("survives a corrupt snapshot by keeping the live world", () => {
    fs.writeFileSync(SNAPSHOT_PATH, "{not json");
    expect(hydrateFromDisk()).toBe(false);
    expect(worldSnapshot().shipments.length).toBeGreaterThan(0);
  });
});
