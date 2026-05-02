import { Github, Linkedin, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useWatchlist } from "@/hooks/useAnytrace";
import type { PersonIdentity, WatchlistPerson } from "@/data/anytrace";

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

function WatchlistRow({ person }: { person: WatchlistPerson }) {
  const github = identityFor(person.identities, "github");
  const x = identityFor(person.identities, "x");
  const linkedin = identityFor(person.identities, "linkedin");

  return (
    <div className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-border last:border-b-0 items-center">
      <div className="col-span-5 flex items-center gap-3 min-w-0">
        <EntityAvatar name={person.fullName} githubUsername={github?.handle} size={38} rounded="xl" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{person.fullName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.roleTitle}
            {person.company ? ` · ${person.company}` : ""}
          </div>
        </div>
      </div>
      <div className="col-span-2 text-sm text-muted-foreground">{person.location}</div>
      <div className="col-span-2 text-sm">
        <span className="font-medium">{person.vcFollowersThisWeek}</span>
        <span className="text-muted-foreground"> VC follows</span>
      </div>
      <div className="col-span-1 text-sm">
        <span className="font-medium">{person.githubMomentum}</span>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-3 text-muted-foreground">
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

export default function WatchlistPage() {
  const { access } = useAccessState();
  const watchlistQuery = useWatchlist(access.isAuthenticated);
  const watchlist = watchlistQuery.data ?? [];

  return (
    <ProductGate
      title="Watchlist"
      description="The first version stays seeded and curated: later this list can be imported from X or LinkedIn connections, but right now it stays tight and signal-focused."
    >
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-6 mb-10 flex-wrap">
          <div>
            <h2 className="font-serif text-5xl leading-[1.05]">Watchlist</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              Tracked people, their public identities, and the early indicators that feed the weekly ranking.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Tracked people" value={watchlist.length} />
            <Stat label="VC sources" value={3} />
            <Stat label="LinkedIn" value="Later" />
          </div>
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
              <div className="col-span-5">Person</div>
              <div className="col-span-2">Location</div>
              <div className="col-span-2">Attention</div>
              <div className="col-span-1">GitHub</div>
              <div className="col-span-2 text-right">Profiles</div>
            </div>
            {watchlist.map((person) => (
              <WatchlistRow key={person.id} person={person} />
            ))}
          </div>
        )}
      </div>
    </ProductGate>
  );
}
