import type { Customer, Invoice, Shipment } from "./types";
import { emit } from "./events";

/**
 * Financial Layer — invoices, receivables, credit, financing, margin.
 * Money is not a module bolted on the side: an invoice is a shipment viewed
 * by its settlement obligations.
 */

let invSeq = 100;

export function invoiceSeq(): number {
  return invSeq;
}

export function restoreInvoiceSeq(seq: number): void {
  invSeq = seq;
}

export function issueInvoice(
  shipment: Shipment,
  customer: Customer,
  at?: string
): Invoice {
  const issuedAt = at ?? new Date().toISOString();
  const termsDays = customer.creditScore >= 70 ? 30 : 14;
  const invoice: Invoice = {
    id: `INV-${++invSeq}`,
    shipmentId: shipment.id,
    customerId: customer.id,
    amount: shipment.revenue,
    currency: "USD",
    issuedAt,
    dueAt: new Date(new Date(issuedAt).getTime() + termsDays * 86_400_000).toISOString(),
    status: "ISSUED",
    // Slow payers with decent credit are the financing sweet spot.
    financingOffered: customer.avgDaysToPay > 30 && customer.creditScore >= 55,
    financingAprPct: customer.creditScore >= 70 ? 9.5 : 13,
  };
  emit(
    "invoice.issued",
    shipment.id,
    `${invoice.id} issued: $${invoice.amount.toLocaleString()} net ${termsDays}${invoice.financingOffered ? " · financing offered" : ""}`,
    "INFO",
    at
  );
  return invoice;
}

export function markPaid(
  invoice: Invoice,
  at?: string,
  payment?: { method?: string; reference?: string }
): void {
  invoice.status = "PAID";
  invoice.paidAt = at ?? new Date().toISOString();
  if (payment?.method) invoice.paymentMethod = payment.method;
  if (payment?.reference) invoice.paymentReference = payment.reference;
  const via = invoice.paymentMethod ? ` via ${invoice.paymentMethod}` : "";
  const ref = invoice.paymentReference ? ` (ref ${invoice.paymentReference})` : "";
  emit(
    "payment.received",
    invoice.shipmentId,
    `${invoice.id} paid: $${invoice.amount.toLocaleString()}${via}${ref}`,
    "SUCCESS",
    at
  );
}

export interface AgingBucket {
  label: string;
  invoices: Invoice[];
  total: number;
}

export function receivablesAging(invoices: Invoice[], now = new Date()): AgingBucket[] {
  const open = invoices.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
  const buckets: { label: string; min: number; max: number }[] = [
    { label: "Current", min: -Infinity, max: 0 },
    { label: "1–30 days", min: 0, max: 30 },
    { label: "31–60 days", min: 30, max: 60 },
    { label: "60+ days", min: 60, max: Infinity },
  ];
  return buckets.map(({ label, min, max }) => {
    const list = open.filter((i) => {
      const overdueDays = (now.getTime() - new Date(i.dueAt).getTime()) / 86_400_000;
      return overdueDays > min && overdueDays <= max;
    });
    return { label, invoices: list, total: list.reduce((s, i) => s + i.amount, 0) };
  });
}

export function marginPct(shipment: Shipment): number {
  if (shipment.revenue === 0) return 0;
  return Math.round(((shipment.revenue - shipment.cost) / shipment.revenue) * 1000) / 10;
}
