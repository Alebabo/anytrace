import { differenceInCalendarDays, formatDistanceToNow, format } from "date-fns";
import type { ConvergenceMeta } from "@/data/types";

const SIGNAL_ICONS: Record<string, string> = {
  STARRED_REPO: "★",
  FORKED_REPO: "⑂",
  FOLLOWED: "↪",
  CONNECTED: "🔗",
  MENTIONED: "@",
  REPLIED: "💬",
  ENDORSED: "✓",
};

function signalLabel(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, HH:mm");
  } catch {
    return iso;
  }
}

export function WhyFired({
  meta,
  totalAlerts,
}: {
  meta: ConvergenceMeta;
  totalAlerts: number;
}) {
  const { scoreBreakdown } = meta;
  void scoreBreakdown;

  const span =
    meta.firstSignalAt && meta.lastSignalAt
      ? Math.max(
          0,
          differenceInCalendarDays(
            new Date(meta.lastSignalAt),
            new Date(meta.firstSignalAt)
          )
        )
      : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Why this fired
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums px-2 py-0.5 rounded-md bg-surface-sunken border border-border text-muted-foreground">
          #{meta.rank} / {totalAlerts}
        </span>
      </div>

      <p className="text-sm">
        <span className="font-semibold text-foreground">
          {meta.distinctMembers} watchlist member
          {meta.distinctMembers === 1 ? "" : "s"}
        </span>{" "}
        <span className="text-muted-foreground">signaled</span>
        <span className="text-muted-foreground">
          {" · score "}
          <span className="font-mono tabular-nums text-foreground">
            {meta.score.toFixed(1)}
          </span>
        </span>
      </p>

      {/* Timing */}
      <div className="mt-4 text-xs text-muted-foreground">
        First signal{" "}
        <span className="text-foreground">{fmt(meta.firstSignalAt)}</span>
        {meta.firstSignalAt && (
          <span className="text-muted-foreground/70">
            {" "}
            ({formatDistanceToNow(new Date(meta.firstSignalAt), { addSuffix: true })})
          </span>
        )}
        , latest <span className="text-foreground">{fmt(meta.lastSignalAt)}</span>
        {span !== null && (
          <>
            {" · "}
            <span className="text-foreground">
              {span} day{span === 1 ? "" : "s"} span
            </span>
          </>
        )}
      </div>

      {/* Signal type chips */}
      {Object.keys(meta.signalTypeCounts).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(meta.signalTypeCounts).map(([type, count]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-sunken border border-border text-[11px]"
            >
              <span className="text-foreground">
                {SIGNAL_ICONS[type] ?? "•"}
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {count}
              </span>
              <span className="text-muted-foreground">{signalLabel(type)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}