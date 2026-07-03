"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PLANS } from "@/core/plans";
import type { Plan } from "@/server/accounts";

interface Me {
  authEnabled: boolean;
  account?: { id: string; email: string; plan: Plan; upgradeRequestedAt?: string };
}

interface UpgradeInfo {
  reference: string;
  amount: string;
  payoneerLink: string;
  instructions: string;
}

export default function PricingPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [upgrade, setUpgrade] = useState<UpgradeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ authEnabled: false }));
  }, []);

  const signedIn = !!me?.account;
  const plan = me?.account?.plan;

  async function startUpgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/upgrade", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start upgrade");
        return;
      }
      setUpgrade(data);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
          Chart Nº 004 · plans
        </div>
        <h1 className="mt-2 text-3xl font-semibold uppercase tracking-wide text-foam">
          Run one desk free. Run the fleet on Pro.
        </h1>
        <p className="mt-2 text-sm text-foam-soft">
          Everything is a view of the shipment. Free gets you the object and the
          engine; Pro turns on the autonomy.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(PLANS) as Plan[]).map((key) => {
          const p = PLANS[key];
          const current = plan === key;
          const isPro = key === "PRO";
          return (
            <div
              key={key}
              className={`flex flex-col border bg-hull p-6 ${
                isPro ? "border-magenta/50" : "border-line"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`font-mono text-sm uppercase tracking-[0.16em] ${
                    isPro ? "text-magenta" : "text-foam"
                  }`}
                >
                  {p.name}
                </span>
                {current && (
                  <span className="border border-instr/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-instr">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-foam">
                {p.priceLabel}
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {p.blurb.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-foam-soft">
                    <span className={isPro ? "text-magenta" : "text-instr"}>▹</span>
                    {line}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {!isPro ? (
                  signedIn ? (
                    <span className="block border border-line py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft">
                      {current ? "Your plan" : "Included"}
                    </span>
                  ) : (
                    <Link
                      href="/signup"
                      className="block border border-instr/60 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-instr hover:bg-instr/10"
                    >
                      Start free
                    </Link>
                  )
                ) : current ? (
                  <span className="block border border-magenta/40 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-magenta">
                    You’re on Pro
                  </span>
                ) : signedIn ? (
                  <button
                    onClick={startUpgrade}
                    disabled={busy}
                    className="w-full border border-magenta/70 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-magenta hover:bg-magenta/10 disabled:opacity-40"
                  >
                    {busy ? "Preparing…" : "Upgrade via Payoneer"}
                  </button>
                ) : (
                  <Link
                    href="/signup"
                    className="block border border-magenta/70 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-magenta hover:bg-magenta/10"
                  >
                    Get Pro
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 border border-danger/50 bg-danger/10 px-4 py-3 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {upgrade && (
        <div className="mt-6 border border-magenta/50 bg-hull p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-magenta">
            Payoneer payment · manual settlement
          </div>
          <p className="mt-3 text-sm text-foam-soft">{upgrade.instructions}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-line bg-void px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-foam-soft">
                Amount
              </div>
              <div className="mt-1 font-mono text-lg text-foam">{upgrade.amount}</div>
            </div>
            <div className="border border-line bg-void px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-foam-soft">
                Reference (put in payment note)
              </div>
              <div className="mt-1 font-mono text-sm text-brass">{upgrade.reference}</div>
            </div>
          </div>
          {upgrade.payoneerLink && (
            <a
              href={upgrade.payoneerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block border border-magenta/70 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-magenta hover:bg-magenta/10"
            >
              Pay {upgrade.amount} on Payoneer →
            </a>
          )}
          <p className="mt-4 text-xs text-foam-soft/80">
            Your plan flips to Pro once the operator confirms the payment landed.
            You’ll keep Free access in the meantime.
          </p>
        </div>
      )}

      {me && !me.authEnabled && (
        <div className="mt-6 border border-line bg-hull px-4 py-3 font-mono text-[11px] text-foam-soft">
          Accounts are off in this environment (open demo mode) — every feature is
          unlocked. Set ENGINE_ROOM_AUTH=1 to enable plans and login.
        </div>
      )}
    </div>
  );
}
