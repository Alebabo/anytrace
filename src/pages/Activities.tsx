import { useDeferredValue, useMemo, useState } from "react";
import { Activity, Github, Linkedin, Loader2, RotateCcw, Search, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { ActivityLine } from "@/components/anytrace/ActivityLine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useActivityEvents, usePersonIdentities, useResetActivities, useTrackedPeople, useVcSources } from "@/hooks/useAnytrace";
import type { ActivityPlatform } from "@/data/anytrace";

function platformIcon(platform: ActivityPlatform) {
  if (platform === "x") return <Twitter className="h-3.5 w-3.5" />;
  if (platform === "github") return <Github className="h-3.5 w-3.5" />;
  if (platform === "linkedin") return <Linkedin className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

function platformLabel(platform: ActivityPlatform) {
  if (platform === "x") return "X follows";
  if (platform === "github") return "GitHub";
  if (platform === "linkedin") return "LinkedIn";
  return "System";
}

function eventActorLabel(event: { headline: string; metadata: Record<string, unknown> }, fallback?: string) {
  const targetLabel = typeof event.metadata.targetLabel === "string" ? event.metadata.targetLabel : "";
  const actorLabel = typeof event.metadata.actorLabel === "string" ? event.metadata.actorLabel : "";
  return fallback || targetLabel || actorLabel || event.headline;
}

export default function ActivitiesPage() {
  const { access } = useAccessState();
  const eventsQuery = useActivityEvents(access.isAuthenticated);
  const peopleQuery = useTrackedPeople(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const vcsQuery = useVcSources(access.isAuthenticated);
  const resetActivities = useResetActivities();
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | ActivityPlatform>("all");
  const deferredQuery = useDeferredValue(query);

  const peopleById = useMemo(
    () => new Map((peopleQuery.data ?? []).map((person) => [person.id, person])),
    [peopleQuery.data],
  );
  const vcsById = useMemo(() => new Map((vcsQuery.data ?? []).map((vc) => [vc.id, vc])), [vcsQuery.data]);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const filteredEvents = useMemo(() => {
    return (eventsQuery.data ?? []).filter((event) => {
      if (platformFilter !== "all" && event.platform !== platformFilter) return false;
      if (!normalizedQuery) return true;

      const person = peopleById.get(event.personId);
      return [
        event.headline,
        event.description,
        event.platform,
        person?.fullName,
        person?.company,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [eventsQuery.data, normalizedQuery, peopleById, platformFilter]);

  const counts = useMemo(() => {
    const next = {
      all: 0,
      x: 0,
      github: 0,
      linkedin: 0,
    };

    for (const event of eventsQuery.data ?? []) {
      next.all += 1;
      if (event.platform === "x") next.x += 1;
      if (event.platform === "github") next.github += 1;
      if (event.platform === "linkedin") next.linkedin += 1;
    }

    return next;
  }, [eventsQuery.data]);

  return (
    <ProductGate
      title="Activities"
      description="A live signal feed focused on new follows and new viral GitHub repositories."
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-serif text-4xl leading-[1.02] md:text-5xl">Activities</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Unified signal timeline for new VC follows on X, fresh GitHub follows, and newly viral GitHub repositories.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 md:items-end">
            <div className="rounded-2xl border border-border bg-surface-sunken px-4 py-3 text-sm text-muted-foreground">
              {filteredEvents.length} visible activities
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => resetActivities.mutate()}
              disabled={resetActivities.isPending}
            >
              {resetActivities.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Reset activities
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {([
            ["all", `All (${counts.all})`],
            ["x", `X (${counts.x})`],
            ["github", `GitHub (${counts.github})`],
            ["linkedin", `LinkedIn (${counts.linkedin})`],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              variant={platformFilter === value ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setPlatformFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {resetActivities.isError && (
          <div className="mb-6 rounded-[24px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(resetActivities.error as Error)?.message || "Activities could not be reset."}
          </div>
        )}

        {resetActivities.data?.ok && (
          <div className="mb-6 rounded-[24px] border border-border bg-surface-sunken px-4 py-3 text-sm text-muted-foreground">
            {resetActivities.data.message || "Activities were reset."}
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 shadow-sm lg:min-w-[340px]">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search activities, people, or companies"
              className="h-auto border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
            />
          </div>
        </div>

        {eventsQuery.isLoading || peopleQuery.isLoading || identitiesQuery.isLoading || vcsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-[24px]" />
            ))}
          </div>
        ) : eventsQuery.isError || peopleQuery.isError || identitiesQuery.isError || vcsQuery.isError ? (
          <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
            {String(eventsQuery.error || peopleQuery.error || identitiesQuery.error || vcsQuery.error || "Could not load activities.")}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
            No activities match the current filters yet.
          </div>
        ) : (
          <div className="rounded-[30px] border border-border bg-card px-5 py-4 shadow-sm md:px-6 md:py-5">
            <div className="space-y-1">
              {filteredEvents.map((event) => {
                const person = peopleById.get(event.personId);

                return (
                  <div key={event.id} className="flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {platformIcon(event.platform)}
                          {platformLabel(event.platform)}
                        </span>
                        <span>{eventActorLabel(event, person?.fullName)}</span>
                      </div>
                      <ActivityLine
                        event={event}
                        personName={person?.fullName}
                        vcsById={vcsById}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ProductGate>
  );
}
