"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mono } from "./ui";
import { AssistantDrawer } from "./assistant";
import { useWorld } from "@/core/use-world";
import { initServerSync, syncMode } from "@/core/server-sync";

const NAV: { href: string; label: string; key: string; hint: string }[] = [
  { href: "/", label: "Control Tower", key: "t", hint: "live fleet + exceptions" },
  { href: "/shipments", label: "Shipments", key: "s", hint: "the object itself" },
  { href: "/intake", label: "Intake", key: "i", hint: "AI inbox → structure" },
  { href: "/quotes", label: "Quotes", key: "q", hint: "60-second engine" },
  { href: "/documents", label: "Documents", key: "d", hint: "paper intelligence" },
  { href: "/agent", label: "Agent", key: "a", hint: "the fourth notch" },
  { href: "/finance", label: "Finance", key: "f", hint: "money view" },
  { href: "/intelligence", label: "Intelligence", key: "g", hint: "the trade graph" },
  { href: "/portal", label: "Portal", key: "p", hint: "customer side" },
];

function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-GB", { hour12: false }) + " GST";
    setNow(fmt());
    const t = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Mono className="tabular-nums text-instr">{now || "—"}</Mono>;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { world } = useWorld();

  const items = useMemo(() => {
    const q = query.toLowerCase();
    const nav = NAV.filter(
      (n) => n.label.toLowerCase().includes(q) || n.hint.includes(q)
    ).map((n) => ({ href: n.href, label: n.label, hint: n.hint }));
    // The object itself is addressable: type an id, a customer, a commodity.
    const shipments =
      q.length >= 2
        ? world.shipments
            .filter(
              (s) =>
                s.id.toLowerCase().includes(q) ||
                s.ref.toLowerCase().includes(q) ||
                s.origin.toLowerCase().includes(q) ||
                s.destination.toLowerCase().includes(q)
            )
            .slice(0, 6)
            .map((s) => ({
              href: `/shipments/${s.id}`,
              label: s.id,
              hint: `${s.ref} · ${s.state.toLowerCase()}`,
            }))
        : [];
    return [...nav, ...shipments];
  }, [query, world.shipments]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-void/80 pt-[18vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-instr/50 bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, items.length - 1));
            if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
            if (e.key === "Enter" && items[cursor]) {
              router.push(items[cursor].href);
              onClose();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Jump to… (↑↓ · enter)"
          className="w-full border-b border-line bg-transparent px-4 py-3 font-mono text-sm text-foam outline-none placeholder:text-foam-soft/50"
        />
        <div className="max-h-72 overflow-y-auto">
          {items.map((n, i) => (
            <button
              key={n.href}
              onClick={() => {
                router.push(n.href);
                onClose();
              }}
              onMouseEnter={() => setCursor(i)}
              className={`flex w-full items-baseline justify-between px-4 py-2.5 text-left ${
                i === cursor ? "bg-instr/10 text-instr" : "text-foam-soft"
              }`}
            >
              <span className="font-mono text-xs uppercase tracking-[0.12em]">{n.label}</span>
              <span className="text-[11px] text-foam-soft/70">{n.hint}</span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-foam-soft">no match</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  useWorld(); // re-render on store changes — the sync badge depends on it
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const pendingG = useRef(false);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAssistantOpen((o) => !o);
        return;
      }
      // g-then-key chord navigation
      if (e.key === "g") {
        pendingG.current = true;
        setTimeout(() => (pendingG.current = false), 900);
        return;
      }
      if (pendingG.current) {
        const hit = NAV.find((n) => n.key === e.key);
        if (hit) router.push(hit.href);
        pendingG.current = false;
      }
    },
    [router]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  useEffect(() => {
    initServerSync();
  }, []);

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Nav rail */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-52 flex-col border-r border-line bg-hull/90 backdrop-blur">
        <div className="border-b border-line px-4 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass">
            Chart Nº 004 · live
          </div>
          <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-foam">
            The Engine Room
          </div>
          <div className="mt-0.5 text-[11px] text-foam-soft">Meridian Cargo LLC · Dubai</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((n) => {
            const active =
              n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center justify-between px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? "border-r-2 border-instr bg-instr/10 text-instr"
                    : "text-foam-soft hover:text-foam"
                }`}
              >
                <span>{n.label}</span>
                <span className="text-[9px] text-foam-soft/50">g{n.key}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-4 py-3">
          <Mono className="text-foam-soft/70">⌘K command deck</Mono>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-52 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-void/90 px-6 py-2.5 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-instr" />
            <Mono className="text-foam-soft">All systems nominal · event bus live</Mono>
            <Mono className={syncMode() === "server" ? "text-instr" : "text-foam-soft/60"}>
              · world: {syncMode() === "server" ? "server-synced" : "local demo"}
            </Mono>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setAssistantOpen((o) => !o)}
              className="border border-instr/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-instr hover:bg-instr/10"
            >
              ◈ Ask the Engine · ⌘J
            </button>
            <Clock />
          </div>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
