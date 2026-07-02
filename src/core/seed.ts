import type {
  Customer,
  IntakeMessage,
  Invoice,
  Shipment,
  ShipmentDocument,
  TrackingEvent,
  ValidationIssue,
} from "./types";
import { predictEta } from "./trade-graph";
import { seedAction } from "./agent";

/**
 * Seed world: a mid-sized Gulf forwarder ("Meridian Cargo LLC, Dubai") six
 * months into running on The Engine Room. Timestamps are computed relative
 * to boot so the terminal always feels live.
 */

const now = Date.now();
const h = (hours: number) => new Date(now - hours * 3600_000).toISOString();
const d = (days: number) => new Date(now - days * 86_400_000).toISOString();
const ahead = (days: number) => new Date(now + days * 86_400_000).toISOString();

export const CUSTOMERS: Customer[] = [
  { id: "cust-1", name: "Adeyemi Machinery Ltd", country: "Nigeria", creditScore: 74, avgDaysToPay: 41, churnRisk: 0.08, acceptsSpeedPremium: true },
  { id: "cust-2", name: "Rheinland Autoteile GmbH", country: "Germany", creditScore: 88, avgDaysToPay: 22, churnRisk: 0.04, acceptsSpeedPremium: false },
  { id: "cust-3", name: "Gulf Horizon Trading", country: "UAE", creditScore: 63, avgDaysToPay: 38, churnRisk: 0.31, acceptsSpeedPremium: false },
  { id: "cust-4", name: "Pacific Components Inc", country: "USA", creditScore: 91, avgDaysToPay: 18, churnRisk: 0.05, acceptsSpeedPremium: true },
  { id: "cust-5", name: "Anadolu Tekstil A.Ş.", country: "Türkiye", creditScore: 57, avgDaysToPay: 52, churnRisk: 0.44, acceptsSpeedPremium: false },
  { id: "cust-6", name: "Nairobi AgriSupply Co", country: "Kenya", creditScore: 68, avgDaysToPay: 33, churnRisk: 0.12, acceptsSpeedPremium: false },
];

