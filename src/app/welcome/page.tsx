import Link from "next/link";
import { Pipeline } from "@/components/ui";

export const metadata = {
  title: "The Engine Room — The AI Operating System for Global Freight",
  description:
    "Everything is a view of the shipment. AI intake, a 60-second quote engine, an autonomous agent, and a finance layer — one object, seven states.",
};

const FEATURES: { fig: string; title: string; body: string }[] = [
  {
    fig: "01",
    title: "AI intake",
    body: "WhatsApp voice notes, forwarded email chains, photos of packing lists — messy human input becomes a structured shipment, every field carrying its own confidence.",
  },
  {
    fig: "02",
    title: "60-second quote engine",
    body: "Rate memory, a surcharge resolver, and a margin brain price an inquiry in under a second — with the reasoning shown, not hidden.",
  },
  {
    fig: "03",
    title: "The autonomous agent",
    body: "Autonomy earned in four notches, per task type. Below its confidence or above its value ceiling it hands to a human with full context.",
  },
  {
    fig: "04",
    title: "The Night Shift",
    body: "Go to sleep. The machine parses the inbox, prices, books inside its ceilings, and queues everything bigger for one tap at 07:00.",
  },
  {
    fig: "05",
    title: "Document intelligence",
    body: "Bills of lading, invoices, packing lists — read, cross-checked against the shipment, and flagged before they cost you a demurrage day.",
  },
  {
    fig: "06",
    title: "Finance & the trade graph",
    body: "Money is just two more states of the same object. Aging, forecasting, and a trade graph that turns your history into an edge.",
  },
];

function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass">
          Chart Nº 004 · live
        </div>
        <div className="text-sm font-semibold uppercase tracking-wide text-foam">
          The Engine Room
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-foam-soft hover:text-foam"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="border border-instr/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-instr hover:bg-instr/10"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <TopBar />

      {/* Hero */}
      <section className="px-6 py-16 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-instr">
          The AI Operating System for Global Freight
        </div>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold uppercase leading-tight tracking-wide text-foam md:text-5xl">
          Everything is a view of the shipment.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-foam-soft">
          One object moves through seven states — Inquiry to Settlement — and the whole
          platform is just different lenses on it. Intake, quoting, booking, documents,
          transit, customs, and money, run by an engine that earns your trust one notch
          at a time.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="border border-magenta/70 px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-magenta hover:bg-magenta/10"
          >
            Start free — 5 shipments
          </Link>
          <Link
            href="/pricing"
            className="border border-line px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-foam-soft hover:border-foam-soft hover:text-foam"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* The seven states */}
      <section className="border-y border-line bg-hull/40 px-6 py-10">
        <div className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-foam-soft">
          One object · seven states
        </div>
        <div className="flex justify-center overflow-x-auto">
          <Pipeline state="TRANSIT" />
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-px bg-line px-0 py-0 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.fig} className="bg-void p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass">
              FIG.{f.fig}
            </div>
            <h3 className="mt-2 text-sm font-semibold uppercase tracking-wide text-foam">
              {f.title}
            </h3>
            <p className="mt-2 text-sm text-foam-soft">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Pricing teaser */}
      <section className="px-6 py-14 text-center">
        <h2 className="text-2xl font-semibold uppercase tracking-wide text-foam">
          Run one desk free. Run the fleet on Pro.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-foam-soft">
          Free gets you the object and the engine — up to five active shipments, no card
          required. Pro turns on the autonomy: unlimited shipments, the Night Shift, full
          agent autonomy, and the trade graph.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="border border-instr/60 px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-instr hover:bg-instr/10"
          >
            Create free account
          </Link>
          <Link
            href="/pricing"
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-foam-soft hover:text-foam"
          >
            Compare plans →
          </Link>
        </div>
      </section>

      <footer className="border-t border-line px-6 py-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-foam-soft/60">
        The Engine Room · the operating system of global trade
      </footer>
    </div>
  );
}
