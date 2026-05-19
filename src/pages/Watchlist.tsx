import { ArrowUpRight, Linkedin, Plus, Sparkles, Trash2, Twitter, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProductGate } from "@/components/traqr/ProductGate";
import { EntityAvatar } from "@/components/traqr/EntityAvatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddGithubPersonToWatchlist,
  useAddVcToWatchlist,
  useAccessState,
  useAppSettings,
  usePersonIdentities,
  useRemoveGithubPersonFromWatchlist,
  useRemoveVcFromWatchlist,
  useSeedFollowAlerts,
  useWatchlist,
} from "@/hooks/useTraqr";
import type { PersonIdentity, SeedFollowAlert, UserVcWatchlistItem, VcAccountType, VcTier, WatchlistPerson } from "@/data/traqr";
import { avatarSourcesForPerson, avatarSourcesForVc } from "@/lib/avatarSources";
import { personDisplayLabel } from "@/lib/personLabels";
import { isVisibleSeedFollowAlert } from "@/lib/seedFollowAlerts";

function identityFor(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

function formatVcMeta(item: UserVcWatchlistItem["vcSource"]) {
  return [sourceKindLabel(item), item.country, item.sizeLabel, item.sectorFocus].filter(Boolean).join(" / ");
}

function sourceKindLabel(item: UserVcWatchlistItem["vcSource"]) {
  if (item.accountType === "journalist" || item.tier === "journalist") return "Journalist";
  if (item.tier === "angel") return "Angel";
  if (item.tier === "microvc") return "Micro VC";
  return "VC";
}

const SOURCE_TYPES: Array<{ value: VcTier; label: string; accountType: VcAccountType }> = [
  { value: "vc", label: "VC", accountType: "firm" },
  { value: "angel", label: "Angel", accountType: "partner" },
  { value: "journalist", label: "Journalist", accountType: "journalist" },
];

type FollowSuggestion = {
  alert: SeedFollowAlert;
  reason: string;
  primaryLink: string;
  primaryLabel: "X";
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
            {person.vcFollowersThisWeek} new seed-source follow{person.vcFollowersThisWeek === 1 ? "" : "s"}
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
  const triggerNames = suggestion.alert.triggeringSeedAccounts
    .slice(0, 2)
    .map((account) => account.name)
    .join(" + ");

  return (
    <div className="w-[min(100%,20rem)] shrink-0 snap-start rounded-[24px] border border-border bg-card p-4 sm:w-[280px]">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-sunken text-sm font-medium">
          {suggestion.alert.displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{suggestion.alert.displayName}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {suggestion.alert.currentSeedFollowerCount} tracked seed follows
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{triggerNames ? `${triggerNames}: ${suggestion.reason}` : suggestion.reason}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="rounded-full">
          <a href={suggestion.primaryLink} target="_blank" rel="noreferrer">
            Follow on {suggestion.primaryLabel} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { access } = useAccessState();
  const appSettings = useAppSettings(access.isAuthenticated);
  const watchlistQuery = useWatchlist(access.isAuthenticated);
  const seedAlertsQuery = useSeedFollowAlerts(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const addVc = useAddVcToWatchlist();
  const addTrackedPerson = useAddGithubPersonToWatchlist();
  const removeVc = useRemoveVcFromWatchlist();
  const removeGithubPerson = useRemoveGithubPersonFromWatchlist();
  const [vcDraft, setVcDraft] = useState({
    name: "",
    xHandle: "",
    linkedinUrl: "",
    tier: "vc" as VcTier,
    accountType: "firm" as VcAccountType,
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
  const activeThreshold = appSettings.data?.seedFollowAlertThreshold ?? 2;
  const selectedVcs = useMemo(() => watchlist?.selectedVcs ?? [], [watchlist?.selectedVcs]);
  const selectedGithubPeople = useMemo(() => watchlist?.people ?? [], [watchlist?.people]);
  const followSuggestions = useMemo(() => {
    const suggestions = [...(seedAlertsQuery.data ?? [])]
      .filter(isVisibleSeedFollowAlert)
      .filter((alert) => alert.currentSeedFollowerCount >= activeThreshold)
      .sort((left, right) => {
        const countDiff = right.currentSeedFollowerCount - left.currentSeedFollowerCount;
        if (countDiff !== 0) return countDiff;
        return new Date(right.triggeredAt || 0).getTime() - new Date(left.triggeredAt || 0).getTime();
      })
      .map((alert) => ({
        alert,
        reason: `New person crossed the ${alert.alertThreshold ?? 2}-seed-account threshold.`,
        primaryLink: alert.primaryProfileUrl,
        primaryLabel: "X" as const,
      }))
      .slice(0, 5);

    return suggestions;
  }, [activeThreshold, seedAlertsQuery.data]);

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
                Five alert-qualified profiles worth following on X.
              </div>
            </div>

            {watchlistQuery.isLoading || identitiesQuery.isLoading || seedAlertsQuery.isLoading ? (
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
                      key={`${suggestion.alert.id}-${suggestion.primaryLabel}`}
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
                    <div className="text-lg font-medium">Tracked seed sources</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedVcs.length} seed source{selectedVcs.length === 1 ? "" : "s"} in this list.
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <div className="mb-4 rounded-[24px] border border-border bg-surface-sunken/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Add seed source</div>
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
                        aria-label={showAddVcForm ? "Close add seed source form" : "Open add seed source form"}
                      >
                        {showAddVcForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                    {showAddVcForm && (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <Input
                            value={vcDraft.name}
                            onChange={(event) => setVcDraft((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Source name"
                          />
                          <Select
                            value={vcDraft.tier}
                            onValueChange={(value) => {
                              const option = SOURCE_TYPES.find((item) => item.value === value) ?? SOURCE_TYPES[0];
                              setVcDraft((current) => ({
                                ...current,
                                tier: option.value,
                                accountType: option.accountType,
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SOURCE_TYPES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                                  tier: vcDraft.tier,
                                  accountType: vcDraft.accountType,
                                },
                                {
                                  onSuccess: () => {
                                    setVcDraft({
                                      name: "",
                                      xHandle: "",
                                      linkedinUrl: "",
                                      tier: "vc",
                                      accountType: "firm",
                                    });
                                    setShowAddVcForm(false);
                                  },
                                },
                              )
                            }
                          >
                            Quelle hinzufuegen
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
                      Keine Seed-Quellen gefunden. Die lokale Seed-Liste ist leer oder wurde komplett ausgeblendet.
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
                    <div className="text-lg font-medium">Tracked people</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedGithubPeople.length} manually tracked profile{selectedGithubPeople.length === 1 ? "" : "s"}.
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
                      Noch keine manuell getrackten Personen in der gemeinsamen Datenbasis gefunden.
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
