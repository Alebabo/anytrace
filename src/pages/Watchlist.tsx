import { useMemo, useState } from "react";
import { Github, Linkedin, Loader2, Plus, Trash2, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  useAddGithubPersonToWatchlist,
  useAddVcToWatchlist,
  usePersonIdentities,
  useRemoveGithubPersonFromWatchlist,
  useRemoveVcFromWatchlist,
  useTrackedPeople,
  useVcSources,
  useWatchlist,
} from "@/hooks/useAnytrace";
import type {
  PersonIdentity,
  TrackedPerson,
  UserVcWatchlistItem,
  VcSource,
  VcSourceDraft,
  WatchlistPerson,
} from "@/data/anytrace";
import { avatarSourcesForPerson, avatarSourcesForVc } from "@/lib/avatarSources";

function identityFor(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-sunken px-4 py-3">
      <div className="font-serif text-3xl leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}

function SelectedVcRow({
  item,
  onRemove,
  busy,
}: {
  item: UserVcWatchlistItem;
  onRemove: (vcSourceId: string) => void;
  busy: boolean;
}) {
  const { vcSource } = item;

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4">
      <div className="min-w-0 flex items-center gap-3">
        <EntityAvatar name={vcSource.name} imageUrls={avatarSourcesForVc(vcSource)} size={40} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{vcSource.name}</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {vcSource.country}
            {vcSource.sizeLabel ? ` / ${vcSource.sizeLabel}` : ""}
            {vcSource.sectorFocus ? ` / ${vcSource.sectorFocus}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground">
          {vcSource.twitterUrl && (
            <a href={vcSource.twitterUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
              <Twitter className="h-4 w-4" />
            </a>
          )}
          {vcSource.linkedinUrl && (
            <a href={vcSource.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-signal-linkedin">
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          {vcSource.githubUsername && (
            <a href={`https://github.com/${vcSource.githubUsername}`} target="_blank" rel="noreferrer" className="hover:text-foreground">
              <Github className="h-4 w-4" />
            </a>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={busy}
          onClick={() => onRemove(vcSource.id)}
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4">
      <div className="min-w-0 flex items-center gap-3">
        <EntityAvatar
          name={person.fullName}
          imageUrls={avatarSourcesForPerson(person, person.identities)}
          size={40}
          rounded="xl"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{person.fullName}</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {person.roleTitle}
            {person.company ? ` / ${person.company}` : ""}
            {person.location ? ` / ${person.location}` : ""}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {person.vcFollowersThisWeek} VC follows / {person.githubMomentum} repo delta
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
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
          disabled={busy}
          onClick={() => onRemove(person.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const emptyVcDraft: VcSourceDraft = {
  name: "",
  country: "",
  sizeLabel: "",
  sectorFocus: "",
  twitterUrl: "",
  linkedinUrl: "",
  githubUsername: "",
  websiteUrl: "",
  notes: "",
};

const emptyGithubDraft = {
  fullName: "",
  githubHandle: "",
  xHandle: "",
  linkedinHandle: "",
  roleTitle: "",
  company: "",
  location: "",
  summary: "",
};

export default function WatchlistPage() {
  const { access } = useAccessState();
  const watchlistQuery = useWatchlist(access.isAuthenticated);
  const vcCatalogQuery = useVcSources(access.isAuthenticated);
  const peopleQuery = useTrackedPeople(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const addVc = useAddVcToWatchlist();
  const removeVc = useRemoveVcFromWatchlist();
  const addGithubPerson = useAddGithubPersonToWatchlist();
  const removeGithubPerson = useRemoveGithubPersonFromWatchlist();

  const [selectedVcId, setSelectedVcId] = useState("");
  const [selectedGithubPersonId, setSelectedGithubPersonId] = useState("");
  const [vcDraft, setVcDraft] = useState<VcSourceDraft>(emptyVcDraft);
  const [githubDraft, setGithubDraft] = useState(emptyGithubDraft);

  const watchlist = watchlistQuery.data;
  const selectedVcs = watchlist?.selectedVcs ?? [];
  const selectedGithubPeople = watchlist?.people ?? [];
  const identities = identitiesQuery.data ?? [];
  const allPeople = peopleQuery.data ?? [];
  const allVcs = vcCatalogQuery.data ?? [];

  const selectedVcIds = useMemo(() => new Set(selectedVcs.map((item) => item.vcSourceId)), [selectedVcs]);
  const selectedGithubIds = useMemo(() => new Set(selectedGithubPeople.map((person) => person.id)), [selectedGithubPeople]);

  const vcOptions = useMemo(
    () => allVcs.filter((vc) => !selectedVcIds.has(vc.id)),
    [allVcs, selectedVcIds],
  );

  const githubOptions = useMemo(
    () =>
      allPeople
        .filter((person) => !selectedGithubIds.has(person.id))
        .map((person) => ({
          person,
          identities: identities.filter((identity) => identity.personId === person.id),
        }))
        .filter((entry) => entry.identities.some((identity) => identity.platform === "github")),
    [allPeople, identities, selectedGithubIds],
  );

  const addExistingVc = async () => {
    const vc = vcOptions.find((entry) => entry.id === selectedVcId);
    if (!vc) return;

    await addVc.mutateAsync({
      name: vc.name,
      country: vc.country,
      sizeLabel: vc.sizeLabel ?? vc.title,
      sectorFocus: vc.sectorFocus ?? vc.firm,
      twitterUrl: vc.twitterUrl ?? vc.xHandle ?? "",
      linkedinUrl: vc.linkedinUrl ?? "",
      githubUsername: vc.githubUsername ?? "",
      websiteUrl: vc.websiteUrl ?? "",
      notes: vc.notes,
      city: vc.city,
      region: vc.region,
      tier: vc.tier,
    });
    setSelectedVcId("");
  };

  const addExistingGithubPerson = async () => {
    const entry = githubOptions.find((option) => option.person.id === selectedGithubPersonId);
    if (!entry) return;

    await addGithubPerson.mutateAsync({
      existing: entry,
    });
    setSelectedGithubPersonId("");
  };

  const submitVcDraft = async () => {
    await addVc.mutateAsync(vcDraft);
    setVcDraft(emptyVcDraft);
  };

  const submitGithubDraft = async () => {
    await addGithubPerson.mutateAsync({
      draft: githubDraft,
    });
    setGithubDraft(emptyGithubDraft);
  };

  return (
    <ProductGate
      title="Watchlist"
      description="Build your own VC source list and your own GitHub people list. Both selectors can also create new entries manually."
    >
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-6 mb-10 flex-wrap">
          <div>
            <h2 className="font-serif text-5xl leading-[1.05]">Watchlist</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              One selector controls which VCs feed your graph. The second keeps a focused list of GitHub-native people you want to track manually.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Selected VCs" value={selectedVcs.length} />
            <Stat label="Git people" value={selectedGithubPeople.length} />
            <Stat label="Available VCs" value={vcOptions.length} />
          </div>
        </div>

        <div className="grid gap-8">
          <Card className="rounded-[28px] border-border px-6 py-3 shadow-none">
            <Accordion type="multiple" defaultValue={["vc-selector", "git-selector"]} className="w-full">
              <AccordionItem value="vc-selector" className="border-border">
                <AccordionTrigger className="py-5 text-left hover:no-underline">
                  <div>
                    <div className="text-lg font-medium">VC watchlist</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedVcs.length} selected / {vcOptions.length} more available
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <div className="flex gap-3">
                    <select
                      className="flex h-11 w-full rounded-full border border-input bg-background px-4 text-sm"
                      value={selectedVcId}
                      onChange={(event) => setSelectedVcId(event.target.value)}
                    >
                      <option value="">Existing VC auswahlen</option>
                      {vcOptions.map((vc) => (
                        <option key={vc.id} value={vc.id}>
                          {vc.name} / {vc.country}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="rounded-full"
                      disabled={addVc.isPending || !selectedVcId}
                      onClick={addExistingVc}
                    >
                      {addVc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <Input placeholder="VC name" value={vcDraft.name} onChange={(event) => setVcDraft((current) => ({ ...current, name: event.target.value }))} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input placeholder="Country" value={vcDraft.country} onChange={(event) => setVcDraft((current) => ({ ...current, country: event.target.value }))} />
                      <Input placeholder="Size" value={vcDraft.sizeLabel} onChange={(event) => setVcDraft((current) => ({ ...current, sizeLabel: event.target.value }))} />
                    </div>
                    <Input placeholder="Sector focus" value={vcDraft.sectorFocus} onChange={(event) => setVcDraft((current) => ({ ...current, sectorFocus: event.target.value }))} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input placeholder="X / Twitter URL" value={vcDraft.twitterUrl} onChange={(event) => setVcDraft((current) => ({ ...current, twitterUrl: event.target.value }))} />
                      <Input placeholder="LinkedIn URL" value={vcDraft.linkedinUrl} onChange={(event) => setVcDraft((current) => ({ ...current, linkedinUrl: event.target.value }))} />
                    </div>
                    <Input placeholder="GitHub username (optional)" value={vcDraft.githubUsername} onChange={(event) => setVcDraft((current) => ({ ...current, githubUsername: event.target.value }))} />
                    <div className="flex justify-end">
                      <Button
                        className="rounded-full"
                        disabled={
                          addVc.isPending ||
                          !vcDraft.name.trim() ||
                          !vcDraft.country.trim() ||
                          !vcDraft.sizeLabel.trim() ||
                          !vcDraft.sectorFocus.trim() ||
                          !vcDraft.twitterUrl.trim() ||
                          !vcDraft.linkedinUrl.trim()
                        }
                        onClick={submitVcDraft}
                      >
                        Add VC manually
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="git-selector" className="border-border">
                <AccordionTrigger className="py-5 text-left hover:no-underline">
                  <div>
                    <div className="text-lg font-medium">Git people watchlist</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedGithubPeople.length} selected / {githubOptions.length} more available
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <div className="flex gap-3">
                    <select
                      className="flex h-11 w-full rounded-full border border-input bg-background px-4 text-sm"
                      value={selectedGithubPersonId}
                      onChange={(event) => setSelectedGithubPersonId(event.target.value)}
                    >
                      <option value="">Existing Git person auswahlen</option>
                      {githubOptions.map((entry) => {
                        const github = identityFor(entry.identities, "github");
                        return (
                          <option key={entry.person.id} value={entry.person.id}>
                            {entry.person.fullName} / @{github?.handle ?? "github"}
                          </option>
                        );
                      })}
                    </select>
                    <Button
                      className="rounded-full"
                      disabled={addGithubPerson.isPending || !selectedGithubPersonId}
                      onClick={addExistingGithubPerson}
                    >
                      {addGithubPerson.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <Input placeholder="Full name" value={githubDraft.fullName} onChange={(event) => setGithubDraft((current) => ({ ...current, fullName: event.target.value }))} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input placeholder="GitHub handle" value={githubDraft.githubHandle} onChange={(event) => setGithubDraft((current) => ({ ...current, githubHandle: event.target.value }))} />
                      <Input placeholder="X handle (optional)" value={githubDraft.xHandle} onChange={(event) => setGithubDraft((current) => ({ ...current, xHandle: event.target.value }))} />
                    </div>
                    <Input placeholder="LinkedIn handle or URL (optional)" value={githubDraft.linkedinHandle} onChange={(event) => setGithubDraft((current) => ({ ...current, linkedinHandle: event.target.value }))} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input placeholder="Role title" value={githubDraft.roleTitle} onChange={(event) => setGithubDraft((current) => ({ ...current, roleTitle: event.target.value }))} />
                      <Input placeholder="Company" value={githubDraft.company} onChange={(event) => setGithubDraft((current) => ({ ...current, company: event.target.value }))} />
                    </div>
                    <Input placeholder="Location" value={githubDraft.location} onChange={(event) => setGithubDraft((current) => ({ ...current, location: event.target.value }))} />
                    <Input placeholder="Short summary (optional)" value={githubDraft.summary} onChange={(event) => setGithubDraft((current) => ({ ...current, summary: event.target.value }))} />
                    <div className="flex justify-end">
                      <Button
                        className="rounded-full"
                        disabled={addGithubPerson.isPending || !githubDraft.fullName.trim() || !githubDraft.githubHandle.trim()}
                        onClick={submitGithubDraft}
                      >
                        Add Git person manually
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="selected-vcs" className="border-border">
                <AccordionTrigger className="py-5 text-left hover:no-underline">
                  <div>
                    <div className="text-lg font-medium">Selected VCs</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      These accounts define the investor side of your graph.
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  {watchlistQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                      ))}
                    </div>
                  ) : selectedVcs.length === 0 ? (
                    <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                      No VCs selected yet. Add one from the VC dropdown above.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedVcs.map((item) => (
                        <SelectedVcRow
                          key={item.id}
                          item={item}
                          busy={removeVc.isPending}
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
                    <div className="text-sm text-muted-foreground mt-1">
                      Manually curated GitHub-native people for testing and tracking.
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  {watchlistQuery.isLoading || peopleQuery.isLoading || identitiesQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                      ))}
                    </div>
                  ) : selectedGithubPeople.length === 0 ? (
                    <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                      No Git people selected yet. Add someone from the second dropdown or create a manual entry.
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
