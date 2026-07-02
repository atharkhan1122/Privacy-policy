"use client";

import Link from "next/link";
import {
  AUTONOMY_LABELS,
  TASK_LABELS,
  agentActions,
  approve,
  autonomyGrants,
  reject,
  setAutonomyLevel,
} from "@/core/agent";
import { forceNotify, runNightShift, useWorld } from "@/core/store";
import { Btn, Mono, Panel, timeAgo, usd } from "@/components/ui";
import type { AutonomyLevel } from "@/core/types";

function shiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function AgentPage() {
  const { world } = useWorld(); // subscribe for re-render on any event
  const grants = autonomyGrants();
  const actions = agentActions();
  const queue = actions.filter((a) => a.status === "AWAITING_APPROVAL" || a.status === "ESCALATED");
  const shift = world.lastShift;

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">Deck 03 · The agent</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          Autonomy is earned in four notches.
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foam-soft">
          One notch per earned success, per task type. Every notch a user grants is switching
          cost in its purest form — they haven&apos;t stored data with you, they&apos;ve trained a
          colleague.
        </p>
      </div>

      {/* Trust dial */}
      <Panel title="The trust dial — per task type" fig="FIG.1">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-foam-soft">
              {["Task type", "Autonomy", "Earned over", "Value ceiling", "Set notch"].map((h, i) => (
                <th key={h} className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.taskType} className="border-b border-line-soft">
                <td className="px-4 py-2.5 text-foam">{TASK_LABELS[g.taskType]}</td>
                <td className="px-2 py-2.5">
                  <span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${g.level === 4 ? "text-magenta" : "text-instr"}`}>
                    {g.level} · {AUTONOMY_LABELS[g.level]}
                  </span>
                </td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">
                  {g.earnedOver} actions
                </td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">{usd(g.valueCeiling)}</td>
                <td className="px-2 py-2.5">
                  <div className="flex gap-1">
                    {([1, 2, 3, 4] as AutonomyLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => {
                          setAutonomyLevel(g.taskType, lvl);
                          forceNotify();
                        }}
                        title={AUTONOMY_LABELS[lvl]}
                        className={`h-6 w-6 border font-mono text-[10px] ${
                          g.level === lvl
                            ? lvl === 4
                              ? "border-magenta bg-magenta/20 text-magenta"
                              : "border-instr bg-instr/10 text-instr"
                            : "border-line text-foam-soft hover:border-foam-soft"
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2.5 text-[11px] text-foam-soft">
          Perceive → Recall → Decide → Escalate. Below 85% confidence or above the value ceiling,
          the agent always hands to a human with full context — the best agents are famous for
          what they refuse to do alone.
        </div>
      </Panel>

      {/* The night shift */}
      <Panel
        title="The night shift — Deck 06, executable"
        fig="FIG.1b"
        actions={
          <Btn tone="magenta" onClick={() => runNightShift()}>
            ▶ Run 8h autonomous shift
          </Btn>
        }
      >
        {!shift ? (
          <div className="px-4 py-5 text-xs text-foam-soft">
            Go to sleep. The machine parses the inbox, prices, books inside its ceilings, holds
            everything bigger for one tap at 07:00 — then files this report. Press run to watch
            eight hours pass.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-px border-b border-line bg-line md:grid-cols-6">
              {[
                ["Intake parsed", String(shift.intakeParsed)],
                ["Quotes sent", String(shift.quotesSent)],
                ["Bookings", `${shift.bookingsMade} · ${usd(shift.revenueBooked)}`],
                ["Updates sent", String(shift.updatesSent)],
                ["Queued for 07:00", String(shift.queuedForMorning)],
                ["Hours eliminated", `${shift.hoursEliminated}h`],
              ].map(([k, v]) => (
                <div key={k} className="bg-hull px-3 py-2.5">
                  <Mono className="text-foam-soft">{k}</Mono>
                  <div className="mt-0.5 font-mono text-lg tabular-nums text-instr">{v}</div>
                </div>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto font-mono text-[11px]">
              {shift.log.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-3 border-b border-line-soft px-4 py-2 last:border-0 ${
                    entry.kind === "HUMAN_QUEUED" ? "bg-magenta-ink/10" : ""
                  }`}
                >
                  <span className={`whitespace-nowrap tabular-nums ${entry.kind === "HUMAN_QUEUED" ? "text-magenta" : "text-instr/70"}`}>
                    {shiftTime(entry.at)}
                  </span>
                  <span className={entry.kind === "INFO" ? "text-foam" : "text-foam-soft"}>{entry.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Approval queue */}
      <Panel
        title="Approval queue — one tap, full context"
        fig="FIG.2"
        actions={<Mono className={queue.length ? "text-brass" : "text-instr"}>{queue.length} waiting</Mono>}
      >
        {queue.length === 0 ? (
          <div className="px-4 py-5 text-xs text-foam-soft">
            Nothing waiting on you. Sleep — the machine will queue the morning&apos;s decisions.
          </div>
        ) : (
          queue.map((a) => (
            <div key={a.id} className="border-b border-line-soft px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="text-foam">{a.summary}</span>
                  <div className="mt-1 text-foam-soft">
                    <Link href={`/shipments/${a.shipmentId}`} className="font-mono text-instr hover:underline">
                      {a.shipmentId}
                    </Link>{" "}
                    · {TASK_LABELS[a.taskType]} · confidence {(a.confidence * 100).toFixed(0)}% · at stake{" "}
                    {usd(a.valueAtStake)}
                  </div>
                  {a.escalationReason && (
                    <div className="mt-1 border-l-2 border-brass pl-2 text-[11px] text-brass">
                      {a.escalationReason}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Btn
                    tone="instr"
                    onClick={() => {
                      approve(a.id);
                      forceNotify();
                    }}
                  >
                    Approve
                  </Btn>
                  <Btn
                    tone="line"
                    onClick={() => {
                      reject(a.id);
                      forceNotify();
                    }}
                  >
                    Reject
                  </Btn>
                </div>
              </div>
            </div>
          ))
        )}
      </Panel>

      {/* Action log */}
      <Panel title="Action log — the machine's shift report" fig="FIG.3">
        <div className="max-h-[28rem] overflow-y-auto">
          {actions.map((a) => (
            <div key={a.id} className="border-b border-line-soft px-4 py-2.5 text-xs last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-foam">{a.summary}</span>
                <Mono
                  className={
                    a.status === "EXECUTED"
                      ? "text-instr"
                      : a.status === "REJECTED"
                        ? "text-danger"
                        : a.status === "ESCALATED" || a.status === "AWAITING_APPROVAL"
                          ? "text-brass"
                          : "text-foam-soft"
                  }
                >
                  {a.status.replace(/_/g, " ")}
                </Mono>
              </div>
              <div className="mt-1 text-foam-soft">{a.detail}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foam-soft/60">
                <Link href={`/shipments/${a.shipmentId}`} className="text-instr/80 hover:underline">
                  {a.shipmentId}
                </Link>{" "}
                · notch {a.levelUsed} ({AUTONOMY_LABELS[a.levelUsed]}) · {timeAgo(a.at)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
