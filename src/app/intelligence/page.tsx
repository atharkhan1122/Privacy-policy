"use client";

import { carrierScores, laneStats } from "@/core/trade-graph";
import { useWorld } from "@/core/use-world";
import { Bar, Mono, Panel, StatTile } from "@/components/ui";

export default function IntelligencePage() {
  useWorld();
  const lanes = laneStats();
  const carriers = carrierScores();
  const totalObs = lanes.reduce((s, l) => s + l.observations, 0);

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">The trade intelligence graph</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          Your data is yours. The pattern is ours.
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foam-soft">
          The index publishes only lane-level aggregates with minimum density thresholds — no
          single firm&apos;s position can be reverse-read. Every settled shipment makes the next
          quote, for someone else, smarter.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Lanes above density floor" value={String(lanes.length)} />
        <StatTile label="Observations in graph" value={totalObs.toLocaleString()} tone="instr" />
        <StatTile label="Carriers scored" value={String(carriers.length)} />
        <StatTile label="Density floor" value="25 obs" detail="below this, never published" tone="brass" />
      </div>

      <Panel title="Lane index — aggregates only" fig="FIG.1">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-foam-soft">
              {["Lane", "Mode", "Median transit", "Rate trend w/w", "Congestion", "Customs", "Demand", "Obs"].map((h, i) => (
                <th key={h} className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.map((l) => (
              <tr key={l.lane} className="border-b border-line-soft hover:bg-panel">
                <td className="px-4 py-2.5 font-mono text-foam">{l.lane}</td>
                <td className="px-2 py-2.5 text-foam-soft">{l.mode}</td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">{l.medianTransitDays}d</td>
                <td className={`px-2 py-2.5 font-mono tabular-nums ${l.rateTrendPct > 0 ? "text-magenta" : "text-instr"}`}>
                  {l.rateTrendPct > 0 ? "▲" : "▼"} {Math.abs(l.rateTrendPct).toFixed(1)}%
                </td>
                <td className="px-2 py-2.5">
                  <div className="w-16">
                    <Bar pct={l.congestionIndex * 100} tone={l.congestionIndex > 0.5 ? "danger" : "instr"} />
                  </div>
                </td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">
                  {l.customsDelayDays.toFixed(1)}d
                </td>
                <td className="px-2 py-2.5">
                  <div className="w-16">
                    <Bar pct={l.demandIndex * 100} tone="brass" />
                  </div>
                </td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">
                  {l.observations.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Carrier scorecards" fig="FIG.2">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-foam-soft">
              {["Carrier", "Mode", "On-time", "Rolling risk", "Doc accuracy", "Scored on"].map((h, i) => (
                <th key={h} className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carriers.map((c) => (
              <tr key={c.carrier} className="border-b border-line-soft hover:bg-panel">
                <td className="px-4 py-2.5 text-foam">{c.carrier}</td>
                <td className="px-2 py-2.5 text-foam-soft">{c.mode}</td>
                <td className="px-2 py-2.5">
                  <span className={`font-mono tabular-nums ${c.onTimePct >= 80 ? "text-instr" : c.onTimePct >= 73 ? "text-brass" : "text-danger"}`}>
                    {c.onTimePct}%
                  </span>
                </td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">{c.rollingRiskPct}%</td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">{c.docAccuracyPct}%</td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam-soft">
                  {c.shipmentsScored.toLocaleString()} shipments
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
