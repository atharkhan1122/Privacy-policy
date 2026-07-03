import { describe, expect, it } from "vitest";
import {
  approve,
  autonomyGrants,
  propose,
  reject,
  setAutonomyLevel,
} from "./agent";
import type { Shipment } from "./types";

const shipment: Shipment = {
  id: "ENG-TEST-0002",
  ref: "agent test",
  state: "QUOTE",
  customerId: "cust-1",
  origin: "NGLOS Lagos",
  destination: "AEJEA Jebel Ali",
  mode: "AIR",
  incoterm: "CIF",
  cargo: { commodity: "parts", weightKg: 500, volumeCbm: 2, pieces: 2, hazardous: false, value: 20_000 },
  createdAt: new Date().toISOString(),
  stateEnteredAt: new Date().toISOString(),
  revenue: 0,
  cost: 0,
  hasOpenException: false,
};

describe("the four-notch agent", () => {
  it("executes automatically at notch 4 when confident and under the ceiling", () => {
    setAutonomyLevel("QUOTE", 4);
    const a = propose({
      shipment, taskType: "QUOTE",
      summary: "quote it", detail: "", confidence: 0.95, valueAtStake: 5_000,
    });
    expect(a.status).toBe("EXECUTED");
    expect(a.levelUsed).toBe(4);
  });

  it("drops to ask-first when value exceeds the notch-4 ceiling", () => {
    setAutonomyLevel("QUOTE", 4);
    const a = propose({
      shipment, taskType: "QUOTE",
      summary: "big quote", detail: "", confidence: 0.95, valueAtStake: 999_999,
    });
    expect(a.status).toBe("AWAITING_APPROVAL");
    expect(a.levelUsed).toBe(3);
    expect(a.escalationReason).toContain("ceiling");
  });

  it("escalates below the confidence floor regardless of grant", () => {
    setAutonomyLevel("BOOKING", 4);
    const a = propose({
      shipment, taskType: "BOOKING",
      summary: "uncertain booking", detail: "", confidence: 0.6, valueAtStake: 1_000,
    });
    expect(a.status).toBe("ESCALATED");
    expect(a.escalationReason).toContain("Confidence");
  });

  it("only suggests at notch 1 and drafts at notch 2", () => {
    setAutonomyLevel("COLLECTIONS", 1);
    expect(
      propose({ shipment, taskType: "COLLECTIONS", summary: "s", detail: "", confidence: 0.9, valueAtStake: 100 }).status
    ).toBe("SUGGESTED");
    setAutonomyLevel("COLLECTIONS", 2);
    expect(
      propose({ shipment, taskType: "COLLECTIONS", summary: "s", detail: "", confidence: 0.9, valueAtStake: 100 }).status
    ).toBe("DRAFTED");
  });

  it("human approval executes the action and feeds earned trust", () => {
    setAutonomyLevel("BOOKING", 3);
    const before = autonomyGrants().find((g) => g.taskType === "BOOKING")!.earnedOver;
    const a = propose({
      shipment, taskType: "BOOKING",
      summary: "book it", detail: "", confidence: 0.92, valueAtStake: 2_000,
    });
    expect(a.status).toBe("AWAITING_APPROVAL");
    const approved = approve(a.id)!;
    expect(approved.status).toBe("EXECUTED");
    expect(autonomyGrants().find((g) => g.taskType === "BOOKING")!.earnedOver).toBe(before + 1);
  });

  it("rejection is recorded and does not earn trust", () => {
    setAutonomyLevel("BOOKING", 3);
    const before = autonomyGrants().find((g) => g.taskType === "BOOKING")!.earnedOver;
    const a = propose({
      shipment, taskType: "BOOKING",
      summary: "bad idea", detail: "", confidence: 0.9, valueAtStake: 2_000,
    });
    expect(reject(a.id)!.status).toBe("REJECTED");
    expect(autonomyGrants().find((g) => g.taskType === "BOOKING")!.earnedOver).toBe(before);
  });

  it("approve is a no-op on already-executed actions", () => {
    setAutonomyLevel("QUOTE", 4);
    const a = propose({
      shipment, taskType: "QUOTE",
      summary: "done deal", detail: "", confidence: 0.95, valueAtStake: 1_000,
    });
    expect(a.status).toBe("EXECUTED");
    expect(approve(a.id)!.status).toBe("EXECUTED");
  });
});
