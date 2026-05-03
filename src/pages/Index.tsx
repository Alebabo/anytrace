import { ArrowUpRight, Github, Linkedin, Sparkles, Twitter } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useActivityEvents, usePersonIdentities, useVcSources, useWeeklyPicks } from "@/hooks/useAnytrace";
import type { ActivityEvent, PersonIdentity, VcSource, WeeklyPick } from "@/data/anytrace";
import { avatarSourcesForPerson } from "@/lib/avatarSources";

function pickIdentity(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

function formatEvidenceLine(event: ActivityEvent, personName: string, vcsById: Map<string, VcSource>) {
  const vcName = event.vcSourceId ? vcsById.get(event.vcSourceId)?.name : null;

  if (event.eventType === "vc_follow" && vcName) {
    return `${vcName} followed ${personName} on X.`;
  }

  if (event.eventType === "repo_traction") {
    const stars = Number(event.metadata.weekly_star_delta ?? 0);
    return stars > 0
      ? `${personName} gained ${stars} GitHub stars this week.`
      : `${personName} showed fresh GitHub repo traction.`;
  }

  if (event.eventType === "big_tech_exit") {
    const company = typeof event.metadata.company === "string" ? event.metadata.company : null;
    return company
      ? `${personName} left ${company} to build.`
      : `${personName} made a notable operating move this week.`;
  }

  if (event.eventType === "important_github_follower") {
    const followerCount = Number(event.metadata.follower_count ?? 0);
    return followerCount > 0
      ? `${personName} picked up ${followerCount} high-signal GitHub followers.`
      : `${personName} picked up high-signal GitHub followers.`;
  }

  if (event.eventType === "launch") {
    return `${personName} posted a fresh launch signal.`;
  }

  if (event.eventType === "mention") {
    return `${personName} was mentioned in a tracked signal.`;
  }

  return event.headline;
}

function PickCard({
  pick,
  identities,
  evidence,
  expanded,
  onToggle,
  vcsById,
}: {
  pick: WeeklyPick;
  identities: PersonIdentity[];
  evidence: ActivityEvent[];
  expanded: boolean;
  onToggle: () => void;
  vcsById: Map<string, VcSource>;
}) {
  const github = pickIdentity(identities, "github");
  const x = pickIdentity(identities, "x");
  const linkedin = pickIdentity(identities, "linkedin");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      className="w-full overflow-hidden rounded-[28px] border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-foreground/20 md:p-6"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="w-8 pt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {String(pick.rank).padStart(2, "0")}
        </div>
        <EntityAvatar
          name={pick.person.fullName}
          imageUrls={avatarSourcesForPerson(pick.person, identities)}
          size={52}
          rounded="xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="break-words text-xl font-medium leading-tight">{pick.person.fullName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {pick.person.roleTitle}
                {pick.person.company ? ` / ${pick.person.company}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <div className="font-serif text-4xl leading-none tabular-nums">{pick.score}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Weekly score</div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground/90">{pick.summary}</p>

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

          {expanded && (
            <div className="mt-4 rounded-2xl border border-border bg-surface-sunken/60 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Evidence timeline</div>
              <div className="mt-3 space-y-2">
                {evidence.length > 0 ? (
                  evidence.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" />
                      <div className="min-w-0">
                        <div>{formatEvidenceLine(event, pick.person.fullName, vcsById)}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(event.occurredAt).toLocaleDateString("de-DE")}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No evidence events are stored for this person yet.</div>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{pick.vcFollowCount} VC follows</span>
              <span>/</span>
              <span>{pick.githubAttentionScore} GitHub delta</span>
              <span>/</span>
              <span>{pick.person.location}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {linkedin && (
                <a
                  href={linkedin.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="text-muted-foreground hover:text-signal-linkedin"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {x && (
                <a
                  href={x.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {github && (
                <a
                  href={github.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Github className="h-4 w-4" />
                </a>
              )}
              <Button asChild size="sm" variant="outline" className="rounded-full sm:ml-2">
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
  const eventsQuery = useActivityEvents(access.isAuthenticated);
  const vcsQuery = useVcSources(access.isAuthenticated);
  const identities = useMemo(() => identitiesQuery.data ?? [], [identitiesQuery.data]);
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const vcsById = useMemo(() => new Map((vcsQuery.data ?? []).map((vc) => [vc.id, vc])), [vcsQuery.data]);
  const evidenceByPerson = useMemo(() => {
    const grouped = new Map<string, ActivityEvent[]>();
    for (const event of events) {
      const list = grouped.get(event.personId) ?? [];
      list.push(event);
      grouped.set(event.personId, list);
    }
    return grouped;
  }, [events]);
  const identitiesByPerson = useMemo(() => {
    const grouped = new Map<string, PersonIdentity[]>();
    for (const identity of identities) {
      const list = grouped.get(identity.personId) ?? [];
      list.push(identity);
      grouped.set(identity.personId, list);
    }
    return grouped;
  }, [identities]);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);

  return (
    <ProductGate
      title="Main"
      description="Weekly top picks for venture teams: the people drawing fresh attention from a curated European VC set."
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-10">
        <div className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div>
            <h2 className="font-serif text-4xl leading-[1.02] text-balance md:text-5xl">
              Main <span className="text-muted-foreground">workspace</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Das Ranking ist noch nicht neu verdrahtet, aber die VC-Datenbasis kommt jetzt direkt aus Supabase.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-sunken px-4 py-3 md:max-w-sm">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current state</div>
            <div className="mt-1 text-sm">VC-Daten live, Scoring und Picks folgen als Nächstes.</div>
          </div>
        </div>

        {picksQuery.isLoading || identitiesQuery.isLoading || eventsQuery.isLoading || vcsQuery.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full rounded-[28px]" />
            ))}
          </div>
        ) : picksQuery.isError || eventsQuery.isError || vcsQuery.isError ? (
          <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
            {String(vcsQuery.error || picksQuery.error || eventsQuery.error || "Could not load weekly picks.")}
          </div>
        ) : (picksQuery.data ?? []).length === 0 ? (
          <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
            Noch keine Top Picks vorhanden. Die VC-Daten sind angebunden, aber Scores und Picks werden noch nicht aus Supabase geladen.
          </div>
        ) : (
          <div className="space-y-4">
            {(picksQuery.data ?? []).map((pick) => (
              <PickCard
                key={pick.id}
                pick={pick}
                identities={identitiesByPerson.get(pick.person.id) ?? []}
                evidence={(evidenceByPerson.get(pick.person.id) ?? [])
                  .slice()
                  .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
                  .slice(0, 5)}
                expanded={expandedPersonId === pick.person.id}
                onToggle={() => setExpandedPersonId((current) => (current === pick.person.id ? null : pick.person.id))}
                vcsById={vcsById}
              />
            ))}
          </div>
        )}
      </div>
    </ProductGate>
  );
}
