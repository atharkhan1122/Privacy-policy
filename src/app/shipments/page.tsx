"use client";

import Link from "next/link";
import { useState } from "react";
import { customerById } from "@/core/store";
import { useWorld } from "@/core/use-world";
import { Mono, Panel, StateChip, timeAgo, usd } from "@/components/ui";
import { SHIPMENT_STATES, type ShipmentState } from "@/core/types";
import { STATE_LABELS } from "@/core/state-machine";
import { marginPct } from "@/core/finance";

export default function ShipmentsPage() {
  const { world } = useWorld();
  const [filter, setFilter] = useState<ShipmentState | "ALL">("ALL");

  const list = world.shipments.filter((s) => filter === "ALL" || s.state === filter);

  return (
    <div className="space-y-5">
      <div>
        <Mono className="text-instr">The atom</Mono>
        <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
          One object rules the company.
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foam-soft">
          The CRM is a view of shipments-by-customer. The ledger is shipments-by-money. The
          task list is shipments-by-what&apos;s-stuck. This is the object itself.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("ALL")}
          className={`border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
            filter === "ALL" ? "border-instr text-instr" : "border-line text-foam-soft"
          }`}
        >
          All · {world.shipments.length}
        </button>
        {SHIPMENT_STATES.map((s) => {
          const count = world.shipments.filter((x) => x.state === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
                filter === s ? "border-instr text-instr" : "border-line text-foam-soft"
              }`}
            >
              {STATE_LABELS[s]} · {count}
            </button>
          );
        })}
      </div>

      <Panel title={`${list.length} shipment(s)`}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-foam-soft">
              {["Shipment", "Customer", "Lane · mode", "Cargo", "State", "Margin", "Age"].map((h, i) => (
                <th
                  key={h}
                  className={`py-2 font-mono font-normal uppercase tracking-[0.12em] ${i === 0 ? "px-4" : "px-2"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const customer = customerById(s.customerId);
              const m = marginPct(s);
              return (
                <tr key={s.id} className="border-b border-line-soft hover:bg-panel">
                  <td className="px-4 py-2.5">
                    <Link href={`/shipments/${s.id}`} className="font-mono text-instr hover:underline">
                      {s.id}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">{customer?.name ?? "—"}</td>
                  <td className="px-2 py-2.5 font-mono text-[11px] text-foam-soft">
                    {s.origin} → {s.destination}
                    <div className="text-foam-soft/60">
                      {s.mode} · {s.incoterm}
                      {s.carrier ? ` · ${s.carrier}` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-foam-soft">
                    {s.cargo.commodity}
                    <div className="text-foam-soft/60">
                      {s.cargo.weightKg.toLocaleString()} kg · {s.cargo.volumeCbm} cbm
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <StateChip state={s.state} />
                  </td>
                  <td className="px-2 py-2.5 font-mono tabular-nums">
                    {s.revenue ? (
                      <span className={m >= 18 ? "text-instr" : "text-brass"}>
                        {m}% · {usd(s.revenue - s.cost)}
                      </span>
                    ) : (
                      <span className="text-foam-soft/50">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-foam-soft">{timeAgo(s.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
