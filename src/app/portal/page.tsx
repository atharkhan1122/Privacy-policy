"use client";

import { useState } from "react";
import { customers } from "@/core/store";
import { payInvoice } from "@/core/commands";
import { useWorld } from "@/core/use-world";
import { DOCUMENT_LABELS } from "@/core/documents";
import { Bar, Btn, Mono, Panel, Pipeline, StateChip, timeAgo, timeIn, usd } from "@/components/ui";

/**
 * The Customer Portal — the counterparty side of the platform. Every business
 * a forwarder invites here is a counterparty link; that squared term is the
 * Law of Lock.
 */
export default function PortalPage() {
  const { world } = useWorld();
  const allCustomers = customers();
  const [customerId, setCustomerId] = useState(allCustomers[0].id);
  const customer = allCustomers.find((c) => c.id === customerId)!;

  const shipments = world.shipments.filter((s) => s.customerId === customerId);
  const invoices = world.invoices.filter((i) => i.customerId === customerId);
  const openInvoices = invoices.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
  const quotes = world.quotes.filter((q) =>
    shipments.some((s) => s.id === q.shipmentId && q.verdict === "PENDING")
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Mono className="text-instr">Customer portal · counterparty view</Mono>
          <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide">
            What your customer sees.
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-foam-soft">
            Track, approve, download, pay, finance — self-serve. Every counterparty on the
            platform is a thread stitching two businesses into the fabric.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCustomers.map((c) => (
            <button
              key={c.id}
              onClick={() => setCustomerId(c.id)}
              className={`border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
                c.id === customerId ? "border-instr text-instr" : "border-line text-foam-soft"
              }`}
            >
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Simulated portal frame */}
      <div className="border border-magenta/40">
        <div className="flex items-center justify-between border-b border-magenta/40 bg-magenta/5 px-4 py-2">
          <Mono className="text-magenta">portal.engineroom.app / {customer.name}</Mono>
          <Mono className="text-foam-soft">logged in · {customer.country}</Mono>
        </div>

        <div className="space-y-4 p-4">
          {/* Quote approvals */}
          {quotes.length > 0 && (
            <Panel title="Quotations awaiting your approval">
              {quotes.map((q) => (
                <div key={q.id} className="border-b border-line-soft px-4 py-3 text-xs last:border-0">
                  <div className="text-foam">
                    {q.id} — {q.options.length} option(s), valid 48h. Open the quote on the
                    operations side to accept an option and watch this portal update live.
                  </div>
                </div>
              ))}
            </Panel>
          )}

          {/* Shipments */}
          <Panel title="Your shipments — live">
            {shipments.length === 0 ? (
              <div className="px-4 py-5 text-xs text-foam-soft">No shipments yet.</div>
            ) : (
              shipments.map((s) => (
                <div key={s.id} className="border-b border-line-soft px-4 py-3 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-mono text-instr">{s.id}</span>
                      <span className="ml-2 text-foam-soft">
                        {s.cargo.commodity} · {s.origin} → {s.destination}
                      </span>
                    </div>
                    <StateChip state={s.state} />
                  </div>
                  <div className="mt-3">
                    <Pipeline state={s.state} />
                  </div>
                  {s.eta && (
                    <div className="mt-2 text-[11px] text-foam-soft">
                      Arrival{" "}
                      <span className={s.eta.deltaDays > 0 ? "text-brass" : "text-instr"}>
                        {timeIn(s.eta.predicted)}
                        {s.eta.deltaDays > 0 ? ` (${s.eta.deltaDays}d behind original plan — we already told you why)` : " · on schedule"}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {world.documents
                      .filter((d) => d.shipmentId === s.id)
                      .map((d) => (
                        <span key={d.id} className="border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-foam-soft">
                          ↓ {DOCUMENT_LABELS[d.type]}
                        </span>
                      ))}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Invoices + pay */}
            <Panel title="Invoices & payments">
              {invoices.length === 0 ? (
                <div className="px-4 py-5 text-xs text-foam-soft">Nothing due.</div>
              ) : (
                invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border-b border-line-soft px-4 py-2.5 text-xs last:border-0">
                    <div>
                      <span className="font-mono text-foam">{inv.id}</span>
                      <span className="ml-2 text-foam-soft">
                        {inv.status === "PAID"
                          ? `paid · thank you`
                          : inv.status === "OVERDUE"
                            ? `was due ${timeAgo(inv.dueAt)}`
                            : `due ${timeIn(inv.dueAt)}`}
                      </span>
                      {inv.financingOffered && inv.status !== "PAID" && (
                        <div className="mt-0.5 text-brass">
                          ◈ Finance this invoice at {inv.financingAprPct}% APR — 60 extra days
                        </div>
                      )}
                    </div>
                    <span className={`font-mono tabular-nums ${inv.status === "PAID" ? "text-instr" : inv.status === "OVERDUE" ? "text-danger" : "text-foam"}`}>
                      {usd(inv.amount)}
                    </span>
                  </div>
                ))
              )}
              {openInvoices.length > 0 && (
                <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
                  <Mono className="text-foam-soft">
                    {openInvoices.length} open invoice(s)
                  </Mono>
                  <Btn
                    tone="magenta"
                    onClick={() => {
                      for (const inv of openInvoices) void payInvoice(inv.id);
                    }}
                  >
                    ▸ Pay {usd(openInvoices.reduce((s, i) => s + i.amount, 0))} now
                  </Btn>
                </div>
              )}
            </Panel>

            {/* AI support */}
            <Panel title="Ask us anything — AI support, 24/7">
              <div className="space-y-2 px-4 py-3 text-xs">
                <div className="ml-8 border border-line-soft bg-panel p-2.5 text-foam">
                  Where is my container and will it clear before the weekend?
                </div>
                <div className="mr-8 border border-instr/30 bg-instr/5 p-2.5 text-foam-soft">
                  {shipments.find((s) => s.state === "CUSTOMS" || s.state === "TRANSIT") ? (
                    <>
                      Your shipment{" "}
                      <span className="font-mono text-instr">
                        {shipments.find((s) => s.state === "CUSTOMS" || s.state === "TRANSIT")!.id}
                      </span>{" "}
                      is {shipments.find((s) => s.state === "CUSTOMS") ? "in customs — entry filed, release expected within 24h" : "in transit and tracking to plan"}.
                      I&apos;ll message you the moment anything changes. Nothing needed from you.
                    </>
                  ) : (
                    <>You have no shipments in motion right now. Your last settlement closed clean — want a quote for the next one?</>
                  )}
                </div>
                <div className="pt-1">
                  <div className="flex items-center gap-2 border border-line px-3 py-2 text-foam-soft/50">
                    <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-instr" />
                    Type a message… (demo)
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* Relationship health, quietly */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="border border-line bg-hull px-4 py-3">
              <Mono className="text-foam-soft">Shipments with us</Mono>
              <div className="mt-1 font-mono text-2xl tabular-nums text-foam">{shipments.length}</div>
            </div>
            <div className="border border-line bg-hull px-4 py-3">
              <Mono className="text-foam-soft">Credit standing</Mono>
              <div className="mt-1 font-mono text-2xl tabular-nums text-instr">{customer.creditScore}/100</div>
              <div className="mt-1"><Bar pct={customer.creditScore} /></div>
            </div>
            <div className="border border-line bg-hull px-4 py-3">
              <Mono className="text-foam-soft">Typical payment</Mono>
              <div className="mt-1 font-mono text-2xl tabular-nums text-foam">{customer.avgDaysToPay}d</div>
            </div>
            <div className="border border-line bg-hull px-4 py-3">
              <Mono className="text-foam-soft">Financing available</Mono>
              <div className="mt-1 font-mono text-2xl tabular-nums text-brass">
                {customer.creditScore >= 55 ? "YES" : "SOON"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
