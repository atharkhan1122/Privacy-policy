import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as postTracking } from "@/app/api/shipments/[id]/tracking/route";
import { POST as postResolve } from "@/app/api/shipments/[id]/resolve-exception/route";
import { GET as getHealth } from "@/app/api/health/route";
import { middleware } from "@/middleware";
import { agentActions } from "./agent";
import { bootWorld, shipmentById } from "./store";
import { eventHistory } from "./events";

/**
 * Inbound tracking: carrier events land via the API; an exception flags the
 * shipment, re-scores the ETA, and wakes the agent with a recovery proposal.
 */

const p = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown) =>
  new Request(`http://engine.room${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("tracking ingestion", () => {
  bootWorld();
  const SHIPMENT = "ENG-2026-0847"; // Lagos → Jebel Ali air, in transit, no exception

  it("appends a routine event without flagging the shipment", async () => {
    const res = await postTracking(
      post(`/api/shipments/${SHIPMENT}/tracking`, {
        location: "DXB Al Maktoum",
        description: "Breakdown complete, awaiting delivery",
      }),
      p(SHIPMENT)
    );
    expect(res.status).toBe(201);
    const tracking = await res.json();
    expect(tracking.isException).toBe(false);
    expect(shipmentById(SHIPMENT)!.hasOpenException).toBe(false);
  });

  it("an exception flags the shipment, emits CRITICAL, and wakes the agent", async () => {
    const before = agentActions().length;
    const res = await postTracking(
      post(`/api/shipments/${SHIPMENT}/tracking`, {
        location: "DXB Al Maktoum",
        description: "Customs hold — random inspection selected",
        isException: true,
      }),
      p(SHIPMENT)
    );
    expect(res.status).toBe(201);
    const shipment = shipmentById(SHIPMENT)!;
    expect(shipment.hasOpenException).toBe(true);
    const exceptionEvent = [...eventHistory()]
      .reverse()
      .find((e) => e.shipmentId === SHIPMENT && e.type === "tracking.exception");
    expect(exceptionEvent?.severity).toBe("CRITICAL");
    expect(agentActions().length).toBeGreaterThan(before);
    expect(
      agentActions().some(
        (a) => a.taskType === "EXCEPTION_HANDLING" && a.summary.includes("Customs hold")
      )
    ).toBe(true);
  });

  it("resolve-exception unblocks the shipment", async () => {
    const res = await postResolve(
      post(`/api/shipments/${SHIPMENT}/resolve-exception`, {}),
      p(SHIPMENT)
    );
    expect(res.status).toBe(200);
    expect(shipmentById(SHIPMENT)!.hasOpenException).toBe(false);
    // A second resolve is a 400, not a silent no-op.
    const again = await postResolve(
      post(`/api/shipments/${SHIPMENT}/resolve-exception`, {}),
      p(SHIPMENT)
    );
    expect(again.status).toBe(400);
  });

  it("validates the payload and the shipment id", async () => {
    const missing = await postTracking(
      post(`/api/shipments/${SHIPMENT}/tracking`, { location: "X" }),
      p(SHIPMENT)
    );
    expect(missing.status).toBe(400);
    const unknown = await postTracking(
      post(`/api/shipments/ENG-0000-0000/tracking`, { location: "X", description: "Y" }),
      p("ENG-0000-0000")
    );
    expect(unknown.status).toBe(404);
  });
});

describe("health endpoint", () => {
  it("responds without authentication even when keys are configured", async () => {
    const saved = process.env.ENGINE_ROOM_API_KEYS;
    process.env.ENGINE_ROOM_API_KEYS = "erk_locked";
    try {
      expect(middleware(new NextRequest("http://engine.room/api/health")).status).toBe(200);
      const health = await (await getHealth()).json();
      expect(health.ok).toBe(true);
      expect(typeof health.uptimeSec).toBe("number");
    } finally {
      if (saved === undefined) delete process.env.ENGINE_ROOM_API_KEYS;
      else process.env.ENGINE_ROOM_API_KEYS = saved;
    }
  });
});
