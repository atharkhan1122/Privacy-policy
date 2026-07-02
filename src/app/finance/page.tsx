"use client";

import Link from "next/link";
import { customerById, customers, useWorld } from "@/core/store";
import { receivablesAging, marginPct } from "@/core/finance";
import { Bar, Mono, Panel, StatTile, timeAgo, timeIn, usd } from "@/components/ui";

export default function FinancePage() {
  const { world } = useWorld();
  const invoices = world.invoices;
  const open = invoices.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
  const openTotal = open.reduce((s, i) => s + i.amount, 0);
  const paidTotal = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const totalMargin = world.shipments.reduce((s, x) => s + (x.revenue - x.cost), 0);
  const financeable = open.filter((i) => i.financingOffered);
  const aging = receivablesAging(invoices);

  const priced = world.shipments.filter((s) => s.revenue > 0);
  const avgMargin = priced.length
    ? Math.round((priced.reduce((s, x) => s + marginPct(x), 0) / priced.length) * 10) / 10
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">The money view</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          An invoice is a shipment viewed by its obligations.
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open receivables" value={usd(openTotal)} detail={`${open.length} invoices`} tone="brass" />
        <StatTile label="Collected" value={usd(paidTotal)} tone="instr" />
        <StatTile label="Total margin booked" value={usd(totalMargin)} detail={`avg ${avgMargin}% per shipment`} tone="magenta" />
        <StatTile
          label="Financing pipeline"
          value={usd(financeable.reduce((s, i) => s + i.amount, 0))}
          detail={`${financeable.length} offers out`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Receivables aging" fig="FIG.1">
          <div className="px-4 py-3">
            {aging.map((bucket) => {
              const pct = openTotal ? (bucket.total / openTotal) * 100 : 0;
              return (
                <div key={bucket.label} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-xs">
                    <Mono className="text-foam-soft">{bucket.label}</Mono>
                    <span className="font-mono tabular-nums text-foam">
                      {usd(bucket.total)} · {bucket.invoices.length} inv
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar pct={pct} tone={bucket.label === "60+ days" ? "danger" : bucket.label === "31–60 days" ? "brass" : "instr"} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Credit desk — score every counterparty" fig="FIG.2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-foam-soft">
                {["Customer", "Credit", "Pays in", "Churn risk"].map((h, i) => (
                  <th key={h} className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers().map((c) => (
                <tr key={c.id} className="border-b border-line-soft">
                  <td className="px-4 py-2">
                    {c.name}
                    <div className="text-foam-soft/60">{c.country}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`font-mono tabular-nums ${c.creditScore >= 70 ? "text-instr" : c.creditScore >= 55 ? "text-brass" : "text-danger"}`}>
                      {c.creditScore}/100
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums text-foam-soft">{c.avgDaysToPay}d</td>
                  <td className="px-2 py-2">
                    <span className={`font-mono tabular-nums ${c.churnRisk > 0.3 ? "text-danger" : c.churnRisk > 0.1 ? "text-brass" : "text-instr"}`}>
                      {(c.churnRisk * 100).toFixed(0)}%
                    </span>
                    {c.churnRisk > 0.3 && (
                      <div className="text-[10px] uppercase tracking-[0.1em] text-danger">intervene</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Invoice ledger" fig="FIG.3">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-foam-soft">
              {["Invoice", "Shipment", "Customer", "Amount", "Status", "Due", "Financing"].map((h, i) => (
                <th key={h} className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-line-soft hover:bg-panel">
                <td className="px-4 py-2.5 font-mono text-foam">{inv.id}</td>
                <td className="px-2 py-2.5">
                  <Link href={`/shipments/${inv.shipmentId}`} className="font-mono text-instr hover:underline">
                    {inv.shipmentId}
                  </Link>
                </td>
                <td className="px-2 py-2.5 text-foam-soft">{customerById(inv.customerId)?.name}</td>
                <td className="px-2 py-2.5 font-mono tabular-nums text-foam">{usd(inv.amount)}</td>
                <td className="px-2 py-2.5">
                  <Mono className={inv.status === "PAID" ? "text-instr" : inv.status === "OVERDUE" ? "text-danger" : "text-brass"}>
                    {inv.status}
                  </Mono>
                </td>
                <td className="px-2 py-2.5 text-foam-soft">
                  {inv.status === "PAID" ? "—" : inv.status === "OVERDUE" ? `${timeAgo(inv.dueAt)}` : timeIn(inv.dueAt)}
                </td>
                <td className="px-2 py-2.5 text-foam-soft">
                  {inv.financingOffered ? (
                    <span className="text-brass">offered · {inv.financingAprPct}% APR</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
