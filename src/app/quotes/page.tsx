"use client";

import Link from "next/link";
import { acceptQuote, quoteShipment, useWorld, customerById } from "@/core/store";
import { suggestMarginPct, winProbability, knownLanes } from "@/core/quote-engine";
import { laneByKey } from "@/core/trade-graph";
import { Btn, Mono, Panel, timeAgo, usd } from "@/components/ui";

export default function QuotesPage() {
  const { world } = useWorld();
  const unquoted = world.shipments.filter((s) => s.state === "INQUIRY");

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">Deck 02 · The engine</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          Inside the four minutes.
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foam-soft">
          Rate memory → surcharge resolver → margin brain → win/loss loop. The engine
          doesn&apos;t just quote — it gets better at winning with every rejection.
        </p>
      </div>

      {/* Inquiries awaiting the engine */}
      <Panel title="Inquiries awaiting quotation" fig="FIG.1">
        {unquoted.length === 0 ? (
          <div className="px-4 py-5 text-xs text-foam-soft">
            Nothing waiting. New inquiries land here from the intake reader.
          </div>
        ) : (
          unquoted.map((s) => {
            const customer = customerById(s.customerId);
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-0">
                <div className="text-xs">
                  <Link href={`/shipments/${s.id}`} className="font-mono text-instr hover:underline">
                    {s.id}
                  </Link>
                  <span className="ml-2 text-foam-soft">
                    {customer?.name} · {s.origin} → {s.destination} · {s.cargo.weightKg.toLocaleString()} kg
                  </span>
                </div>
                <Btn tone="instr" onClick={() => quoteShipment(s.id)}>
                  Quote in &lt;60s
                </Btn>
              </div>
            );
          })
        )}
      </Panel>

      {/* Live quotes */}
      <Panel title="Quotes on the wire" fig="FIG.2">
        {world.quotes.length === 0 ? (
          <div className="px-4 py-5 text-xs text-foam-soft">No quotes generated yet this session.</div>
        ) : (
          world.quotes.map((q) => {
            const s = world.shipments.find((x) => x.id === q.shipmentId);
            return (
              <div key={q.id} className="border-b border-line-soft px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-mono text-foam">{q.id}</span>
                    <Link href={`/shipments/${q.shipmentId}`} className="ml-2 font-mono text-instr hover:underline">
                      {q.shipmentId}
                    </Link>
                    <span className="ml-2 text-foam-soft">{s?.ref}</span>
                  </div>
                  <Mono className={q.verdict === "WON" ? "text-magenta" : q.verdict === "PENDING" ? "text-brass" : "text-foam-soft"}>
                    {q.verdict} · {timeAgo(q.createdAt)} · {(q.generatedInMs / 1000).toFixed(1)}s to price
                  </Mono>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {q.options.map((o) => (
                    <div key={o.id} className={`flex items-center justify-between border px-3 py-2 text-xs ${q.selectedOptionId === o.id ? "border-magenta bg-magenta/5" : "border-line-soft"}`}>
                      <div>
                        <span className="font-mono uppercase tracking-[0.1em] text-instr">{o.mode}</span>
                        <span className="ml-2 text-foam-soft">{o.carrier} · {o.transitDays}d</span>
                        <div className="mt-0.5 text-[10px] text-foam-soft/70">
                          margin {o.marginPct}% · P(win) {(o.winProbability * 100).toFixed(0)}% · {o.surcharges.length} surcharges
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono tabular-nums text-foam">{usd(o.sellTotal)}</span>
                        {q.verdict === "PENDING" && (
                          <Btn tone="magenta" onClick={() => acceptQuote(q.id, o.id)}>
                            Accept
                          </Btn>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Panel>

      {/* Margin brain */}
      <Panel title="Margin brain — what each lane bears" fig="FIG.3">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-foam-soft">
              {["Lane", "Suggested margin", "P(win) at suggestion", "Signal"].map((h, i) => (
                <th key={h} className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {knownLanes().map((lane) => {
              const pct = suggestMarginPct(lane);
              const stats = laneByKey(lane);
              return (
                <tr key={lane} className="border-b border-line-soft">
                  <td className="px-4 py-2 font-mono text-foam-soft">{lane}</td>
                  <td className="px-2 py-2 font-mono tabular-nums text-instr">{pct}%</td>
                  <td className="px-2 py-2 font-mono tabular-nums text-foam">
                    {(winProbability(lane, pct) * 100).toFixed(0)}%
                  </td>
                  <td className="px-2 py-2 text-foam-soft">
                    {stats
                      ? `rates ${stats.rateTrendPct >= 0 ? "+" : ""}${stats.rateTrendPct}% w/w · demand ${(stats.demandIndex * 100).toFixed(0)}%`
                      : "no graph signal yet"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
