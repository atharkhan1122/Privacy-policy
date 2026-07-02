import type { ShipmentState } from "@/core/types";
import { STATE_LABELS, MONEY_STATES, stateIndex } from "@/core/state-machine";
import { SHIPMENT_STATES } from "@/core/types";

/** Shared terminal-grade primitives. */

export function Mono({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${className}`}>
      {children}
    </span>
  );
}

export function Panel({
  title,
  fig,
  children,
  className = "",
  actions,
}: {
  title?: string;
  fig?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={`relative border border-line bg-hull ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-baseline gap-3">
            {fig && <Mono className="text-brass">{fig}</Mono>}
            <Mono className="text-foam-soft">{title}</Mono>
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  detail,
  tone = "foam",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "foam" | "instr" | "magenta" | "brass" | "danger";
}) {
  const toneClass = {
    foam: "text-foam",
    instr: "text-instr",
    magenta: "text-magenta",
    brass: "text-brass",
    danger: "text-danger",
  }[tone];
  return (
    <div className="border border-line bg-hull px-4 py-3">
      <Mono className="text-foam-soft">{label}</Mono>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      {detail && <div className="mt-0.5 text-xs text-foam-soft">{detail}</div>}
    </div>
  );
}

const STATE_TONES: Record<ShipmentState, string> = {
  INQUIRY: "border-foam-soft/40 text-foam-soft",
  QUOTE: "border-instr/60 text-instr",
  BOOKING: "border-magenta/70 text-magenta",
  DOCUMENTATION: "border-brass/60 text-brass",
  TRANSIT: "border-instr/60 text-instr",
  CUSTOMS: "border-brass/60 text-brass",
  SETTLEMENT: "border-magenta/70 text-magenta",
};

export function StateChip({ state }: { state: ShipmentState }) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${STATE_TONES[state]}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

/** The seven-state pipeline — FIG.1 of the chart, as a live component. */
export function Pipeline({ state }: { state: ShipmentState }) {
  const current = stateIndex(state);
  return (
    <div className="flex flex-wrap items-center gap-0">
      {SHIPMENT_STATES.map((s, i) => {
        const money = MONEY_STATES.includes(s);
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1 px-1">
              <span
                className={`h-3 w-3 rounded-full border-2 ${
                  money
                    ? active || done
                      ? "border-magenta bg-magenta"
                      : "border-magenta/50 bg-void"
                    : active
                      ? "border-instr bg-instr"
                      : done
                        ? "border-instr bg-void"
                        : "border-foam-soft/40 bg-void"
                } ${active ? "live-dot" : ""}`}
              />
              <Mono
                className={
                  active ? "text-foam" : done ? "text-foam-soft" : "text-foam-soft/50"
                }
              >
                {STATE_LABELS[s]}
              </Mono>
            </div>
            {i < SHIPMENT_STATES.length - 1 && (
              <span
                className={`mx-1 mb-4 h-px w-6 border-t border-dashed ${
                  i < current ? "border-instr/60" : "border-line"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Bar({
  pct,
  tone = "instr",
}: {
  pct: number;
  tone?: "instr" | "magenta" | "brass" | "danger";
}) {
  const toneClass = {
    instr: "bg-instr",
    magenta: "bg-magenta",
    brass: "bg-brass",
    danger: "bg-danger",
  }[tone];
  return (
    <div className="h-1.5 w-full bg-line-soft">
      <div
        className={`h-full ${toneClass}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

export function Btn({
  children,
  onClick,
  tone = "line",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "line" | "instr" | "magenta";
  disabled?: boolean;
}) {
  const cls = {
    line: "border-line text-foam-soft hover:border-foam-soft hover:text-foam",
    instr: "border-instr/60 text-instr hover:bg-instr/10",
    magenta: "border-magenta/70 text-magenta hover:bg-magenta/10",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return timeIn(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function timeIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return timeAgo(iso);
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 48) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

export function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}
