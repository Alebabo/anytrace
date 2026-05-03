import { Github, Linkedin, Trash2, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  usePersonIdentities,
  useRemoveGithubPersonFromWatchlist,
  useRemoveVcFromWatchlist,
  useWatchlist,
} from "@/hooks/useAnytrace";
import type {
  PersonIdentity,
  UserVcWatchlistItem,
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

export default function WatchlistPage() {
  const { access } = useAccessState();
  const watchlistQuery = useWatchlist(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const removeVc = useRemoveVcFromWatchlist();
  const removeGithubPerson = useRemoveGithubPersonFromWatchlist();

  const watchlist = watchlistQuery.data;
  const selectedVcs = watchlist?.selectedVcs ?? [];
  const selectedGithubPeople = watchlist?.people ?? [];
  const identities = identitiesQuery.data ?? [];

  return (
    <ProductGate
      title="Watchlist"
      description="Keep the page compact by expanding only the watchlist blocks you want to inspect."
    >
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-6 mb-10 flex-wrap">
          <div>
            <h2 className="font-serif text-5xl leading-[1.05]">Watchlist</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              Expand the venture or people watchlist only when you need the full list. The page stays compact by default.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Selected VCs" value={selectedVcs.length} />
            <Stat label="Git people" value={selectedGithubPeople.length} />
            <Stat label="Open cards" value={2} />
          </div>
        </div>

        <div className="grid gap-8">
          <Card className="rounded-[28px] border-border px-6 py-3 shadow-none">
            <Accordion type="multiple" defaultValue={["selected-vcs", "selected-git-people"]} className="w-full">
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
                      No VCs selected yet.
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
                  {watchlistQuery.isLoading || identitiesQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-[28px]" />
                      ))}
                    </div>
                  ) : selectedGithubPeople.length === 0 ? (
                    <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
                      No Git people selected yet.
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
