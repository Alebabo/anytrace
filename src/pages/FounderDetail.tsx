import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, ExternalLink, FileText, Github, Linkedin, ShieldCheck, Twitter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { useFounder, useInvestors } from "@/hooks/useApi";
import { EvidenceItem } from "@/components/converge/EvidenceItem";
import { InvestorAvatar, TierBadge } from "@/components/converge/InvestorAvatar";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { SignalIcon, platformLabel } from "@/components/converge/SignalIcon";
import type { ConvergenceAlert, Investor, SignalPlatform } from "@/data/types";

export default function FounderDetail() {
  const { founderId } = useParams();
  const founderQuery = useFounder(founderId);
  const investorsQuery = useInvestors();

  const investorById = useMemo(() => {
    const map = new Map((investorsQuery.data ?? []).map((i) => [i.id, i]));
    return (id: string): Investor =>
      map.get(id) ?? {
        id,
        name: "Unknown",
        title: "",
        tier: "vc",
        avatarColor: "0 0% 50%",
        group: "",
      };
  }, [investorsQuery.data]);

  const founderAlerts = (founderQuery.data?.alerts ?? []) as ConvergenceAlert[];
  const alert = founderAlerts[0];
  const signals = alert?.signals ?? [];

  const platformCounts = useMemo(() => {
    const c: Record<SignalPlatform, number> = { twitter: 0, linkedin: 0, github: 0 };
    signals.forEach((s) => (c[s.platform] += 1));
    return c;
  }, [signals]);

  if (founderQuery.isLoading) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto space-y-4 animate-fade-in">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (founderQuery.isError || !founderQuery.data) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-muted-foreground">
          {founderQuery.isError ? "Couldn't load founder." : "Founder not found."}
        </p>
        {founderQuery.isError && (
          <Button size="sm" className="mt-3" onClick={() => founderQuery.refetch()}>
            Retry
          </Button>
        )}
        <Link to="/" className="text-accent-indigo text-sm mt-2 inline-block">
          ← Back to feed
        </Link>
      </div>
    );
  }

  const founder = founderQuery.data;
  const latestDossierId = (founder as { latest_dossier_id?: string }).latest_dossier_id;
  if (!alert) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to feed
        </Link>
        {latestDossierId && (
          <div className="mb-4">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to={`/dossier/${latestDossierId}`}>
                <FileText className="h-3.5 w-3.5" /> View Dossier <ArrowUpRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
        <Card className="p-8 rounded-3xl text-center text-sm text-muted-foreground">
          No convergence events for {founder.name} yet.
        </Card>
      </div>
    );
  }
  const investorIds = Array.from(new Set(signals.map((s) => s.investorId)));
  const involvedInvestors = investorIds.map(investorById);

  const sorted = signals.slice().sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));

  // Build a 14-day timeline grid for the convergence graph
  const days = 14;
  const today = Date.now();
  const dayBuckets = Array.from({ length: days }, (_, i) => {
    const dayStart = today - (days - 1 - i) * 86400000;
    const inDay = signals.filter((s) => {
      const t = new Date(s.occurredAt).getTime();
      return t >= dayStart - 86400000 / 2 && t < dayStart + 86400000 / 2;
    });
    return { dayStart, signals: inDay };
  });

  return (
    <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to feed
        </Link>
        {latestDossierId && (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to={`/dossier/${latestDossierId}`}>
              <FileText className="h-3.5 w-3.5" /> View Dossier <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>

      {/* Header */}
      <Card className="p-5 md:p-8 border-border mb-6 rounded-3xl shadow-none">
        <div className="flex items-start justify-between gap-4 md:gap-6 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <EntityAvatar
              githubUsername={founder.githubUsername}
              name={founder.name}
              size={64}
            />
            <div className="min-w-0">
              <h1 className="font-serif text-3xl md:text-5xl leading-[1.05]">{founder.name}</h1>
              <p className="text-sm text-muted-foreground mt-2 text-pretty">{founder.headline}</p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {founder.location}
                </span>
                {founder.companyUrl && (
                  <a
                    href={founder.companyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-foreground hover:text-accent-indigo"
                  >
                    {founder.company} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <div className="flex items-center gap-2">
                  {founder.linkedinUrl && (
                    <a href={founder.linkedinUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-signal-linkedin">
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                  {founder.twitterHandle && (
                    <a href={`https://x.com/${founder.twitterHandle}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-signal-twitter">
                      <Twitter className="h-4 w-4" />
                    </a>
                  )}
                  {founder.githubUsername && (
                    <a href={`https://github.com/${founder.githubUsername}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-signal-github">
                      <Github className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 md:gap-8 w-full md:w-auto justify-between md:justify-end">
            <Metric label="Investors" value={involvedInvestors.length} />
            <Metric label="Signals" value={signals.length} />
            <Metric
              label="First seen"
              value={formatRelative(sorted[sorted.length - 1].occurredAt)}
            />
          </div>
        </div>

        {/* Evidence-only disclaimer */}
        <div className="mt-6 flex items-start gap-2 p-4 rounded-2xl bg-surface-sunken">
          <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Evidence-only dossier.</span> This view
            shows what watchlist members did and when — every line links to its primary source. No
            inferred track records, no automated suggestions, no opinion scores.
          </p>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Convergence Graph */}
        <Card className="lg:col-span-2 border-border p-5 md:p-6 rounded-3xl shadow-none overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-medium tracking-tight">Signal convergence graph</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Watchlist activity over the last {days} days
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              {(["twitter", "linkedin", "github"] as SignalPlatform[]).map((p) => (
                <div key={p} className="flex items-center gap-1.5 text-muted-foreground">
                  <SignalIcon platform={p} className="h-3 w-3" />
                  <span className="tabular-nums">{platformCounts[p]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-investor swimlanes */}
          <div className="space-y-2">
            {involvedInvestors.map((inv) => {
              const invSignals = signals.filter((s) => s.investorId === inv.id);
              return (
                <div key={inv.id} className="flex items-center gap-3">
                  <div className="w-24 md:w-44 shrink-0 flex items-center gap-2 min-w-0">
                    <InvestorAvatar investor={inv} size={22} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{inv.name}</div>
                    </div>
                  </div>
                  <div className="relative flex-1 h-8 rounded-full bg-surface-sunken">
                    {/* day grid */}
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
                      {dayBuckets.map((_, i) => (
                        <div key={i} className="border-r border-border/40 last:border-r-0" />
                      ))}
                    </div>
                    {/* dots */}
                    {invSignals.map((s) => {
                      const ageDays = Math.max(0, Math.min(days - 1, Math.floor((today - new Date(s.occurredAt).getTime()) / 86400000)));
                      const left = ((days - 1 - ageDays) / (days - 1)) * 100;
                      return (
                        <a
                          key={s.id}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          title={`${s.target} · ${formatRelative(s.occurredAt)}`}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 grid place-items-center h-6 w-6 rounded-full bg-background border border-border hover:border-foreground hover:scale-110 transition-all"
                          style={{ left: `${left}%` }}
                        >
                          <SignalIcon platform={s.platform} className="h-3 w-3" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{days} days ago</span>
            <span>today</span>
          </div>
        </Card>

        {/* Investors involved */}
        <Card className="border-border p-6 rounded-3xl shadow-none">
          <h3 className="text-base font-medium tracking-tight mb-1">Watchlist members involved</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Only members of your watchlist appear here.
          </p>
          <ul className="space-y-3">
            {involvedInvestors.map((inv) => {
              const count = signals.filter((s) => s.investorId === inv.id).length;
              return (
                <li key={inv.id} className="flex items-center gap-3">
                  <InvestorAvatar investor={inv} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{inv.name}</span>
                      <TierBadge tier={inv.tier} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {inv.title}
                      {inv.firm ? ` · ${inv.firm}` : ""}
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {count} signal{count > 1 ? "s" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Evidence Timeline */}
      <Card className="mt-6 border-border p-6 rounded-3xl shadow-none">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium tracking-tight">Full evidence timeline</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Concrete actions only — connected, followed, starred, replied. No inference.
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {signals.length} verifiable items
          </span>
        </div>
        <ol className="relative evidence-rail space-y-0.5">
          {sorted.map((s) => (
            <EvidenceItem key={s.id} signal={s} founderName={founder.name} />
          ))}
        </ol>
      </Card>

      {/* Platform breakdown */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        {(["twitter", "linkedin", "github"] as SignalPlatform[]).map((p) => (
          <Card key={p} className="border-border p-5 flex items-center gap-4 rounded-3xl shadow-none">
            <div className="h-11 w-11 rounded-full bg-surface-sunken grid place-items-center">
              <SignalIcon platform={p} className="h-5 w-5" />
            </div>
            <div>
              <div className="font-serif text-3xl tabular-nums leading-none">{platformCounts[p]}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {platformLabel(p)} signals
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <div className="font-serif text-3xl tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5">
        {label}
      </div>
    </div>
  );
}
