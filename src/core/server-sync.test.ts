import { describe, expect, it } from "vitest";
import { GET as getState } from "@/app/api/state/route";
import { GET as getAutonomy, POST as postAutonomy } from "@/app/api/agent/autonomy/route";
import { POST as approveRoute } from "@/app/api/agent/actions/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/agent/actions/[id]/reject/route";
import { applySnapshot } from "./snapshot";
import { agentActions, autonomyGrants } from "./agent";
import { bootWorld, ingestTracking, submitIntake, worldSnapshot } from "./store";

/**
 * The shared-world surface: /api/state serves the full snapshot the browser
 * hydrates from, and the agent command routes close the last write gap
 * between the terminal UI and the API plane.
 */

const p = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (url: string) => new Request(`http://engine.room${url}`);
const post = (url: string, body?: unknown) =>
  new Request(`http://engine.room${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("the shared world", () => {
  bootWorld();

  it("/api/state serves the full snapshot and applySnapshot round-trips it", async () => {
    const marker = submitIntake({ channel: "EMAIL", from: "x", raw: "state marker" });
    const snapshot = await (await getState(get("/api/state"))).json();
    expect(snapshot.version).toBe(1);
    expect(snapshot.store.world.shipments.length).toBeGreaterThan(0);
    expect(snapshot.agent.grants.QUOTE.level).toBeDefined();
    expect(snapshot.events.history.length).toBeGreaterThan(0);

    // Mutate, then hydrate the snapshot back — the client-side sync path.
    const divergent = submitIntake({ channel: "EMAIL", from: "y", raw: "divergence" });
    applySnapshot(snapshot);
    const world = worldSnapshot();
    expect(world.intake.some((m) => m.id === marker.id)).toBe(true);
    expect(world.intake.some((m) => m.id === divergent.id)).toBe(false);
  });

  it("turns the trust dial over HTTP and validates input", async () => {
    const turned = await postAutonomy(
      post("/api/agent/autonomy", { taskType: "COLLECTIONS", level: 4 })
    );
    expect(turned.status).toBe(200);
    const { grants } = await (await getAutonomy(get("/api/agent/autonomy"))).json();
    expect(
      (grants as { taskType: string; level: number }[]).find((g) => g.taskType === "COLLECTIONS")!
        .level
    ).toBe(4);
    expect((await postAutonomy(post("/api/agent/autonomy", { taskType: "NOPE", level: 2 }))).status).toBe(400);
    expect((await postAutonomy(post("/api/agent/autonomy", { taskType: "QUOTE", level: 9 }))).status).toBe(400);
  });

  it("approves and rejects agent actions over HTTP", async () => {
    // Manufacture a pending decision via a tracking exception.
    ingestTracking({
      shipmentId: "ENG-2026-0847",
      location: "DXB",
      description: "Hold for approval-route test",
      isException: true,
    });
    const pending = agentActions().filter(
      (a) => a.status === "AWAITING_APPROVAL" || a.status === "ESCALATED"
    );
    expect(pending.length).toBeGreaterThanOrEqual(1);

    const earnedBefore = autonomyGrants().find(
      (g) => g.taskType === pending[0].taskType
    )!.earnedOver;
    const approved = await approveRoute(post(`x`), p(pending[0].id));
    expect(approved.status).toBe(200);
    expect((await approved.json()).status).toBe("EXECUTED");
    expect(
      autonomyGrants().find((g) => g.taskType === pending[0].taskType)!.earnedOver
    ).toBe(earnedBefore + 1);

    expect((await rejectRoute(post(`x`), p("act-does-not-exist"))).status).toBe(404);
  });
});
