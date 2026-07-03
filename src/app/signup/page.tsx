"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create account");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-brass">
          Chart Nº 004 · new berth
        </div>
        <h1 className="mt-2 text-2xl font-semibold uppercase tracking-wide text-foam">
          Start free
        </h1>
        <p className="mt-1 text-sm text-foam-soft">
          Your own Engine Room — up to 5 active shipments, no card required.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 border border-line bg-hull p-6">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full border border-line bg-void px-3 py-2 font-mono text-sm text-foam outline-none focus:border-instr"
            placeholder="you@company.com"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft">
            Password
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
          {busy ? "Creating…" : "Create free account"}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-foam-soft">
        <Link href="/login" className="hover:text-foam">
          ← I already have an account
        </Link>
        <Link href="/pricing" className="hover:text-foam">
          Compare plans
        </Link>
      </div>
    </div>
  );
}
