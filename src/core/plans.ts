import type { Plan } from "@/server/accounts";

/**
 * Free vs Pro. The feature matrix is the single source of truth for gating —
 * checked server-side on protected routes and read client-side to show/hide.
 */

export interface PlanFeatures {
  name: string;
  priceLabel: string;
  /** Max active (pre-settlement) shipments; Infinity = unlimited. */
  maxActiveShipments: number;
  /** The autonomous night shift. */
  nightShift: boolean;
  /** Highest agent autonomy notch the plan may set. */
  maxAutonomyLevel: 1 | 2 | 3 | 4;
  /** Claude-backed intake extraction (vs the deterministic parser). */
  claudeIntake: boolean;
  /** The trade intelligence graph. */
  tradeGraph: boolean;
  blurb: string[];
}

export const PLANS: Record<Plan, PlanFeatures> = {
  FREE: {
    name: "Free",
    priceLabel: "$0 / month",
    maxActiveShipments: 5,
    nightShift: false,
    maxAutonomyLevel: 2,
    claudeIntake: false,
    tradeGraph: false,
    blurb: [
      "Up to 5 active shipments",
      "AI intake (built-in parser)",
      "Quote engine & documents",
      "Agent up to notch 2 (Draft)",
      "Manual operation",
    ],
  },
  PRO: {
    name: "Pro",
    priceLabel: "$299 / month",
    maxActiveShipments: Infinity,
    nightShift: true,
    maxAutonomyLevel: 4,
    claudeIntake: true,
    tradeGraph: true,
    blurb: [
      "Unlimited shipments",
      "AI intake powered by Claude",
      "The autonomous Night Shift",
      "Agent up to notch 4 (Auto)",
      "Trade intelligence graph",
      "Revenue forecasting & priority queue",
    ],
  },
};

export function features(plan: Plan): PlanFeatures {
  return PLANS[plan];
}
