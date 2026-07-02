"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { answerQuery, type AssistantReply } from "@/core/assistant";
import { agentActions } from "@/core/agent";
import { customers } from "@/core/store";
import { useWorld } from "@/core/use-world";
import { Mono } from "./ui";

interface Turn {
  role: "user" | "engine";
  text: string;
  refs?: AssistantReply["refs"];
}

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { world } = useWorld();
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "engine",
      text: "Ask me anything about the fleet — I answer from the live shipment graph, never from thin air.",
      refs: [],
    },
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  function ask() {
    const q = input.trim();
    if (!q) return;
    const reply = answerQuery(q, {
      shipments: world.shipments,
      invoices: world.invoices,
      quotes: world.quotes,
      intake: world.intake,
      customers: customers(),
      actions: agentActions(),
    });
    setTurns((t) => [...t, { role: "user", text: q }, { role: "engine", ...reply }]);
    setInput("");
  }

  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-instr/40 bg-hull shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-instr" />
          <Mono className="text-instr">Ask the Engine</Mono>
        </div>
        <button onClick={onClose} className="font-mono text-xs text-foam-soft hover:text-foam">
          esc ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-10 border border-line-soft bg-panel p-2.5 text-xs text-foam">
              {t.text}
            </div>
          ) : (
            <div key={i} className="mr-6 border border-instr/30 bg-instr/5 p-2.5 text-xs text-foam-soft">
              <div className="whitespace-pre-line">{t.text}</div>
              {t.refs && t.refs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.refs.map((r) => (
                    <Link
                      key={r.href + r.label}
                      href={r.href}
                      onClick={onClose}
                      className="border border-instr/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-instr hover:bg-instr/10"
                    >
                      {r.label} →
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      <div className="border-t border-line p-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
            if (e.key === "Escape") onClose();
          }}
          placeholder="“what's stuck” · “ENG-2026-0847” · “margin”…"
          className="w-full border border-line bg-void px-3 py-2 font-mono text-xs text-foam outline-none placeholder:text-foam-soft/40 focus:border-instr/50"
        />
      </div>
    </div>
  );
}