export const SHIPMENTS: Shipment[] = [
  {
    id: "ENG-2026-0847", ref: "Adeyemi · machine parts · air",
    state: "TRANSIT", customerId: "cust-1",
    origin: "NGLOS Lagos", destination: "AEJEA Jebel Ali",
    mode: "AIR", incoterm: "CIF",
    cargo: { commodity: "machine parts", hsCode: "8483.40", weightKg: 1240, volumeCbm: 4.2, pieces: 3, hazardous: false, value: 86_000 },
    carrier: "Emirates SkyCargo", vesselOrFlight: "EK 784",
    neededBy: ahead(2), createdAt: d(3), stateEnteredAt: h(14),
    revenue: 12_400, cost: 9_770, hasOpenException: false,
    sourceIntakeId: "in-1",
  },
  {
    id: "ENG-2026-0846", ref: "Rheinland · auto parts · ocean",
    state: "CUSTOMS", customerId: "cust-2",
    origin: "INNSA Nhava Sheva", destination: "DEHAM Hamburg",
    mode: "OCEAN", incoterm: "FOB",
    cargo: { commodity: "auto components", hsCode: "8708.99", weightKg: 18_400, volumeCbm: 41, pieces: 24, hazardous: false, value: 210_000 },
    carrier: "Hapag-Lloyd", vesselOrFlight: "Hansa Kirkenes V.226",
    neededBy: ahead(4), createdAt: d(31), stateEnteredAt: h(9),
    revenue: 8_950, cost: 7_420, hasOpenException: false,
  },
  {
    id: "ENG-2026-0845", ref: "Pacific · electronics · ocean",
    state: "TRANSIT", customerId: "cust-4",
    origin: "SGSIN Singapore", destination: "USLAX Los Angeles",
    mode: "OCEAN", incoterm: "CIF",
    cargo: { commodity: "consumer electronics", hsCode: "8517.62", weightKg: 9_600, volumeCbm: 38, pieces: 16, hazardous: false, value: 384_000 },
    carrier: "ONE", vesselOrFlight: "ONE Innovation V.081E",
    neededBy: ahead(9), createdAt: d(16), stateEnteredAt: d(11),
    revenue: 6_800, cost: 5_390, hasOpenException: true,
  },
  {
    id: "ENG-2026-0844", ref: "Gulf Horizon · solar panels · ocean",
    state: "DOCUMENTATION", customerId: "cust-3",
    origin: "CNSHA Shanghai", destination: "AEJEA Jebel Ali",
    mode: "OCEAN", incoterm: "DAP",
    cargo: { commodity: "solar panels", hsCode: "8541.43", weightKg: 22_000, volumeCbm: 54, pieces: 28, hazardous: false, value: 148_000 },
    carrier: "COSCO", vesselOrFlight: "COSCO Faith V.312W",
    neededBy: ahead(21), createdAt: d(6), stateEnteredAt: h(30),
    revenue: 7_300, cost: 5_960, hasOpenException: false,
  },
  {
    id: "ENG-2026-0843", ref: "Anadolu · textiles · land",
    state: "SETTLEMENT", customerId: "cust-5",
    origin: "TRIST Istanbul", destination: "GBFXT Felixstowe",
    mode: "LAND", incoterm: "DDP",
    cargo: { commodity: "woven textiles", hsCode: "5407.61", weightKg: 6_200, volumeCbm: 29, pieces: 340, hazardous: false, value: 52_000 },
    carrier: "Ekol", vesselOrFlight: "Route TR-UK-114",
    createdAt: d(19), stateEnteredAt: d(2),
    revenue: 5_100, cost: 4_180, hasOpenException: false,
  },
  {
    id: "ENG-2026-0842", ref: "Nairobi Agri · fertilizer · ocean",
    state: "BOOKING", customerId: "cust-6",
    origin: "AEJEA Jebel Ali", destination: "KEMBA Mombasa",
    mode: "OCEAN", incoterm: "CFR",
    cargo: { commodity: "fertilizer (non-haz grade)", hsCode: "3105.20", weightKg: 48_000, volumeCbm: 62, pieces: 2, hazardous: false, value: 39_000 },
    carrier: "MSC",
    neededBy: ahead(18), createdAt: d(2), stateEnteredAt: h(5),
    revenue: 4_950, cost: 4_030, hasOpenException: false,
  },
  {
    id: "ENG-2026-0841", ref: "Pacific · chip-fab spares · air",
    state: "QUOTE", customerId: "cust-4",
    origin: "SGSIN Singapore", destination: "USLAX Los Angeles",
    mode: "AIR", incoterm: "CIP",
    cargo: { commodity: "semiconductor equipment spares", hsCode: "8486.90", weightKg: 480, volumeCbm: 2.1, pieces: 6, hazardous: false, value: 240_000 },
    neededBy: ahead(6), createdAt: h(7), stateEnteredAt: h(6),
    revenue: 0, cost: 0, hasOpenException: false,
  },
  {
    id: "ENG-2026-0840", ref: "Gulf Horizon · aircon units · ocean",
    state: "INQUIRY", customerId: "cust-3",
    origin: "CNSHA Shanghai", destination: "AEJEA Jebel Ali",
    mode: "OCEAN", incoterm: "CIF",
    cargo: { commodity: "air-conditioning units", hsCode: "8415.10", weightKg: 14_800, volumeCbm: 44, pieces: 96, hazardous: false, value: 118_000 },
    neededBy: ahead(30), createdAt: h(2), stateEnteredAt: h(2),
    revenue: 0, cost: 0, hasOpenException: false,
    sourceIntakeId: "in-2",
  },
  {
    id: "ENG-2026-0839", ref: "Adeyemi · generators · ocean",
    state: "SETTLEMENT", customerId: "cust-1",
    origin: "AEJEA Jebel Ali", destination: "NGLOS Lagos",
    mode: "OCEAN", incoterm: "CIF",
    cargo: { commodity: "diesel generators", hsCode: "8502.11", weightKg: 26_000, volumeCbm: 48, pieces: 8, hazardous: false, value: 164_000 },
    carrier: "CMA CGM", vesselOrFlight: "CMA CGM Lagos Express V.44",
    createdAt: d(38), stateEnteredAt: d(5),
    revenue: 9_600, cost: 7_680, hasOpenException: false,
  },
];

// Attach ETA predictions to in-flight shipments.
for (const s of SHIPMENTS) {
  if ((s.state === "TRANSIT" || s.state === "CUSTOMS") && s.neededBy) {
    s.eta = predictEta(s, s.neededBy);
  }
}

