import { Link } from "react-router-dom";
import { ArrowUpRight, ExternalLink, Github, Linkedin, Twitter } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ConvergenceAlert } from "@/data/types";
import { investorById, formatRelative } from "@/data/mockData";
import { EvidenceItem } from "./EvidenceItem";
import { InvestorAvatar } from "./InvestorAvatar";
import { EntityAvatar } from "./EntityAvatar";
import { linkedinLinkFor } from "@/lib/socialLinks";

export function AlertCard({ alert }: { alert: ConvergenceAlert }) {
  const { founder, signals } = alert;
  const uniqueInvestors = Array.from(new Set(signals.map((s) => s.investorId))).map(investorById);
  const angelCount = uniqueInvestors.filter((i) => i.tier === "angel").length;
  const platformBreakdown = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.platform] = (acc[s.platform] ?? 0) + 1;
    return acc;
  }, {});

  const linkedin = linkedinLinkFor({
    name: founder.name,
    linkedinUrl: founder.linkedinUrl,
    company: founder.company,
    title: founder.headline,
  });

  return (
    <Card className="overflow-hidden border-border bg-card shadow-none hover:border-border-strong transition-colors animate-fade-in rounded-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <EntityAvatar
            githubUsername={founder.githubUsername}
            name={founder.name}
            size={48}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/founder/${founder.id}`}
                className="font-serif text-2xl leading-tight text-foreground hover:text-accent-indigo"
              >
                {founder.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {founder.location}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 text-pretty">{founder.headline}</p>
            <div className="flex items-center gap-3 mt-2.5">
              <a
                href={linkedin.href}
                target="_blank"
                rel="noreferrer"
                title={linkedin.isDirect ? "Open LinkedIn profile" : `Search LinkedIn for ${founder.name}`}
                className={`hover:text-signal-linkedin ${
                  linkedin.isDirect ? "text-muted-foreground" : "text-muted-foreground/50"
                }`}
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
              {founder.twitterHandle && (
                <a href={`https://x.com/${founder.twitterHandle}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-signal-twitter">
                  <Twitter className="h-3.5 w-3.5" />
                </a>
              )}
              {founder.githubUsername && (
                <a href={`https://github.com/${founder.githubUsername}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-signal-github">
                  <Github className="h-3.5 w-3.5" />
                </a>
              )}
              {founder.companyUrl && (
                <a
                  href={founder.companyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-accent-indigo inline-flex items-center gap-1"
                >
                  {founder.company} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Convergence stat */}
        <div className="text-right shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-indigo-soft">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-accent-indigo opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-indigo" />
            </span>
            <span className="text-[11px] font-medium text-accent-indigo">
              Convergence
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
            {uniqueInvestors.length} investors · {signals.length} signals
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {alert.windowDays}-day window · triggered {formatRelative(alert.triggeredAt)}
          </div>
        </div>
      </div>

      {/* Investor strip */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {uniqueInvestors.map((inv) => (
              <InvestorAvatar key={inv.id} investor={inv} size={26} />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {angelCount > 0 && (
              <span>
                <span className="font-medium text-foreground">{angelCount}</span> angel
                {angelCount > 1 ? "s" : ""}
                {" · "}
              </span>
            )}
            <span>
              {Object.entries(platformBreakdown)
                .map(([p, c]) => `${c} ${p}`)
                .join(" · ")}
            </span>
          </div>
        </div>
        <Link
          to={`/founder/${founder.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-accent-indigo"
        >
          Open dossier <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Evidence timeline */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-muted-foreground">
            Evidence Timeline
          </h4>
          <span className="text-[11px] text-muted-foreground">
            most recent first
          </span>
        </div>
        <ol className="relative evidence-rail space-y-0.5">
          {signals
            .slice()
            .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
            .map((s) => (
              <EvidenceItem key={s.id} signal={s} founderName={founder.name} />
            ))}
        </ol>
      </div>
    </Card>
  );
}
