"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not reset password");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
          Chart Nº 004 · recovery
        </div>
        <h1 className="mt-2 text-2xl font-semibold uppercase tracking-wide text-foam">
          Choose a new password
        </h1>
      </div>

      {done ? (
        <div className="border border-instr/50 bg-instr/10 p-6 font-mono text-[12px] text-instr">
          Password updated. You can now{" "}
          <Link href="/login" className="underline">
            sign in
          </Link>
          .
        </div>
      ) : !token ? (
        <div className="border border-danger/50 bg-danger/10 p-6 font-mono text-[12px] text-danger">
          This reset link is missing its token. Request a new one from{" "}
          <Link href="/forgot" className="underline">
            forgot password
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 border border-line bg-hull p-6">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft">
              New password
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full border border-line bg-void px-3 py-2 font-mono text-sm text-foam outline-none focus:border-instr"
              placeholder="at least 8 characters"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft">
              Confirm new password
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 w-full border border-line bg-void px-3 py-2 font-mono text-sm text-foam outline-none focus:border-instr"
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
            className="w-full border border-magenta/70 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-magenta transition-colors hover:bg-magenta/10 disabled:opacity-40"
          >
            {busy ? "Updating…" : "Set new password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
