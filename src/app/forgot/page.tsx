"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true); // always — never reveal whether the email exists
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
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-foam-soft">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      {sent ? (
        <div className="border border-instr/50 bg-instr/10 p-6 font-mono text-[12px] text-instr">
          If an account exists for that email, a reset link is on its way. The link is
          valid for one hour.
        </div>
      ) : (
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
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-instr/60 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-instr transition-colors hover:bg-instr/10 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <div className="mt-4 font-mono text-[11px] text-foam-soft">
        <Link href="/login" className="hover:text-foam">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
