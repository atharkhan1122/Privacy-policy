"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mono, Panel } from "@/components/ui";
import { usePlan } from "@/core/use-plan";

function AccountInner() {
  const { authEnabled, plan, email, emailVerified } = usePlan();
  const verifiedParam = useSearchParams().get("verified");
  const [resent, setResent] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function resendVerification() {
    await fetch("/api/auth/verify/send", { method: "POST" });
    setResent(true);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords do not match" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "Could not change password" });
        return;
      }
      setMsg({ ok: true, text: "Password updated." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  if (!authEnabled) {
    return (
      <div className="max-w-xl">
        <div className="border border-line bg-hull px-4 py-3 font-mono text-[11px] text-foam-soft">
          Accounts are off in this environment (open demo mode). Set ENGINE_ROOM_AUTH=1 to
          enable account settings.
        </div>
      </div>
    );
  }

  const field =
    "mt-1.5 w-full border border-line bg-void px-3 py-2 font-mono text-sm text-foam outline-none focus:border-instr";
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft";

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Mono className="text-instr">Account</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">Your account</h1>
      </div>

      {verifiedParam === "1" && (
        <div className="border border-instr/50 bg-instr/10 px-4 py-3 font-mono text-[11px] text-instr">
          Email verified — thank you.
        </div>
      )}
      {verifiedParam === "0" && (
        <div className="border border-danger/50 bg-danger/10 px-4 py-3 font-mono text-[11px] text-danger">
          That verification link is invalid or has already been used.
        </div>
      )}

      {!emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-brass/50 bg-brass/10 px-4 py-3">
          <span className="font-mono text-[11px] text-brass">
            Your email isn&apos;t verified yet.
          </span>
          {resent ? (
            <span className="font-mono text-[11px] text-instr">Verification email sent.</span>
          ) : (
            <button
              onClick={() => void resendVerification()}
              className="border border-brass/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brass hover:bg-brass/10"
            >
              Resend verification
            </button>
          )}
        </div>
      )}

      <Panel title="Profile" fig="FIG.1">
        <div className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-hull px-4 py-3">
            <div className={label}>Email</div>
            <div className="mt-1 flex items-center gap-2 font-mono text-sm text-foam">
              {email ?? "—"}
              {emailVerified ? (
                <span className="text-[10px] uppercase tracking-[0.12em] text-instr">✓ verified</span>
              ) : (
                <span className="text-[10px] uppercase tracking-[0.12em] text-brass">unverified</span>
              )}
            </div>
          </div>
          <div className="bg-hull px-4 py-3">
            <div className={label}>Plan</div>
            <div className="mt-1 flex items-center gap-3">
              <span
                className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  plan === "PRO" ? "border-magenta/60 text-magenta" : "border-line text-foam-soft"
                }`}
              >
                {plan ?? "—"}
              </span>
              {plan === "FREE" && (
                <Link href="/pricing" className="font-mono text-[10px] uppercase tracking-[0.12em] text-instr hover:text-foam">
                  Upgrade →
                </Link>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Change password" fig="FIG.2">
        <form onSubmit={changePassword} className="space-y-4 px-4 py-4">
          <label className="block">
            <span className={label}>Current password</span>
            <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>New password</span>
            <input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={field} placeholder="at least 8 characters" />
          </label>
          <label className="block">
            <span className={label}>Confirm new password</span>
            <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
          </label>
          {msg && (
            <div
              className={`border px-3 py-2 font-mono text-[11px] ${
                msg.ok ? "border-instr/50 bg-instr/10 text-instr" : "border-danger/50 bg-danger/10 text-danger"
              }`}
            >
              {msg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="border border-instr/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-instr transition-colors hover:bg-instr/10 disabled:opacity-40"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </Panel>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
