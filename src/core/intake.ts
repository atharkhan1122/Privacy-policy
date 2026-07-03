import type {
  ExtractedField,
  IntakeExtraction,
  IntakeMessage,
  Incoterm,
  TransportMode,
} from "./types";

/**
 * AI Intake Engine.
 *
 * Converts messy human communication — WhatsApp messages, voice-note
 * transcripts, forwarded email chains, OCR'd packing lists — into a
 * structured shipment with per-field confidence.
 *
 * This implementation is a deterministic extraction pipeline so the platform
 * runs self-contained. In production the `extract` function is backed by an
 * LLM with structured output (see ARCHITECTURE.md → AI plane); the interface
 * and every consumer stay identical.
 */

const INCOTERMS: Incoterm[] = [
  "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP",
];

const KNOWN_PLACES: Record<string, string> = {
  shanghai: "CNSHA Shanghai",
  ningbo: "CNNGB Ningbo",
  shenzhen: "CNSZX Shenzhen",
  rotterdam: "NLRTM Rotterdam",
  hamburg: "DEHAM Hamburg",
  felixstowe: "GBFXT Felixstowe",
  "jebel ali": "AEJEA Jebel Ali",
  dubai: "AEJEA Jebel Ali",
  lagos: "NGLOS Lagos",
  "nhava sheva": "INNSA Nhava Sheva",
  mumbai: "INNSA Nhava Sheva",
  singapore: "SGSIN Singapore",
  "los angeles": "USLAX Los Angeles",
  "new york": "USNYC New York",
  santos: "BRSSZ Santos",
  karachi: "PKKHI Karachi",
  jeddah: "SAJED Jeddah",
  mombasa: "KEMBA Mombasa",
  istanbul: "TRIST Istanbul",
  antwerp: "BEANR Antwerp",
};

function field<T>(value: T | null, confidence: number, source: string): ExtractedField<T> {
  return { value, confidence: value === null ? 0 : confidence, source };
}

function findPlaces(text: string): { name: string; code: string; index: number }[] {
  const lower = text.toLowerCase();
  const hits: { name: string; code: string; index: number }[] = [];
  for (const [name, code] of Object.entries(KNOWN_PLACES)) {
    const index = lower.indexOf(name);
    if (index >= 0 && !hits.some((h) => h.code === code)) {
      hits.push({ name, code, index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function num(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  const n = parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function extract(message: Pick<IntakeMessage, "raw" | "from">): IntakeExtraction {
  const raw = message.raw;
  const lower = raw.toLowerCase();

  // Origin / destination: explicit "from X to Y" beats positional order.
  const places = findPlaces(raw);
  let origin: ExtractedField<string> = field<string>(null, 0, "");
  let destination: ExtractedField<string> = field<string>(null, 0, "");
  const fromTo = lower.match(/from\s+([a-z ]+?)\s+to\s+([a-z ]+?)(?:[.,\n]|$)/);
  if (fromTo) {
    const o = findPlaces(fromTo[1])[0];
    const d = findPlaces(fromTo[2])[0];
    if (o) origin = field(o.code, 0.97, `"from ${fromTo[1].trim()}"`);
    if (d) destination = field(d.code, 0.97, `"to ${fromTo[2].trim()}"`);
  }
  if (!origin.value && places[0]) origin = field(places[0].code, 0.72, `first place mentioned: "${places[0].name}"`);
  if (!destination.value && places[1]) destination = field(places[1].code, 0.72, `second place mentioned: "${places[1].name}"`);

  // Weight: kg or tons.
  let weightKg: ExtractedField<number> = field<number>(null, 0, "");
  const kg = raw.match(/([\d,.]+)\s*(?:kg|kgs|kilos?)/i);
  const tons = raw.match(/([\d,.]+)\s*(?:tons?|tonnes?|mt)\b/i);
  if (kg) weightKg = field(num(kg), 0.95, kg[0]);
  else if (tons) {
    const t = num(tons);
    weightKg = field(t === null ? null : t * 1000, 0.9, tons[0]);
  }

  // Volume.
  const cbmMatch = raw.match(/([\d,.]+)\s*(?:cbm|m3|m³|cubic)/i);
  const volumeCbm = field(num(cbmMatch), 0.94, cbmMatch?.[0] ?? "");

  // Pieces: pallets, cartons, containers.
  const pcs = raw.match(/(\d+)\s*(?:pallets?|cartons?|boxes|pcs|pieces|crates?|containers?|x\s*40|x\s*20)/i);
  const pieces = field(pcs ? parseInt(pcs[1], 10) : null, 0.9, pcs?.[0] ?? "");

  // Incoterm.
  const incotermHit = INCOTERMS.find((t) => new RegExp(`\\b${t}\\b`, "i").test(raw)) ?? null;
  const incoterm = field<Incoterm>(incotermHit, 0.98, incotermHit ?? "");

  // Mode: explicit keyword, else inferred from urgency.
  let mode: ExtractedField<TransportMode> = field<TransportMode>(null, 0, "");
  if (/\b(air|fly|flight|awb)\b/i.test(raw)) mode = field("AIR", 0.93, "mentions air/flight");
  else if (/\b(sea|ocean|vessel|container|fcl|lcl|teu)\b/i.test(raw)) mode = field("OCEAN", 0.93, "mentions sea/container");
  else if (/\b(truck|road|land)\b/i.test(raw)) mode = field("LAND", 0.93, "mentions truck/road");
  else if (/\b(urgent|asap|rush)\b/i.test(raw)) mode = field("AIR", 0.6, "inferred from urgency");

  // Commodity: "of X", "shipment of X", or a noun phrase near weight.
  let commodity: ExtractedField<string> = field<string>(null, 0, "");
  const commodityMatch = raw.match(
    /(?:of|carrying|containing|with)\s+([a-z][a-z /-]{2,40}?)(?:\s+from|\s+to|[.,\n]|$)/i
  );
  if (commodityMatch) commodity = field(commodityMatch[1].trim(), 0.8, commodityMatch[0].trim());

  // Needed-by date (very loose).
  const dateMatch = raw.match(
    /(?:by|before|latest|deadline|deliver(?:y)? by)\s+((?:\d{1,2}[\s/-])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}|\d{4}-\d{2}-\d{2})/i
  );
  const neededBy = field(dateMatch ? dateMatch[1].trim() : null, 0.75, dateMatch?.[0] ?? "");

  // Customer: sender identity is the strongest signal.
  const customerName = field(message.from, 0.99, "sender identity");

  const fields = [origin, destination, commodity, weightKg, volumeCbm, pieces, incoterm, mode, neededBy];
  const populated = fields.filter((f) => f.value !== null);
  const overallConfidence =
    populated.length === 0
      ? 0
      : populated.reduce((s, f) => s + f.confidence, 0) / populated.length;

  return {
    origin,
    destination,
    commodity,
    weightKg,
    volumeCbm,
    pieces,
    incoterm,
    mode,
    neededBy,
    customerName,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };
}
