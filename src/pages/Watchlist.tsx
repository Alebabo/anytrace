import { ArrowUpRight, Github, Linkedin, Plus, Sparkles, Trash2, Twitter, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddGithubPersonToWatchlist,
  useAddVcToWatchlist,
  useAccessState,
  useGraphData,
  usePersonIdentities,
  useRemoveGithubPersonFromWatchlist,
  useRemoveVcFromWatchlist,
  useWatchlist,
} from "@/hooks/useAnytrace";
import type { PersonIdentity, UserVcWatchlistItem, WatchlistPerson } from "@/data/anytrace";
import { avatarSourcesForPerson, avatarSourcesForVc } from "@/lib/avatarSources";
import { personDisplayLabel } from "@/lib/personLabels";

function identityFor(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

function formatVcMeta(item: UserVcWatchlistItem["vcSource"]) {
  return [item.country, item.sizeLabel, item.sectorFocus].filter(Boolean).join(" / ");
}

type FollowSuggestion = {
  person: WatchlistPerson;
  reason: string;
  primaryLink: string;
  primaryLabel: "X" | "GitHub";
};

function SelectedVcRow({
  item,
  onView,
  onRemove,
  busy,
}: {
  item: UserVcWatchlistItem;
  onView: (vcSourceId: string) => void;
  onRemove: (vcSourceId: string) => void;
  busy: boolean;
}) {
  const { vcSource } = item;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        className="min-w-0 flex items-center gap-3 text-left"
        onClick={() => onView(vcSource.id)}
      >
        <EntityAvatar name={vcSource.name} imageUrls={avatarSourcesForVc(vcSource)} size={40} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{vcSource.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{formatVcMeta(vcSource)}</div>
        </div>
      </button>
      <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
        <div className="flex items-center gap-2 text-muted-foreground">
          {vcSource.twitterUrl && (
            <a href={vcSource.twitterUrl} target="_blank" rel="noreferrer" className="hover:text-foreground" onClick={(event) => event.stopPropagation()}>
              <Twitter className="h-4 w-4" />
            </a>
          )}
          {vcSource.linkedinUrl && (
            <a href={vcSource.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-signal-linkedin" onClick={(event) => event.stopPropagation()}>
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          {vcSource.githubUsername && (
            <a
              href={`https://github.com/${vcSource.githubUsername}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
              onClick={(event) => event.stopPropagation()}
            >
              <Github className="h-4 w-4" />
            </a>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(vcSource.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SelectedGithubRow({
  person,
  onRemove,
  busy,
}: {
  person: WatchlistPerson;
  onRemove: (personId: string) => void;
  busy: boolean;
}) {
  const github = identityFor(person.identities, "github");
  const x = identityFor(person.identities, "x");
  const linkedin = identityFor(person.identities, "linkedin");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex items-center gap-3">
        <EntityAvatar
          name={person.fullName}
          imageUrls={avatarSourcesForPerson(person, person.identities)}
          size={40}
          rounded="xl"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{person.fullName}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{personDisplayLabel(person)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {person.vcFollowersThisWeek} new VC follows / {person.githubMomentum} repo delta
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
        <div className="flex items-center gap-2 text-muted-foreground">
          {x && (
            <a href={x.profileUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
              <Twitter className="h-4 w-4" />
            </a>
          )}
          {linkedin && (
            <a href={linkedin.profileUrl} target="_blank" rel="noreferrer" className="hover:text-signal-linkedin">
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          {github && (
            <a href={github.profileUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
              <Github className="h-4 w-4" />
            </a>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={busy || !person.isWatchlist}
          onClick={() => onRemove(person.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FollowSuggestionCard({ suggestion }: { suggestion: FollowSuggestion }) {
  const github = identityFor(suggestion.person.identities, "github");
  const x = identityFor(suggestion.person.identities, "x");

  return (
    <div className="w-[min(100%,20rem)] shrink-0 snap-start rounded-[24px] border border-border bg-card p-4 sm:w-[280px]">
      <div className="flex items-start gap-3">
        <EntityAvatar
          name={suggestion.person.fullName}
          imageUrls={avatarSourcesForPerson(suggestion.person, suggestion.person.identities)}
          size={44}
          rounded="xl"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{suggestion.person.fullName}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{personDisplayLabel(suggestion.person)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{suggestion.reason}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="rounded-full">
          <a href={suggestion.primaryLink} target="_blank" rel="noreferrer">
            Follow on {suggestion.primaryLabel} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
        {x && suggestion.primaryLabel !== "X" && (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <a href={x.profileUrl} target="_blank" rel="noreferrer">
              X
            </a>
          </Button>
        )}
        {github && suggestion.primaryLabel !== "GitHub" && (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <a href={github.profileUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { access } = useAccessState();
  const watchlistQuery = useWatchlist(access.isAuthenticated);
  const graphQuery = useGraphData(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const addVc = useAddVcToWatchlist();
  const addTrackedPerson = useAddGithubPersonToWatchlist();
  const removeVc = useRemoveVcFromWatchlist();
  const removeGithubPerson = useRemoveGithubPersonFromWatchlist();
  const [vcDraft, setVcDraft] = useState({
    name: "",
    xHandle: "",
    linkedinUrl: "",
  });
  const [personDraft, setPersonDraft] = useState({
    fullName: "",
    githubHandle: "",
    xHandle: "",
    linkedinUrl: "",
    roleTitle: "",
    company: "",
    location: "",
    summary: "",
  });
  const [showAddVcForm, setShowAddVcForm] = useState(false);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);

  const watchlist = watchlistQuery.data;
  const selectedVcs = useMemo(() => watchlist?.selectedVcs ?? [], [watchlist?.selectedVcs]);
  const selectedGithubPeople = useMemo(() => watchlist?.people ?? [], [watchlist?.people]);
  const followSuggestions = useMemo(() => {
    const graphPeople = graphQuery.data?.people ?? [];
    const graphEvents = graphQuery.data?.events ?? [];
    const identities = identitiesQuery.data ?? [];
    const peopleById = new Map<string, WatchlistPerson>();
    const identitiesByPerson = new Map<string, PersonIdentity[]>();

    for (const identity of identities) {
      const list = identitiesByPerson.get(identity.personId) ?? [];
      list.push(identity);
      identitiesByPerson.set(identity.personId, list);
    }

    for (const person of selectedGithubPeople) {
      peopleById.set(person.id, person);
    }

    for (const person of graphPeople) {
      if (peopleById.has(person.id)) continue;
      const personIdentities = identitiesByPerson.get(person.id) ?? [];
      peopleById.set(person.id, {
        ...person,
        identities: personIdentities,
        signalsThisWeek: 0,
        vcFollowersThisWeek: 0,
        githubMomentum: 0,
        bigTechExit: false,
        importantGithubFollowers: 0,
        githubProfile: null,
      });
    }

    const suggestions = [...peopleById.values()]
      .map((person) => {
        const personEvents = graphEvents.filter((event) => event.personId === person.id);
        const xFollowCount = personEvents.filter((event) => event.eventType === "vc_follow").length;
        const githubFollowCount = personEvents.filter((event) => event.eventType === "important_github_follower").length;
        const viralRepoCount = personEvents.filter((event) => event.eventType === "viral_repo").length;
        const xIdentity = identityFor(person.identities, "x");
        const githubIdentity = identityFor(person.identities, "github");
        const primaryLink = xIdentity?.profileUrl || githubIdentity?.profileUrl || "";
        const primaryLabel = xIdentity ? "X" : "GitHub";

        if (!primaryLink) return null;

        let reason = "Worth tracking for fresh technical and network signals.";
        if (viralRepoCount > 0) {
          reason = viralRepoCount === 1 ? "New viral GitHub repo spotted." : `${viralRepoCount} new viral GitHub repos spotted.`;
        } else if (githubFollowCount > 0) {
          reason = githubFollowCount === 1 ? "New GitHub follow signal detected." : `${githubFollowCount} new GitHub follow signals detected.`;
        } else if (xFollowCount > 0) {
          reason = xFollowCount === 1 ? "New VC follow on X detected." : `${xFollowCount} new VC follows on X detected.`;
        }

        const score = viralRepoCount * 100 + githubFollowCount * 20 + xFollowCount * 15 + Number(person.isWatchlist) * 5;
        return {
          person,
          reason,
          primaryLink,
          primaryLabel,
          score,
        };
      })
      .filter((suggestion): suggestion is FollowSuggestion & { score: number } => !!suggestion)
      .sort((left, right) => right.score - left.score || left.person.fullName.localeCompare(right.person.fullName))
      .slice(0, 5);

    return suggestions;
  }, [graphQuery.data?.events, graphQuery.data?.people, identitiesQuery.data, selectedGithubPeople]);

  return (
    <ProductGate
      title="Watchlist"
      description="Keep the page compact by expanding only the watchlist blocks you want to inspect."
    >
      <div className="mx-auto max-w-6xl overflow-x-hidden px-4 py-8 md:px-8 md:py-10">
        <div className="mb-8 md:mb-10">
          <h2 className="font-serif text-4xl leading-[1.05] md:text-5xl">Watchlist</h2>
        </div>

        <div className="grid gap-8">
          <Card className="overflow-hidden rounded-[28px] border-border px-4 py-5 shadow-none sm:px-6">
            <div>
              <div className="text-lg font-medium">Who To Follow</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Five fresh profiles worth following on X or GitHub.
              </div>
            </div>

            {watchlistQuery.isLoading || identitiesQuery.isLoading || graphQuery.isLoading ? (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-40 w-[280px] shrink-0 rounded-[24px]" />
                ))}
              </div>
            ) : followSuggestions.length === 0 ? (
              <div className="mt-4 rounded-[24px] border border-border bg-card p-6 text-sm text-muted-foreground">
                No follow suggestions are available yet.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto pb-1">
                <div className="flex snap-x snap-mandatory gap-3">
                  {followSuggestions.map((suggestion) => (
                    <FollowSuggestionCard
                      key={`${suggestion.person.id}-${suggestion.primaryLabel}`}
                      suggestion={suggestion}
                    />
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden rounded-[28px] border-border px-4 py-3 shadow-none sm:px-6">
            <Accordion type="multiple" defaultValue={["selected-vcs", "selected-git-people"]} className="w-full">
              <AccordionItem value="selected-vcs" className="border-border">
                <AccordionTrigger className="py-5 text-left hover:no-underline">
                  <div>
                    <div className="text-lg font-medium">Selected VCs</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedVcs.length} tracked VC{selectedVcs.length === 1 ? "" : "s"} in this list.
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <div className="mb-4 rounded-[24px] border border-border bg-surface-sunken/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Add VC</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Formular nur bei Bedarf aufklappen.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => setShowAddVcForm((value) => !value)}
                        aria-label={showAddVcForm ? "Close add VC form" : "Open add VC form"}
                      >
                        {showAddVcForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                    {showAddVcForm && (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <Input
                            value={vcDraft.name}
                            onChange={(event) => setVcDraft((current) => ({ ...current, name: event.target.value }))}
                            placeholder="VC name"
                          />
                          <Input
                            value={vcDraft.xHandle}
                            onChange={(event) => setVcDraft((current) => ({ ...current, xHandle: event.target.value }))}
                            placeholder="X handle"
                          />
                          <Input
                            value={vcDraft.linkedinUrl}
                            onChange={(event) => setVcDraft((current) => ({ ...current, linkedinUrl: event.target.value }))}
                            placeholder="LinkedIn URL"
                          />
                        </div>
                        <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                          <Button
                            type="button"
                            className="w-full rounded-full sm:w-auto"
                            disabled={addVc.isPending}
                            onClick={() =>
                              addVc.mutate(
                                {
                                  name: vcDraft.name,
                                  country: "",
                                  sizeLabel: "",
                                  sectorFocus: "",
                                  twitterUrl: "",
                                  linkedinUrl: vcDraft.linkedinUrl,
                                  xHandle: vcDraft.xHandle,
                                  tier: "vc",
                                },
                                {
                                  onSuccess: () => {
                                    setVcDraft({
                                      name: "",
                                      xHandle: "",
                                      linkedinUrl: "",
                                    });
                                    setShowAddVcForm(false);
                                  },
                                },
                              )
                            }
                          >
                            VC hinzufügen
                          </Button>
                          {addVc.isError && (
                            <div className="text-sm text-destructive">{(addVc.error as Error)?.message}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {watchlistQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                      ))}
                    </div>
                  ) : watchlistQuery.isError ? (
                    <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                      {String(watchlistQuery.error || "Watchlist could not be loaded.")}
                    </div>
                  ) : selectedVcs.length === 0 ? (
                    <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                      Keine VCs gefunden. Prüfe `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` und ob dein neues Supabase-Projekt `vcs`-Einträge und passende RLS-Regeln hat.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedVcs.map((item) => (
                        <SelectedVcRow
                          key={item.id}
                          item={item}
                          busy={removeVc.isPending}
                          onView={(vcSourceId) => navigate(`/graph?focusVc=${encodeURIComponent(vcSourceId)}`)}
                          onRemove={(vcSourceId) => removeVc.mutate({ vcSourceId })}
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="selected-git-people" className="border-b-0 border-border">
                <AccordionTrigger className="py-5 text-left hover:no-underline">
                  <div>
                    <div className="text-lg font-medium">Selected Git people</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedGithubPeople.length} GitHub profile{selectedGithubPeople.length === 1 ? "" : "s"} currently selected.
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <div className="mb-4 rounded-[24px] border border-border bg-surface-sunken/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Add tracked person</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Versteckt hinter dem Plus für eine ruhigere Kachel.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => setShowAddPersonForm((value) => !value)}
                        aria-label={showAddPersonForm ? "Close add tracked person form" : "Open add tracked person form"}
                      >
                        {showAddPersonForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                    {showAddPersonForm && (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Input
                            value={personDraft.fullName}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, fullName: event.target.value }))}
                            placeholder="Full name"
                          />
                          <Input
                            value={personDraft.roleTitle}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, roleTitle: event.target.value }))}
                            placeholder="Role title"
                          />
                          <Input
                            value={personDraft.githubHandle}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, githubHandle: event.target.value }))}
                            placeholder="GitHub handle"
                          />
                          <Input
                            value={personDraft.xHandle}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, xHandle: event.target.value }))}
                            placeholder="X handle"
                          />
                          <Input
                            value={personDraft.linkedinUrl}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, linkedinUrl: event.target.value }))}
                            placeholder="LinkedIn URL"
                          />
                          <Input
                            value={personDraft.company}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, company: event.target.value }))}
                            placeholder="Company"
                          />
                          <Input
                            value={personDraft.location}
                            onChange={(event) => setPersonDraft((current) => ({ ...current, location: event.target.value }))}
                            placeholder="Location"
                          />
                        </div>
                        <Textarea
                          value={personDraft.summary}
                          onChange={(event) => setPersonDraft((current) => ({ ...current, summary: event.target.value }))}
                          placeholder="Short summary"
                          className="mt-3 min-h-[88px]"
                        />
                        <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                          <Button
                            type="button"
                            className="w-full rounded-full sm:w-auto"
                            disabled={addTrackedPerson.isPending}
                            onClick={() =>
                              addTrackedPerson.mutate(
                                {
                                  draft: {
                                    fullName: personDraft.fullName,
                                    githubHandle: personDraft.githubHandle,
                                    xHandle: personDraft.xHandle,
                                    linkedinHandle: personDraft.linkedinUrl,
                                    roleTitle: personDraft.roleTitle,
                                    company: personDraft.company,
                                    location: personDraft.location,
                                    summary: personDraft.summary,
                                  },
                                },
                                {
                                  onSuccess: () => {
                                    setPersonDraft({
                                      fullName: "",
                                      githubHandle: "",
                                      xHandle: "",
                                      linkedinUrl: "",
                                      roleTitle: "",
                                      company: "",
                                      location: "",
                                      summary: "",
                                    });
                                    setShowAddPersonForm(false);
                                  },
                                },
                              )
                            }
                          >
                            Tracked Person hinzufügen
                          </Button>
                          {addTrackedPerson.isError && (
                            <div className="text-sm text-destructive">{(addTrackedPerson.error as Error)?.message}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {watchlistQuery.isLoading || identitiesQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                      ))}
                    </div>
                  ) : selectedGithubPeople.length === 0 ? (
                    <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                      Noch keine GitHub-Personen in der gemeinsamen Datenbasis gefunden.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedGithubPeople.map((person) => (
                        <SelectedGithubRow
                          key={person.id}
                          person={person}
                          busy={removeGithubPerson.isPending}
                          onRemove={(personId) => removeGithubPerson.mutate(personId)}
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        </div>
      </div>
    </ProductGate>
  );
}