export const INTAKE_MESSAGES: IntakeMessage[] = [
  {
    id: "in-3", channel: "WHATSAPP", from: "Adeyemi Machinery Ltd",
    receivedAt: h(0.4), status: "NEW",
    raw: "[voice note · 0:41 transcript] Hello, we need another urgent one. Three pallets machine parts again, about 1,100 kg, from Lagos to Jebel Ali. Same as last time, CIF. Must arrive before 15 Jul. Photo of packing list attached.",
  },
  {
    id: "in-4", channel: "EMAIL", from: "Rheinland Autoteile GmbH",
    receivedAt: h(1.7), status: "NEW",
    raw: "Subject: FW: RE: RE: Q3 volumes\n\nHi team, per the chain below — please quote sea freight for 2 containers of auto components from Nhava Sheva to Hamburg, roughly 19 tons, 43 cbm, FOB Nhava Sheva. Delivery by 20 Aug latest. Regards, S. Krämer",
  },
  {
    id: "in-1", channel: "WHATSAPP", from: "Adeyemi Machinery Ltd",
    receivedAt: d(3), status: "CONVERTED", shipmentId: "ENG-2026-0847",
    raw: "[voice note · 0:38 transcript] Urgent — 3 pallets of machine parts, 1,240 kg, Lagos to Dubai by air. CIF. Need them within the week. Packing list photo attached.",
  },
  {
    id: "in-2", channel: "PDF", from: "Gulf Horizon Trading",
    receivedAt: h(2), status: "CONVERTED", shipmentId: "ENG-2026-0840",
    raw: "[OCR of purchase order PDF] 96 cartons air-conditioning units, 14,800 kg / 44 cbm, ocean freight Shanghai to Jebel Ali, CIF Jebel Ali, latest shipment date within 30 days.",
  },
];

export const TRACKING_EVENTS: TrackingEvent[] = [
  { id: "trk-1", shipmentId: "ENG-2026-0847", at: h(14), location: "LOS Murtala Muhammed", description: "Departed on EK 784 — wheels up 22:41 local", isException: false },
  { id: "trk-2", shipmentId: "ENG-2026-0847", at: h(6), location: "DXB Al Maktoum", description: "Arrived, awaiting breakdown", isException: false },
  { id: "trk-3", shipmentId: "ENG-2026-0845", at: d(4), location: "Pacific, 31°N 158°W", description: "Vessel reduced speed — port congestion management at USLAX", isException: false },
  { id: "trk-4", shipmentId: "ENG-2026-0845", at: h(11), location: "USLAX San Pedro anchorage", description: "EXCEPTION: berth wait now estimated 4.2 days (was 1.5). ETA at risk.", isException: true },
  { id: "trk-5", shipmentId: "ENG-2026-0846", at: h(9), location: "DEHAM Waltershof", description: "Customs entry filed — awaiting release, ATB matched", isException: false },
  { id: "trk-6", shipmentId: "ENG-2026-0844", at: h(30), location: "CNSHA Yangshan", description: "Booking confirmed on COSCO Faith V.312W — docs cut-off in 4 days", isException: false },
];

export const DOCUMENTS: ShipmentDocument[] = [
  { id: "doc-s1", shipmentId: "ENG-2026-0846", type: "BILL_OF_LADING", status: "VALIDATED", autoGenerated: true, issues: [], createdAt: d(28) },
  { id: "doc-s2", shipmentId: "ENG-2026-0846", type: "COMMERCIAL_INVOICE", status: "VALIDATED", autoGenerated: true, issues: [], createdAt: d(28) },
  { id: "doc-s3", shipmentId: "ENG-2026-0846", type: "PACKING_LIST", status: "VALIDATED", autoGenerated: true, issues: [], createdAt: d(28) },
  { id: "doc-s4", shipmentId: "ENG-2026-0846", type: "CUSTOMS_DECLARATION", status: "SENT", autoGenerated: true, issues: [], createdAt: h(10) },
  { id: "doc-s5", shipmentId: "ENG-2026-0844", type: "COMMERCIAL_INVOICE", status: "GENERATED", autoGenerated: true, issues: [], createdAt: h(26) },
  {
    id: "doc-s6", shipmentId: "ENG-2026-0844", type: "PACKING_LIST", status: "DRAFT", autoGenerated: false, createdAt: h(20),
    issues: [
      { severity: "ERROR", field: "weightKg", message: "Packing list total 21,300 kg ≠ commercial invoice 22,000 kg (Δ 700 kg)", documents: ["PACKING_LIST", "COMMERCIAL_INVOICE"] },
      { severity: "WARNING", field: "pieces", message: "Carton count 27 on packing list vs 28 booked — verify short-ship", documents: ["PACKING_LIST"] },
    ],
  },
  { id: "doc-s7", shipmentId: "ENG-2026-0847", type: "AIR_WAYBILL", status: "SIGNED", autoGenerated: true, issues: [], createdAt: d(2) },
  { id: "doc-s8", shipmentId: "ENG-2026-0847", type: "COMMERCIAL_INVOICE", status: "SENT", autoGenerated: true, issues: [], createdAt: d(2) },
];

