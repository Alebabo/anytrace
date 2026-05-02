import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  Linkedin,
  Search,
  Twitter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useDossiers, useInvestors } from "@/hooks/useApi";
import { formatRelative } from "@/lib/format";
import { useOfflineFallback } from "@/hooks/useOfflineFallback";
import { InvestorAvatar } from "@/components/converge/InvestorAvatar";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { EvidenceItem } from "@/components/converge/EvidenceItem";
import { WhyFired } from "@/components/converge/WhyFired";
import type { ConvergenceAlert, Dossier, Investor } from "@/data/types";

function score(a: ConvergenceAlert) {
  const investors = new Set(a.signals.map((s) => s.investorId)).size;
  return investors * 10 + a.signals.length;
}

function scoreColor(pct: number): string {
  // pct = 0..100 confidence
  if (pct >= 70)
    return "bg-[hsl(152_70%_92%)] text-[hsl(152_75%_25%)] border-[hsl(152_55%_70%)]";
  if (pct >= 40)
    return "bg-muted text-muted-foreground border-border";
  return "bg-[hsl(8_85%_94%)] text-[hsl(8_75%_38%)] border-[hsl(8_70%_75%)]";
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span className="inline-flex items-baseline px-2 py-1 rounded-md border border-border bg-muted text-muted-foreground font-mono text-xs tabular-nums">
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-baseline gap-0.5 px-2 py-1 rounded-md border font-mono text-xs tabular-nums ${scoreColor(
        value
      )}`}
      title={`Dossier confidence ${value}%`}
    >
      <span className="font-semibold">{value}</span>
      <span className="text-[10px] opacity-70">%</span>
    </span>
  );
}

export default function Index() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const alertsQuery = useAlerts();
  const investorsQuery = useInvestors();
  const dossiersQuery = useDossiers();
  const offline = useOfflineFallback(alertsQuery);

  const alerts = (offline.data?.alerts ?? alertsQuery.data ?? []) as ConvergenceAlert[];
  const investors = (offline.data?.investors ?? investorsQuery.data ?? []) as Investor[];
  const dossiers = (dossiersQuery.data ?? []) as Dossier[];
  const confidenceByFounder = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dossiers) {
      const pct = Math.round((d.confidence ?? 0) * 100);
      if (d.target_person_id) m.set(d.target_person_id, pct);
      if (d.target_name) m.set(d.target_name.toLowerCase(), pct);
    }
    return m;
  }, [dossiers]);
  const confidenceFor = (a: ConvergenceAlert): number | null => {
    return (
      confidenceByFounder.get(a.founder.id) ??
      confidenceByFounder.get(a.founder.name.toLowerCase()) ??
      null
    );
  };
  const investorById = useMemo(() => {
    const map = new Map(investors.map((i) => [i.id, i]));
    return (id: string): Investor =>
      map.get(id) ?? {
        id,
        name: "Unknown",
        title: "",
        tier: "vc",
        avatarColor: "0 0% 50%",
        group: "",
      };
  }, [investors]);

  const ranked = useMemo(
    () => alerts.slice().sort((a, b) => score(b) - score(a)),
    [alerts]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? ranked.filter((a) =>
          [a.founder.name, a.founder.headline, a.founder.location, a.founder.company ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : ranked;
    // Cap Today's Outreach to the top 12 picks (within the 10–15 sweet spot).
    return filtered.slice(0, 12);
  }, [ranked, query]);

  const isLoading = alertsQuery.isLoading && !offline.data;
  const isError = alertsQuery.isError && !offline.data;

  return (
    <div className="px-4 md:px-10 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h2 className="font-serif text-4xl md:text-5xl leading-[1.02] text-balance">
          Top picks <span className="text-muted-foreground">for outreach</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-xl leading-relaxed">
          Founders attracting quiet attention from Project A &amp; Yellow VC's network.
          Ranked by convergence strength. Click any row to inspect the evidence.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by founder, company, location…"
            className="h-10 pl-9 rounded-md bg-surface-sunken border-border text-sm"
          />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2 animate-fade-in">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm text-foreground font-medium">Couldn't reach the backend.</p>
          <p className="text-xs text-muted-foreground mt-1.5">{String(alertsQuery.error)}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button size="sm" onClick={() => alertsQuery.refetch()}>Retry</Button>
            {offline.canEnable && (
              <Button size="sm" variant="outline" onClick={offline.enable}>Use offline data</Button>
            )}
          </div>
        </div>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No convergence events yet — run the pipeline to ingest data.
        </div>
      )}

      {/* Picks list */}
      {!isLoading && !isError && visible.length > 0 && (
      <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
        <div className="grid grid-cols-[28px_1fr_auto_auto] md:grid-cols-[40px_1.5fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-surface-sunken text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
          <div>#</div>
          <div>Founder</div>
          <div className="hidden md:block">Convergence</div>
          <div className="hidden md:block text-right">Triggered</div>
          <div className="text-right">Score</div>
          <div className="text-right">Evidence</div>
        </div>

        {visible.map((alert, i) => (
          <PickRow
            key={alert.id}
            alert={alert}
            rank={i + 1}
            score={confidenceFor(alert)}
            open={openId === alert.id}
            onToggle={() => setOpenId(openId === alert.id ? null : alert.id)}
            investorById={investorById}
            totalAlerts={visible.length}
          />
        ))}
      </div>
      )}
    </div>
  );
}

function PickRow({
  alert,
  rank,
  score,
  open,
  onToggle,
  investorById,
  totalAlerts,
}: {
  alert: ConvergenceAlert;
  rank: number;
  score: number | null;
  open: boolean;
  onToggle: () => void;
  investorById: (id: string) => Investor;
  totalAlerts: number;
}) {
  const { founder, signals } = alert;
  const uniqueInvestors = Array.from(new Set(signals.map((s) => s.investorId))).map(
    investorById
  );
  const platforms = Array.from(new Set(signals.map((s) => s.platform)));

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Compact row */}
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[28px_1fr_auto_auto] md:grid-cols-[40px_1.5fr_1fr_auto_auto_auto] gap-4 items-center px-5 py-4 text-left hover:bg-surface-sunken/60 transition-colors"
      >
        <div className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(rank).padStart(2, "0")}
        </div>

        <div className="min-w-0 flex items-center gap-3">
          <EntityAvatar
            githubUsername={founder.githubUsername}
            name={founder.name}
            size={36}
            rounded="xl"
          />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {founder.name}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {founder.headline}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {uniqueInvestors.slice(0, 4).map((inv) => (
              <InvestorAvatar key={inv.id} investor={inv} size={22} />
            ))}
            {uniqueInvestors.length > 4 && (
              <div className="h-[22px] w-[22px] rounded-full bg-surface-sunken ring-2 ring-card grid place-items-center text-[9px] font-mono text-muted-foreground">
                +{uniqueInvestors.length - 4}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            {platforms.includes("linkedin") && <Linkedin className="h-3 w-3" />}
            {platforms.includes("twitter") && <Twitter className="h-3 w-3" />}
          </div>
        </div>

        <div className="hidden md:block text-[11px] font-mono text-muted-foreground tabular-nums text-right">
          {formatRelative(alert.triggeredAt)}
        </div>

        <div className="flex justify-end">
          <ScoreBadge value={score} />
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="hidden md:inline text-[11px] tabular-nums">
            {open ? "Hide" : "View"}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expanded evidence */}
      {open && (
        <div className="px-5 pb-6 pt-1 bg-surface-sunken/40 animate-fade-in">
          {alert.meta && (
            <div className="pl-12 pt-4">
              <WhyFired meta={alert.meta} totalAlerts={totalAlerts} />
            </div>
          )}
          <div className="flex items-center justify-between mb-4 pl-12">
            <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Evidence timeline · {alert.windowDays}d window
            </div>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <Link to={`/founder/${founder.id}`}>
                Open full dossier <ArrowUpRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <ol className="relative evidence-rail space-y-0.5 pl-12">
            {signals
              .slice()
              .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
              .map((s) => (
                <EvidenceItem key={s.id} signal={s} founderName={founder.name} />
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}
