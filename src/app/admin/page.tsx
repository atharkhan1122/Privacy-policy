"use client";

import { useCallback, useState } from "react";
import { Mono, Panel, timeAgo } from "@/components/ui";
import type { AdminAccount } from "@/server/accounts";

interface AdminData {
  authEnabled: boolean;
  accounts: AdminAccount[];
}

/** Pending Payoneer upgrades float to the top; then newest accounts first. */
function order(accounts: AdminAccount[]): AdminAccount[] {
  return [...accounts].sort((a, b) => {
    const aPending = a.plan === "FREE" && !!a.upgradeRequestedAt;
    const bPending = b.plan === "FREE" && !!b.upgradeRequestedAt;
    if (aPending !== bPending) return aPending ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(
    async (adminKey: string) => {
      setError(null);
      const res = await fetch("/api/admin/accounts", { headers: { "x-admin-key": adminKey } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Failed (${res.status})`);
        setData(null);
        return false;
      }
      setData(body as AdminData);
      return true;
    },
    []
  );

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await load(key);
    setBusy(false);
  }

  async function setPlan(accountId: string, plan: "FREE" | "PRO") {
    setActingId(accountId);
    setError(null);
    try {
      const res = await fetch("/api/billing/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": key },
        body: JSON.stringify({ accountId, plan }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Failed (${res.status})`);
        return;
      }
      await load(key); // reflect the new state
    } finally {
      setActingId(null);
    }
  }

  // ── Gate: enter the operator key ────────────────────────────────────────────
  if (!data) {
    return (
      <div className="mx-auto mt-[10vh] w-full max-w-sm">
        <div className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
            Chart Nº 004 · operator
          </div>
          <h1 className="mt-2 text-2xl font-semibold uppercase tracking-wide text-foam">
            Operator console
          </h1>
          <p className="mt-1 text-sm text-foam-soft">
            Confirm Payoneer payments and manage plans.
          </p>
        </div>
        <form onSubmit={signIn} className="space-y-4 border border-line bg-hull p-6">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft">
              Admin key
            </span>
            <input
              type="password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="mt-1.5 w-full border border-line bg-void px-3 py-2 font-mono text-sm text-foam outline-none focus:border-instr"
              placeholder="ENGINE_ROOM_ADMIN_KEY"
            />
          </label>
          {error && (
            <div className="border border-danger/50 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-instr/60 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-instr transition-colors hover:bg-instr/10 disabled:opacity-40"
          >
            {busy ? "Checking…" : "Unlock console"}
          </button>
        </form>
      </div>
    );
  }

  // ── Console ─────────────────────────────────────────────────────────────────
  const accounts = order(data.accounts);
  const pending = accounts.filter((a) => a.plan === "FREE" && a.upgradeRequestedAt);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <Mono className="text-instr">Chart Nº 004 · operator console</Mono>
          <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide text-foam">
            Accounts &amp; billing
          </h1>
        </div>
        <button
          onClick={() => void load(key)}
          className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-foam-soft hover:border-foam-soft hover:text-foam"
        >
          ↻ Refresh
        </button>
      </div>

      {!data.authEnabled && (
        <div className="border border-brass/50 bg-brass/10 px-4 py-3 font-mono text-[11px] text-brass">
          Accounts are off (ENGINE_ROOM_AUTH is not 1). Confirming a plan will fail
          until auth is enabled.
        </div>
      )}

      {error && (
        <div className="border border-danger/50 bg-danger/10 px-4 py-3 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <Panel title={`Pending Payoneer upgrades — ${pending.length}`} fig="FIG.1">
          <div className="divide-y divide-line-soft">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="text-sm">
                  <span className="text-foam">{a.email}</span>
                  <div className="mt-0.5 font-mono text-[11px] text-foam-soft">
                    requested {timeAgo(a.upgradeRequestedAt!)} · ref{" "}
                    <span className="text-brass">{a.payoneerReference ?? "—"}</span>
                  </div>
                </div>
                <button
                  onClick={() => void setPlan(a.id, "PRO")}
                  disabled={actingId === a.id}
                  className="border border-magenta/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-magenta hover:bg-magenta/10 disabled:opacity-40"
                >
                  {actingId === a.id ? "Confirming…" : "✓ Confirm payment → Pro"}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`All accounts — ${accounts.length}`} fig="FIG.2">
        {accounts.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-foam-soft">
            No accounts yet. They appear here as customers sign up.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-foam-soft">
                {["Email", "Plan", "Joined", "Payoneer ref", "Action"].map((h, i) => (
                  <th
                    key={h}
                    className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const pro = a.plan === "PRO";
                return (
                  <tr key={a.id} className="border-b border-line-soft">
                    <td className="px-4 py-2.5 text-foam">{a.email}</td>
                    <td className="px-2 py-2.5">
                      <span
                        className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                          pro ? "border-magenta/60 text-magenta" : "border-line text-foam-soft"
                        }`}
                      >
                        {a.plan}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-foam-soft">{timeAgo(a.createdAt)}</td>
                    <td className="px-2 py-2.5 font-mono text-foam-soft">
                      {a.payoneerReference ?? "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      {pro ? (
                        <button
                          onClick={() => void setPlan(a.id, "FREE")}
                          disabled={actingId === a.id}
                          className="border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foam-soft hover:border-danger hover:text-danger disabled:opacity-40"
                        >
                          {actingId === a.id ? "…" : "Downgrade"}
                        </button>
                      ) : (
                        <button
                          onClick={() => void setPlan(a.id, "PRO")}
                          disabled={actingId === a.id}
                          className="border border-instr/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-instr hover:bg-instr/10 disabled:opacity-40"
                        >
                          {actingId === a.id ? "…" : "Make Pro"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <p className="text-[11px] text-foam-soft/70">
        The admin key lives only in this tab and is sent as{" "}
        <span className="font-mono">x-admin-key</span> on each action. Close the tab to clear it.
      </p>
    </div>
  );
}
