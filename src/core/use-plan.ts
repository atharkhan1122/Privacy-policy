"use client";

import { useEffect, useState } from "react";
import { PLANS, type PlanFeatures } from "./plans";
import type { Plan } from "@/server/accounts";

/**
 * Client-side view of the caller's plan. One shared fetch of /api/auth/me,
 * cached at module scope so every component (header badge, agent controls,
 * intake) reads the same answer without re-hitting the endpoint.
 *
 * When accounts are off the platform is an ungated demo, so `features` is the
 * full PRO matrix and nothing is locked. While the first fetch is in flight we
 * also default to PRO to avoid briefly locking controls the user is allowed to use.
 */
export interface PlanState {
  authEnabled: boolean;
  plan: Plan | null; // null when auth is off
  email?: string;
  features: PlanFeatures; // effective features (PRO when ungated)
  loading: boolean;
}

const UNGATED: PlanState = {
  authEnabled: false,
  plan: null,
  features: PLANS.PRO,
  loading: false,
};

let cache: PlanState | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

function load(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/auth/me")
    .then((r) => r.json())
    .then((data) => {
      if (!data?.authEnabled) {
        cache = UNGATED;
      } else if (data.account) {
        const plan = data.account.plan as Plan;
        cache = {
          authEnabled: true,
          plan,
          email: data.account.email,
          features: PLANS[plan],
          loading: false,
        };
      } else {
        cache = { authEnabled: true, plan: "FREE", features: PLANS.FREE, loading: false };
      }
    })
    .catch(() => {
      cache = UNGATED;
    })
    .finally(notify);
  return inflight;
}

/** Force a re-fetch — call after a plan change (e.g. an upgrade confirms). */
export function refreshPlan(): Promise<void> {
  cache = null;
  inflight = null;
  return load();
}

export function usePlan(): PlanState {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    if (!cache) void load();
    return () => {
      subscribers.delete(cb);
    };
  }, []);
  return cache ?? { ...UNGATED, loading: true };
}
