import { ArrowUpRight, Github, Linkedin, Sparkles, Twitter } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, usePersonIdentities, useWeeklyPicks } from "@/hooks/useAnytrace";
import type { PersonIdentity, WeeklyPick } from "@/data/anytrace";

function pickIdentity(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

function PickCard({
  pick,
  identities,
}: {
  pick: WeeklyPick;
  identities: PersonIdentity[];
}) {
  const github = pickIdentity(identities, "github");
  const x = pickIdentity(identities, "x");
  const linkedin = pickIdentity(identities, "linkedin");

  return (
    <div className="rounded-[28px] border border-border bg-card p-5 md:p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-8 text-[11px] font-mono text-muted-foreground tabular-nums pt-1">
          {String(pick.rank).padStart(2, "0")}
        </div>
        <EntityAvatar
          githubUsername={github?.handle}
          name={pick.person.fullName}
          size={52}
          rounded="xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-medium leading-tight">{pick.person.fullName}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {pick.person.roleTitle}
                {pick.person.company ? ` / ${pick.person.company}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-serif text-4xl leading-none tabular-nums">{pick.score}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Weekly score</div>
            </div>
          </div>

          <p className="text-sm text-foreground/90 mt-4 leading-relaxed">{pick.summary}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {pick.reasons.slice(0, 3).map((reason) => (
              <span
                key={reason.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1.5 text-xs text-foreground"
              >
                <Sparkles className="h-3 w-3 text-foreground" />
                {reason.title}
              </span>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{pick.vcFollowCount} VC follows</span>
              <span>/</span>
              <span>{pick.githubAttentionScore} GitHub delta</span>
              <span>/</span>
              <span>{pick.person.location}</span>
            </div>
            <div className="flex items-center gap-2">
              {linkedin && (
                <a href={linkedin.profileUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-signal-linkedin">
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {x && (
                <a href={x.profileUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {github && (
                <a href={github.profileUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                  <Github className="h-4 w-4" />
                </a>
              )}
              <Button asChild size="sm" variant="outline" className="rounded-full ml-2">
                <Link to={`/connections/${pick.person.id}`}>
                  Details <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MainDashboard() {
  const { access } = useAccessState();
  const picksQuery = useWeeklyPicks(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const identities = identitiesQuery.data ?? [];

  return (
    <ProductGate
      title="Main"
      description="Weekly top picks for venture teams: the people drawing fresh attention from a curated European VC set."
    >
      <div className="px-4 md:px-10 py-10 max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-6 mb-10 flex-wrap">
          <div>
            <h2 className="font-serif text-5xl leading-[1.02] text-balance">
              Top picks <span className="text-muted-foreground">this week</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              Ranked primarily by VC attention, then sharpened with big-tech exits and GitHub traction. The product surface is lighter now, but the Anytrace signal logic stays evidence-first.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-sunken px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Rule in force</div>
            <div className="text-sm mt-1">3 VC follows within 7 days qualifies a person as top-pick ready.</div>
          </div>
        </div>

        {picksQuery.isLoading || identitiesQuery.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full rounded-[28px]" />
            ))}
          </div>
        ) : picksQuery.isError ? (
          <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
            Could not load weekly picks.
          </div>
        ) : (
          <div className="space-y-4">
            {(picksQuery.data ?? []).map((pick) => (
              <PickCard
                key={pick.id}
                pick={pick}
                identities={identities.filter((identity) => identity.personId === pick.person.id)}
              />
            ))}
          </div>
        )}
      </div>
    </ProductGate>
  );
}