export const SEEDED_ISSUES: ValidationIssue[] = [];

export const INVOICES: Invoice[] = [
  { id: "INV-088", shipmentId: "ENG-2026-0843", customerId: "cust-5", amount: 5_100, currency: "USD", issuedAt: d(2), dueAt: ahead(12), status: "ISSUED", financingOffered: true, financingAprPct: 13 },
  { id: "INV-087", shipmentId: "ENG-2026-0839", customerId: "cust-1", amount: 9_600, currency: "USD", issuedAt: d(5), dueAt: ahead(25), status: "ISSUED", financingOffered: true, financingAprPct: 9.5 },
  { id: "INV-086", shipmentId: "ENG-2026-0847", customerId: "cust-1", amount: 12_400, currency: "USD", issuedAt: d(2), dueAt: ahead(28), status: "ISSUED", financingOffered: true, financingAprPct: 9.5 },
  { id: "INV-081", shipmentId: "ENG-2026-0846", customerId: "cust-2", amount: 8_950, currency: "USD", issuedAt: d(24), dueAt: d(2), status: "OVERDUE", financingOffered: false },
  { id: "INV-074", shipmentId: "ENG-2026-0845", customerId: "cust-4", amount: 6_800, currency: "USD", issuedAt: d(14), dueAt: ahead(16), status: "PAID", financingOffered: false },
];

/** Pre-boot agent history so the console shows the machine already at work. */
export function seedAgentHistory(): void {
  seedAction({
    shipmentId: "ENG-2026-0847", taskType: "QUOTE", levelUsed: 4,
    summary: "Quoted Lagos→Jebel Ali air, 2 options, sent to customer",
    detail: "Rate memory + live index. Margin brain: customer accepts speed premiums; lane tightening +4% this week. Notch 4 earned over 214 prior quotes.",
    confidence: 0.97, valueAtStake: 12_400, status: "EXECUTED", at: d(3),
  });
  seedAction({
    shipmentId: "ENG-2026-0847", taskType: "BOOKING", levelUsed: 3,
    summary: "Booking $12,400 held for approval — above night threshold",
    detail: "Customer accepted air option at 02:31. Credit check green (41-day average payer). Value exceeds notch-4 ceiling → one-tap approval queued for 07:00 with full context.",
    confidence: 0.94, valueAtStake: 12_400, status: "EXECUTED",
    escalationReason: "Value above autonomous ceiling during night hours", at: d(3),
  });
  seedAction({
    shipmentId: "ENG-2026-0845", taskType: "EXCEPTION_HANDLING", levelUsed: 2,
    summary: "Drafted customer advisory + 2 recovery options for USLAX berth delay",
    detail: "Berth wait 4.2d. Option A: hold ETA, notify consignee. Option B: discharge at USOAK + truck, +$1,850, saves 3 days. Draft ready for review.",
    confidence: 0.81, valueAtStake: 1_850, status: "DRAFTED", at: h(10),
  });
  seedAction({
    shipmentId: "ENG-2026-0844", taskType: "DOCUMENTS", levelUsed: 4,
    summary: "Flagged 700 kg weight mismatch between packing list and invoice",
    detail: "Cross-validation on inbound packing list vs commercial invoice. Shipper contacted for corrected document; docs cut-off in 4 days.",
    confidence: 0.99, valueAtStake: 0, status: "EXECUTED", at: h(19),
  });
  seedAction({
    shipmentId: "ENG-2026-0846", taskType: "COLLECTIONS", levelUsed: 2,
    summary: "Drafted dunning notice for INV-081 (2 days overdue)",
    detail: "Rheinland Autoteile normally pays in 22 days — this is out of pattern. Gentle reminder drafted; churn model shows no elevated risk.",
    confidence: 0.88, valueAtStake: 8_950, status: "AWAITING_APPROVAL", at: h(3),
  });
}
