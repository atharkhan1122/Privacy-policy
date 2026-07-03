// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AgentPage from "@/app/agent/page";
import IntakePage from "@/app/intake/page";
import { refreshPlan } from "@/core/use-plan";
import { bootWorld } from "@/core/store";

/**
 * Render tests for the plan-gated UI. usePlan() reads /api/auth/me, so each
 * case mocks that response, forces a fresh plan load, then renders the page and
 * asserts the locked (Free) vs unlocked (Pro) surface.
 */

function mockMe(payload: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

async function withPlan(payload: unknown) {
  mockMe(payload);
  await refreshPlan(); // resolves the cache from the mocked fetch before render
}

beforeEach(() => {
  bootWorld();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("agent page — plan gating", () => {
  it("locks the Night Shift and high autonomy notches for Free", async () => {
    await withPlan({ authEnabled: true, account: { email: "free@x.test", plan: "FREE" } });
    render(<AgentPage />);

    // Night Shift is a Pro feature → upgrade link, not the run button.
    expect(screen.queryByText(/Run 8h autonomous shift/i)).toBeNull();
    expect(screen.getByText(/Night Shift is Pro/i)).toBeTruthy();
    // The trust dial explains the notch cap.
    expect(screen.getByText(/caps autonomy at notch 2/i)).toBeTruthy();
  });

  it("unlocks the Night Shift for Pro", async () => {
    await withPlan({ authEnabled: true, account: { email: "pro@x.test", plan: "PRO" } });
    render(<AgentPage />);

    expect(screen.getByText(/Run 8h autonomous shift/i)).toBeTruthy();
    expect(screen.queryByText(/Night Shift is Pro/i)).toBeNull();
    expect(screen.queryByText(/caps autonomy/i)).toBeNull();
  });

  it("stays fully unlocked when accounts are off (demo mode)", async () => {
    await withPlan({ authEnabled: false });
    render(<AgentPage />);

    expect(screen.getByText(/Run 8h autonomous shift/i)).toBeTruthy();
    expect(screen.queryByText(/Night Shift is Pro/i)).toBeNull();
  });
});

describe("intake page — shipment cap", () => {
  it("shows the run button, not a cap nudge, under the Pro (unlimited) plan", async () => {
    await withPlan({ authEnabled: true, account: { email: "pro@x.test", plan: "PRO" } });
    render(<IntakePage />);
    // The seeded inbox has a PARSED message → a real Convert button, no cap lock.
    expect(screen.queryByText(/shipment cap/i)).toBeNull();
  });
});
