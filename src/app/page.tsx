"use client";

import Link from "next/link";
import { recentEvents } from "@/core/store";
import { resolveException } from "@/core/commands";
import { useWorld } from "@/core/use-world";
import { agentActions } from "@/core/agent";
import { priorityQueue, type TaskKind } from "@/core/priority";
import { Bar, Btn, Mono, Panel, StatTile, StateChip, timeAgo, timeIn, usd } from "@/components/ui";
import type { ShipmentEvent } from "@/core/types";

const KIND_TONE: Record<TaskKind, string> = {
  APPROVAL: "text-brass",
  EXCEPTION: "text-danger",
  DOCUMENT: "text-brass",
  COLLECTION: "text-magenta",
  QUOTE_EXPIRING: "text-instr",
  INTAKE: "text-foam-soft",
};

const SEVERITY_TONE: Record<ShipmentEvent["severity"], string> = {
  INFO: "text-foam-soft",
  SUCCESS: "text-instr",
  WARNING: "text-brass",
  CRITICAL: "text-danger",
};

export default function ControlTower() {
  const { world } = useWorld();
  const events = recentEvents(18);

  const inTransit = world.shipments.filter((s) => s.state === "TRANSIT" || s.state === "CUSTOMS");
  const exceptions = world.shipments.filter((s) => s.hasOpenException);
  const active = world.shipments.filter((s) => s.state !== "SETTLEMENT");
  const pipelineRevenue = active.reduce((sum, s) => sum + s.revenue, 0);
  const bookedMargin = world.shipments.reduce((sum, s) => sum + (s.revenue - s.cost), 0);
  const newIntake = world.intake.filter((m) => m.status === "NEW").length;

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">Deck 01 · Control tower</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          The fleet, breathing.
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile
          label="Hours eliminated"
          value={world.hoursEliminated.toLocaleString()}
          detail="human work automated, all-time"
          tone="instr"
        />
        <StatTile label="Active shipments" value={String(active.length)} detail="pre-settlement" />
        <StatTile label="In flight" value={String(inTransit.length)} detail="transit + customs" tone="instr" />
        <StatTile
          label="Open exceptions"
          value={String(exceptions.length)}
          detail={exceptions.length ? "needs a human or the agent" : "clear board"}
          tone={exceptions.length ? "danger" : "instr"}
        />
        <StatTile label="Booked margin" value={usd(bookedMargin)} detail="all shipments, this view" tone="magenta" />
        <StatTile
          label="Unparsed intake"
          value={String(newIntake)}
          detail={newIntake ? "raw messages waiting" : "inbox structured"}
          tone={newIntake ? "brass" : "foam"}
        />
      </div>

      {/* Priority queue — the escalation engine's answer to "what now?" */}
      <Panel
        title="What needs a human — ranked"
        fig="FIG.0"
        actions={<Mono className="text-foam-soft">smart prioritization · re-scored live</Mono>}
      >
        {(() => {
          const queue = priorityQueue({
            shipments: world.shipments,
            invoices: world.invoices,
            quotes: world.quotes,
            intake: world.intake,
            documents: world.documents,
            actions: agentActions(),
          }).slice(0, 6);
          if (queue.length === 0)
            return (
              <div className="px-4 py-5 text-xs text-foam-soft">
                Queue is empty. The machine is running the shift alone.
              </div>
            );
          return queue.map((t, i) => (
            <Link
              key={t.id}
              href={t.href}
              className="flex items-center gap-4 border-b border-line-soft px-4 py-2.5 last:border-0 hover:bg-panel"
            >
              <span className="font-mono text-lg tabular-nums text-foam-soft/50">{i + 1}</span>
              <span className={`w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ${KIND_TONE[t.kind]}`}>
                {t.kind.replace(/_/g, " ")}
              </span>
              <span className="flex-1 text-xs">
                <span className="text-foam">{t.title}</span>
                <span className="ml-2 text-foam-soft/70">{t.why}</span>
              </span>
              <span className="w-16 shrink-0">
                <Bar pct={t.score} tone={t.score >= 80 ? "danger" : t.score >= 65 ? "brass" : "instr"} />
              </span>
            </Link>
          ));
        })()}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Fleet */}
        <Panel title="Fleet — every row is the same object" fig="FIG.1" className="xl:col-span-3">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-foam-soft">
                <th className="px-4 py-2 font-mono font-normal uppercase tracking-[0.12em]">Shipment</th>
                <th className="px-2 py-2 font-mono font-normal uppercase tracking-[0.12em]">Lane</th>
                <th className="px-2 py-2 font-mono font-normal uppercase tracking-[0.12em]">State</th>
                <th className="px-2 py-2 font-mono font-normal uppercase tracking-[0.12em]">ETA / need</th>
                <th className="px-4 py-2 text-right font-mono font-normal uppercase tracking-[0.12em]">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {world.shipments.map((s) => (
                <tr key={s.id} className="border-b border-line-soft hover:bg-panel">
                  <td className="px-4 py-2.5">
                    <Link href={`/shipments/${s.id}`} className="font-mono text-instr hover:underline">
                      {s.id}
                    </Link>
                    <div className="text-foam-soft">{s.ref}</div>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[11px] text-foam-soft">
                    {s.origin.slice(0, 5)} → {s.destination.slice(0, 5)}
                    <div className="text-foam-soft/60">{s.mode}</div>
                  </td>
                  <td className="px-2 py-2.5">
                    <StateChip state={s.state} />
                    {s.hasOpenException && (
                      <div className="mt-1 font-mono text-[10px] uppercase text-danger">exception</div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-foam-soft">
                    {s.eta ? (
                      <>
                        <span className={s.eta.deltaDays > 0 ? "text-brass" : "text-instr"}>
                          {s.eta.deltaDays > 0 ? `+${s.eta.deltaDays}d slip` : "on time"}
                        </span>
                        <div className="mt-1 w-20">
                          <Bar pct={s.eta.delayRisk * 100} tone={s.eta.delayRisk > 0.5 ? "danger" : "instr"} />
                        </div>
                      </>
                    ) : s.neededBy ? (
                      timeIn(s.neededBy)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {s.revenue ? usd(s.revenue) : <span className="text-foam-soft/50">unpriced</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-4 xl:col-span-2">
          {/* Exceptions */}
          <Panel title="Exception queue — before customers ask" fig="FIG.2">
            {exceptions.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-foam-soft">
                Clear board. The agent is watching so you don&apos;t have to.
              </div>
            ) : (
              exceptions.map((s) => (
                <div key={s.id} className="border-b border-line-soft px-4 py-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <Link href={`/shipments/${s.id}`} className="font-mono text-xs text-danger hover:underline">
                      {s.id}
                    </Link>
                    <Btn tone="instr" onClick={() => void resolveException(s.id)}>
                      Execute recovery
                    </Btn>
                  </div>
                  <div className="mt-1 text-xs text-foam-soft">
                    {world.tracking.find((t) => t.shipmentId === s.id && t.isException)?.description ??
                      "Open exception"}
                  </div>
                </div>
              ))
            )}
          </Panel>

          {/* Live event feed */}
          <Panel title="Event bus — the nervous system" fig="FIG.3">
            <div className="max-h-96 overflow-y-auto font-mono text-[11px]">
              {events.map((e) => (
                <div key={e.id} className="evt-in flex gap-3 border-b border-line-soft px-4 py-2 last:border-0">
                  <span className="whitespace-nowrap tabular-nums text-instr/70">{timeAgo(e.at)}</span>
                  <span className={SEVERITY_TONE[e.severity]}>
                    <Link href={`/shipments/${e.shipmentId}`} className="text-foam hover:underline">
                      {e.shipmentId}
                    </Link>{" "}
                    — {e.summary}
                  </span>
                </div>
              ))}
              {events.length === 0 && (
                <div className="px-4 py-6 text-center text-foam-soft">warming up…</div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
