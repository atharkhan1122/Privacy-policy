"use client";

import { use } from "react";
import Link from "next/link";
import {
  advanceShipment,
  customerById,
  quoteShipment,
  acceptQuote,
  useWorld,
} from "@/core/store";
import { eventHistory } from "@/core/events";
import { canAdvance, nextState, STATE_LABELS } from "@/core/state-machine";
import { DOCUMENT_LABELS } from "@/core/documents";
import { AUTONOMY_LABELS, TASK_LABELS, agentActions } from "@/core/agent";
import { marginPct } from "@/core/finance";
import { Bar, Btn, Mono, Panel, Pipeline, timeAgo, usd } from "@/components/ui";

export default function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { world } = useWorld();
  const shipment = world.shipments.find((s) => s.id === id);

  if (!shipment) {
    return (
      <div className="py-20 text-center">
        <Mono className="text-danger">Unknown shipment {id}</Mono>
        <div className="mt-4">
          <Link href="/shipments" className="font-mono text-xs text-instr hover:underline">
            ← back to fleet
          </Link>
        </div>
      </div>
    );
  }

  const customer = customerById(shipment.customerId);
  const quotes = world.quotes.filter((q) => q.shipmentId === id);
  const docs = world.documents.filter((d) => d.shipmentId === id);
  const invoices = world.invoices.filter((i) => i.shipmentId === id);
  const tracking = world.tracking
    .filter((t) => t.shipmentId === id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const actions = agentActions().filter((a) => a.shipmentId === id);
  const events = [...eventHistory()].filter((e) => e.shipmentId === id).reverse();
  const next = nextState(shipment.state);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Mono className="text-instr">The shipment object · single source of truth</Mono>
          <h1 className="mt-1 font-mono text-2xl font-semibold text-foam">{shipment.id}</h1>
          <p className="text-sm text-foam-soft">
            {shipment.ref} · {customer?.name} · {shipment.incoterm}
          </p>
        </div>
        <div className="flex gap-2">
          {shipment.state === "INQUIRY" && (
            <Btn tone="instr" onClick={() => quoteShipment(shipment.id)}>
              Run quote engine
            </Btn>
          )}
          {next && shipment.state !== "INQUIRY" && (
            <Btn tone="line" onClick={() => advanceShipment(shipment.id)} disabled={!canAdvance(shipment)}>
              Advance → {STATE_LABELS[next]}
            </Btn>
          )}
        </div>
      </div>

      <Panel title="Lifecycle — seven states, two of them money" fig="FIG.1">
        <div className="px-4 py-4">
          <Pipeline state={shipment.state} />
          <div className="mt-3 text-xs text-foam-soft">
            In <span className="text-foam">{STATE_LABELS[shipment.state]}</span> since{" "}
            {timeAgo(shipment.stateEnteredAt)}
            {shipment.hasOpenException && (
              <span className="ml-2 text-danger">· open exception blocks advance</span>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cargo + parties */}
        <Panel title="Cargo & routing">
          <dl className="px-4 py-3 text-xs">
            {[
              ["Commodity", `${shipment.cargo.commodity}${shipment.cargo.hsCode ? ` · HS ${shipment.cargo.hsCode}` : ""}`],
              ["Weight / volume", `${shipment.cargo.weightKg.toLocaleString()} kg · ${shipment.cargo.volumeCbm} cbm · ${shipment.cargo.pieces} pcs`],
              ["Declared value", usd(shipment.cargo.value)],
              ["Route", `${shipment.origin} → ${shipment.destination}`],
              ["Mode / carrier", `${shipment.mode}${shipment.carrier ? ` · ${shipment.carrier}` : " · unassigned"}`],
              ["Voyage / flight", shipment.vesselOrFlight ?? "—"],
              ["Customer credit", customer ? `${customer.creditScore}/100 · pays in ~${customer.avgDaysToPay}d` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line-soft py-2 last:border-0">
                <dt className="font-mono uppercase tracking-[0.1em] text-foam-soft">{k}</dt>
                <dd className="text-right text-foam">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {/* Money view */}
        <Panel title="Money view — the same object, priced">
          <dl className="px-4 py-3 text-xs">
            <div className="flex justify-between border-b border-line-soft py-2">
              <dt className="font-mono uppercase tracking-[0.1em] text-foam-soft">Revenue</dt>
              <dd className="font-mono tabular-nums text-foam">{usd(shipment.revenue)}</dd>
            </div>
            <div className="flex justify-between border-b border-line-soft py-2">
              <dt className="font-mono uppercase tracking-[0.1em] text-foam-soft">Cost</dt>
              <dd className="font-mono tabular-nums text-foam">{usd(shipment.cost)}</dd>
            </div>
            <div className="flex justify-between border-b border-line-soft py-2">
              <dt className="font-mono uppercase tracking-[0.1em] text-foam-soft">Margin</dt>
              <dd className="font-mono tabular-nums text-magenta">
                {usd(shipment.revenue - shipment.cost)} · {marginPct(shipment)}%
              </dd>
            </div>
            {invoices.map((inv) => (
              <div key={inv.id} className="flex justify-between border-b border-line-soft py-2 last:border-0">
                <dt className="font-mono uppercase tracking-[0.1em] text-foam-soft">{inv.id}</dt>
                <dd className={`font-mono ${inv.status === "OVERDUE" ? "text-danger" : inv.status === "PAID" ? "text-instr" : "text-foam"}`}>
                  {usd(inv.amount)} · {inv.status.toLowerCase()}
                  {inv.financingOffered && <span className="ml-1 text-brass">· fin {inv.financingAprPct}%</span>}
                </dd>
              </div>
            ))}
            {invoices.length === 0 && (
              <div className="py-2 text-foam-soft">No invoice yet — issued automatically at booking.</div>
            )}
          </dl>
        </Panel>

        {/* Predictive ETA */}
        <Panel title="Predictive ETA — the graph speaks">
          <div className="px-4 py-3 text-xs">
            {shipment.eta ? (
              <>
                <div className="flex items-baseline justify-between">
                  <Mono className="text-foam-soft">Delay risk</Mono>
                  <span className={`font-mono text-lg tabular-nums ${shipment.eta.delayRisk > 0.5 ? "text-danger" : "text-instr"}`}>
                    {(shipment.eta.delayRisk * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1">
                  <Bar pct={shipment.eta.delayRisk * 100} tone={shipment.eta.delayRisk > 0.5 ? "danger" : "instr"} />
                </div>
                <div className="mt-3 text-foam-soft">
                  Promised {new Date(shipment.eta.promised).toLocaleDateString()} · model predicts{" "}
                  <span className={shipment.eta.deltaDays > 0 ? "text-brass" : "text-instr"}>
                    {shipment.eta.deltaDays > 0 ? `+${shipment.eta.deltaDays}d` : "on time"}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {shipment.eta.drivers.map((driver) => (
                    <li key={driver} className="border-l-2 border-line pl-2 text-foam-soft">
                      {driver}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="py-3 text-foam-soft">
                ETA model engages once the shipment is booked with a needed-by date.
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Quotes */}
      {quotes.length > 0 && (
        <Panel title="Quotes — generated in under 60 seconds" fig="FIG.2">
          {quotes.map((q) => (
            <div key={q.id} className="border-b border-line-soft px-4 py-3 last:border-0">
              <div className="flex items-center justify-between">
                <Mono className="text-foam">
                  {q.id} · {q.verdict.toLowerCase()} · generated in {(q.generatedInMs / 1000).toFixed(1)}s
                </Mono>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {q.options.map((o) => (
                  <div
                    key={o.id}
                    className={`border p-3 ${q.selectedOptionId === o.id ? "border-magenta bg-magenta/5" : "border-line"}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-xs uppercase tracking-[0.12em] text-instr">
                        {o.mode} · {o.carrier}
                      </span>
                      <span className="font-mono text-lg tabular-nums text-foam">{usd(o.sellTotal)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-foam-soft">
                      {o.transitDays}d transit · margin {o.marginPct}% · win probability{" "}
                      {(o.winProbability * 100).toFixed(0)}%
                    </div>
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-foam-soft/80">
                      <div className="flex justify-between">
                        <span>BASE</span>
                        <span className="tabular-nums">{usd(o.baseRate)}</span>
                      </div>
                      {o.surcharges.map((sc) => (
                        <div key={sc.code} className="flex justify-between" title={sc.reason}>
                          <span>{sc.code} · {sc.name}</span>
                          <span className="tabular-nums">{usd(sc.amount)}</span>
                        </div>
                      ))}
                    </div>
                    {q.verdict === "PENDING" && (
                      <div className="mt-3">
                        <Btn tone="magenta" onClick={() => acceptQuote(q.id, o.id)}>
                          Customer accepts → book
                        </Btn>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Documents */}
        <Panel title="Documents — paper as a view of the object">
          {docs.length === 0 ? (
            <div className="px-4 py-5 text-xs text-foam-soft">
              Generated automatically when the shipment reaches Documentation.
            </div>
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="border-b border-line-soft px-4 py-2.5 last:border-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foam">{DOCUMENT_LABELS[doc.type]}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${doc.issues.some((i) => i.severity === "ERROR") ? "text-danger" : "text-instr"}`}>
                    {doc.status}{doc.autoGenerated ? " · auto" : ""}
                  </span>
                </div>
                {doc.issues.map((issue) => (
                  <div
                    key={issue.message}
                    className={`mt-1.5 border-l-2 pl-2 text-[11px] ${issue.severity === "ERROR" ? "border-danger text-danger" : "border-brass text-brass"}`}
                  >
                    {issue.message}
                  </div>
                ))}
              </div>
            ))
          )}
        </Panel>

        {/* Agent activity */}
        <Panel title="Agent activity on this shipment">
          {actions.length === 0 ? (
            <div className="px-4 py-5 text-xs text-foam-soft">No agent actions yet.</div>
          ) : (
            actions.map((a) => (
              <div key={a.id} className="border-b border-line-soft px-4 py-2.5 last:border-0 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foam">{a.summary}</span>
                  <Mono className={a.status === "EXECUTED" ? "text-instr" : a.status === "ESCALATED" ? "text-danger" : "text-brass"}>
                    {a.status.replace(/_/g, " ")}
                  </Mono>
                </div>
                <div className="mt-1 text-foam-soft">
                  {TASK_LABELS[a.taskType]} · notch {a.levelUsed} ({AUTONOMY_LABELS[a.levelUsed]}) ·
                  confidence {(a.confidence * 100).toFixed(0)}% · {timeAgo(a.at)}
                </div>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* Timeline */}
      <Panel title="Timeline — tracking + events, one thread" fig="FIG.3">
        <div className="max-h-96 overflow-y-auto font-mono text-[11px]">
          {[
            ...tracking.map((t) => ({
              key: t.id,
              at: t.at,
              text: `${t.location} — ${t.description}`,
              tone: t.isException ? "text-danger" : "text-foam-soft",
            })),
            ...events.map((e) => ({
              key: e.id,
              at: e.at,
              text: e.summary,
              tone: e.severity === "SUCCESS" ? "text-instr" : e.severity === "WARNING" ? "text-brass" : "text-foam-soft",
            })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((row) => (
              <div key={row.key} className="flex gap-3 border-b border-line-soft px-4 py-2 last:border-0">
                <span className="whitespace-nowrap tabular-nums text-instr/70">{timeAgo(row.at)}</span>
                <span className={row.tone}>{row.text}</span>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}
