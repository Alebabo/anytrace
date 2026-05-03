import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Github, Linkedin, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  useActivityEvents,
  usePersonIdentities,
  useTrackedPeople,
  useVcSources,
} from "@/hooks/useAnytrace";
import type { PersonIdentity } from "@/data/anytrace";
import { avatarSourcesForPerson } from "@/lib/avatarSources";

function identityFor(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

export default function ConnectionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { access } = useAccessState();
  const peopleQuery = useTrackedPeople(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const eventsQuery = useActivityEvents(access.isAuthenticated);
  const vcsQuery = useVcSources(access.isAuthenticated);

  const person = (peopleQuery.data ?? []).find((entry) => entry.id === id);
  const identities = (identitiesQuery.data ?? []).filter((entry) => entry.personId === id);
  const events = useMemo(
    () => (eventsQuery.data ?? []).filter((event) => event.personId === id),
    [eventsQuery.data, id],
  );
  const vcs = vcsQuery.data ?? [];
  const github = identityFor(identities, "github");
  const x = identityFor(identities, "x");
  const linkedin = identityFor(identities, "linkedin");

  return (
    <ProductGate>
      <div className="max-w-5xl mx-auto px-4 py-8 md:px-8 md:py-10">
        <Button asChild variant="ghost" className="-ml-2 mb-4 gap-1.5 text-muted-foreground">
          <Link to="/graph">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to graph
          </Link>
        </Button>

        {peopleQuery.isLoading || identitiesQuery.isLoading || eventsQuery.isLoading || vcsQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-[28px]" />
            <Skeleton className="h-80 w-full rounded-[28px]" />
          </div>
        ) : !person ? (
          <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
            Diese Detailansicht ist aktuell leer, weil keine Personen mehr aus dem alten Backend geladen werden.
          </div>
        ) : (
          <>
            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <EntityAvatar
                  name={person.fullName}
                  imageUrls={avatarSourcesForPerson(person, identities)}
                  size={64}
                  rounded="xl"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-3xl leading-tight md:text-4xl">{person.fullName}</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    {person.roleTitle}
                    {person.company ? ` / ${person.company}` : ""}
                    {person.location ? ` / ${person.location}` : ""}
                  </p>
                  <p className="text-sm mt-4 max-w-3xl leading-relaxed">{person.summary}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3 text-muted-foreground">
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
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8 shadow-sm mt-4">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-medium">Evidence timeline</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    The same proof layer now powers both weekly ranking and graph edges.
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">{events.length} events</div>
              </div>

              <ol className="space-y-4">
                {events.map((event) => {
                  const vc = vcs.find((entry) => entry.id === event.vcSourceId);
                  return (
                    <li key={event.id} className="rounded-2xl border border-border bg-surface-sunken px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium">{event.headline}</div>
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{event.description}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
                            <span>{new Date(event.occurredAt).toLocaleDateString()}</span>
                            <span>/</span>
                            <span>{event.platform}</span>
                            <span>/</span>
                            <span>{event.eventType}</span>
                            {vc && (
                              <>
                                <span>/</span>
                                <span>{vc.firm}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {event.sourceUrl ? (
                          <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </div>
    </ProductGate>
  );
}
