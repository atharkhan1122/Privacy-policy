"use client";

import Link from "next/link";
import { convertIntake, parseIntake, useWorld } from "@/core/store";
import { Bar, Btn, Mono, Panel, timeAgo } from "@/components/ui";
import type { ExtractedField, IntakeChannel } from "@/core/types";

const CHANNEL_ICON: Record<IntakeChannel, string> = {
  WHATSAPP: "◉ WhatsApp",
  EMAIL: "✉ Email",
  VOICE_NOTE: "♪ Voice",
  PDF: "▤ PDF",
  IMAGE: "▣ Image",
};

function FieldRow({ label, field, format }: { label: string; field: ExtractedField<unknown>; format?: (v: unknown) => string }) {
  const has = field.value !== null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5 text-[11px] last:border-0">
      <span className="font-mono uppercase tracking-[0.1em] text-foam-soft">{label}</span>
      <div className="flex items-center gap-2">
        <span className={has ? "text-foam" : "text-foam-soft/40"} title={field.source}>
          {has ? (format ? format(field.value) : String(field.value)) : "not found"}
        </span>
        {has && (
          <span className={`font-mono text-[10px] tabular-nums ${field.confidence >= 0.9 ? "text-instr" : field.confidence >= 0.7 ? "text-brass" : "text-danger"}`}>
            {(field.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function IntakePage() {
  const { world } = useWorld();

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">Deck 02 · The intake reader</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          Messy humans in. Structured shipments out.
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foam-soft">
          WhatsApp voice notes, forwarded email chains, photos of packing lists — the messier
          the input it survives, the wider the moat. Every field carries its own confidence.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {world.intake.map((msg) => (
          <Panel
            key={msg.id}
            title={`${CHANNEL_ICON[msg.channel]} · ${msg.from}`}
            actions={
              <Mono className={msg.status === "NEW" ? "text-brass" : msg.status === "CONVERTED" ? "text-magenta" : "text-instr"}>
                {msg.status}
              </Mono>
            }
          >
            <div className="px-4 py-3">
              <div className="border border-line-soft bg-void/60 p-3 text-xs italic text-foam-soft">
                “{msg.raw}”
              </div>
              <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.12em] text-foam-soft/60">
                received {timeAgo(msg.receivedAt)}
              </div>

              {msg.extraction && (
                <div className="mt-3 border border-instr/30 bg-instr/5 p-3">
                  <div className="flex items-center justify-between">
                    <Mono className="text-instr">AI extraction</Mono>
                    <Mono className="text-instr">
                      {(msg.extraction.overallConfidence * 100).toFixed(0)}% overall
                    </Mono>
                  </div>
                  <div className="mt-1 mb-2">
                    <Bar pct={msg.extraction.overallConfidence * 100} />
                  </div>
                  <FieldRow label="Origin" field={msg.extraction.origin} />
                  <FieldRow label="Destination" field={msg.extraction.destination} />
                  <FieldRow label="Commodity" field={msg.extraction.commodity} />
                  <FieldRow label="Weight" field={msg.extraction.weightKg} format={(v) => `${Number(v).toLocaleString()} kg`} />
                  <FieldRow label="Volume" field={msg.extraction.volumeCbm} format={(v) => `${v} cbm`} />
                  <FieldRow label="Pieces" field={msg.extraction.pieces} />
                  <FieldRow label="Incoterm" field={msg.extraction.incoterm} />
                  <FieldRow label="Mode" field={msg.extraction.mode} />
                  <FieldRow label="Needed by" field={msg.extraction.neededBy} />
                </div>
              )}

              <div className="mt-3 flex gap-2">
                {msg.status === "NEW" && (
                  <Btn tone="instr" onClick={() => parseIntake(msg.id)}>
                    Parse with AI
                  </Btn>
                )}
                {msg.status === "PARSED" && (
                  <Btn tone="magenta" onClick={() => convertIntake(msg.id)}>
                    Convert → shipment
                  </Btn>
                )}
                {msg.status === "CONVERTED" && msg.shipmentId && (
                  <Link
                    href={`/shipments/${msg.shipmentId}`}
                    className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-foam-soft hover:border-foam-soft hover:text-foam"
                  >
                    Open {msg.shipmentId} →
                  </Link>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
