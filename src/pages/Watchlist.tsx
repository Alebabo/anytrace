import { useState } from "react";
import { Github, Linkedin, Loader2, Plus, Trash2, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  useAddVcToWatchlist,
  useRemoveVcFromWatchlist,
  useWatchlist,
} from "@/hooks/useAnytrace";
import type { PersonIdentity, UserVcWatchlistItem, VcSourceDraft, WatchlistPerson } from "@/data/anytrace";

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
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{vcSource.name}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">
          {vcSource.title} / {vcSource.firm}
          {vcSource.xHandle ? ` / @${vcSource.xHandle}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
          {vcSource.syncStatus ?? "idle"}
        </span>
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

function WatchlistRow({ person }: { person: WatchlistPerson }) {
  const github = identityFor(person.identities, "github");
  const x = identityFor(person.identities, "x");
  const linkedin = identityFor(person.identities, "linkedin");

  return (
    <div className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-border last:border-b-0 items-center">
      <div className="col-span-4 flex items-center gap-3 min-w-0">
        <EntityAvatar name={person.fullName} githubUsername={github?.handle} size={38} rounded="xl" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{person.fullName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.roleTitle}
            {person.company ? ` / ${person.company}` : ""}
          </div>
        </div>
      </div>
      <div className="col-span-2 text-sm text-muted-foreground">{person.location}</div>
      <div className="col-span-2 text-sm">
        <span className="font-medium">{person.vcFollowersThisWeek}</span>
        <span className="text-muted-foreground"> VC follows</span>
      </div>
      <div className="col-span-2 text-sm">
        <span className="font-medium">{person.githubMomentum}</span>
        <span className="text-muted-foreground"> repo delta</span>
      </div>
      <div className="col-span-1 text-sm">
        <span className="font-medium">{person.importantGithubFollowers}</span>
      </div>
      <div className="col-span-1 flex items-center justify-end gap-3 text-muted-foreground">
        {linkedin && (
          <a href={linkedin.profileUrl} target="_blank" rel="noreferrer" className="hover:text-signal-linkedin">
            <Linkedin className="h-4 w-4" />
          </a>
        )}
        {x && (
          <a href={x.profileUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
            <Twitter className="h-4 w-4" />
          </a>
        )}
        {github && (
          <a href={github.profileUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
            <Github className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

const emptyDraft: VcSourceDraft = {
  name: "",
  firm: "",
  xHandle: "",
  title: "",
  country: "",
  city: "",
  githubUsername: "",
  linkedinUrl: "",
  websiteUrl: "",
  notes: "",
};

export default function WatchlistPage() {
  const { access } = useAccessState();
  const watchlistQuery = useWatchlist(access.isAuthenticated);
  const addVc = useAddVcToWatchlist();
  const removeVc = useRemoveVcFromWatchlist();
  const [draft, setDraft] = useState<VcSourceDraft>(emptyDraft);

  const watchlist = watchlistQuery.data;
  const selectedVcs = watchlist?.selectedVcs ?? [];
  const people = watchlist?.people ?? [];

  const submitDraft = async () => {
    if (!draft.name.trim() || !draft.firm.trim() || !draft.xHandle.trim()) return;
    await addVc.mutateAsync(draft);
    setDraft(emptyDraft);
  };

  return (
    <ProductGate
      title="Watchlist"
      description="Choose the VCs you want to follow. Those selected accounts become your personal signal sources for the graph and X ingest."
    >
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-6 mb-10 flex-wrap">
          <div>
            <h2 className="font-serif text-5xl leading-[1.05]">Watchlist</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              Selected VCs define your signal graph. Tracked people remain the universe that Anytrace scores with X and GitHub evidence.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Selected VCs" value={selectedVcs.length} />
            <Stat label="Tracked people" value={people.length} />
            <Stat label="LinkedIn" value="Later" />
          </div>
        </div>

        <div className="grid gap-8">
          <section>
            <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h3 className="text-lg font-medium">Selected VCs</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add venture accounts manually. The graph only renders edges from this personal VC set.
                </p>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm mb-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="VC name"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
                <Input
                  placeholder="Firm"
                  value={draft.firm}
                  onChange={(event) => setDraft((current) => ({ ...current, firm: event.target.value }))}
                />
                <Input
                  placeholder="X handle"
                  value={draft.xHandle}
                  onChange={(event) => setDraft((current) => ({ ...current, xHandle: event.target.value }))}
                />
                <Input
                  placeholder="Title (optional)"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
                <Input
                  placeholder="GitHub username (optional)"
                  value={draft.githubUsername}
                  onChange={(event) => setDraft((current) => ({ ...current, githubUsername: event.target.value }))}
                />
                <Input
                  placeholder="LinkedIn URL (optional)"
                  value={draft.linkedinUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, linkedinUrl: event.target.value }))}
                />
                <Input
                  placeholder="Website URL (optional)"
                  value={draft.websiteUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, websiteUrl: event.target.value }))}
                />
                <Input
                  placeholder="Country (optional)"
                  value={draft.country}
                  onChange={(event) => setDraft((current) => ({ ...current, country: event.target.value }))}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  className="rounded-full gap-2"
                  onClick={submitDraft}
                  disabled={addVc.isPending || !draft.name.trim() || !draft.firm.trim() || !draft.xHandle.trim()}
                >
                  {addVc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add VC
                </Button>
              </div>
            </div>

            {watchlistQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                ))}
              </div>
            ) : selectedVcs.length === 0 ? (
              <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                No VCs selected yet. Add a few accounts above so the graph has sources to render.
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
          </section>

          <section>
            <div className="mb-4">
              <h3 className="text-lg font-medium">Tracked people</h3>
              <p className="text-sm text-muted-foreground mt-1">
                GitHub repo traction and important new GitHub followers add conviction on top of the VC signal layer.
              </p>
            </div>

            {watchlistQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                ))}
              </div>
            ) : watchlistQuery.isError ? (
              <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                Could not load the watchlist.
              </div>
            ) : (
              <div className="rounded-[28px] border border-border bg-card overflow-hidden shadow-sm">
                <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <div className="col-span-4">Person</div>
                  <div className="col-span-2">Location</div>
                  <div className="col-span-2">VC attention</div>
                  <div className="col-span-2">GitHub</div>
                  <div className="col-span-1">Important</div>
                  <div className="col-span-1 text-right">Profiles</div>
                </div>
                {people.map((person) => (
                  <WatchlistRow key={person.id} person={person} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ProductGate>
  );
}
