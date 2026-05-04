import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Github,
  Linkedin,
  Star,
  Twitter,
  User,
} from "lucide-react";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  useActivityEvents,
  useGithubSignalProfiles,
  useGraphData,
  usePersonIdentities,
  useVcSources,
} from "@/hooks/useAnytrace";
import type { PersonIdentity, VcSource } from "@/data/anytrace";
import { avatarSourcesForPerson } from "@/lib/avatarSources";

function identityFor(identities: PersonIdentity[], platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.platform === platform);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatSignalTimestamp(value?: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatTrackingDate(value?: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function scoreForDossier(watchers: number, stars: number, delta: number, socials: number) {
  const score = 4.35 + watchers * 0.58 + socials * 0.24 + Math.min(2.2, delta / 40) + Math.min(1.15, stars / 50000);
  return Math.min(9.9, Number(score.toFixed(2)));
}

function confidenceForDossier(watchers: number, hasGithub: boolean, socials: number) {
  return Math.min(98, 76 + watchers * 5 + socials * 3 + (hasGithub ? 8 : 0));
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function DossierMark({ letter }: { letter: string }) {
  return (
    <div className="grid h-[76px] w-[76px] place-items-center rounded-full border border-[#d7c5aa] bg-[#d3b180] p-1 shadow-[0_8px_20px_rgba(42,42,42,0.08)]">
      <div
        className="grid h-full w-full place-items-center rounded-full text-[34px] font-medium text-white"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(114,73,31,0.68) 0px, rgba(114,73,31,0.68) 7px, rgba(201,159,98,0.88) 7px, rgba(201,159,98,0.88) 14px)",
        }}
      >
        <span style={{ fontFamily: '"Playfair Display", Garamond, Georgia, serif' }}>{letter}</span>
      </div>
    </div>
  );
}

function DossierAvatar({
  name,
  imageUrls,
}: {
  name: string;
  imageUrls: string[];
}) {
  if (imageUrls.length > 0) {
    return (
      <div className="rounded-full border border-[#d7c5aa] bg-[#fcfbf8] p-1 shadow-[0_8px_20px_rgba(42,42,42,0.08)]">
        <EntityAvatar
          name={name}
          imageUrls={imageUrls}
          size={68}
          className="rounded-full"
        />
      </div>
    );
  }

  return <DossierMark letter={name.trim().charAt(0).toLowerCase() || "m"} />;
}

function StatusBadge({
  children,
  tone,
}: {
  children: string;
  tone: "green" | "blue";
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] ${
        tone === "green" ? "bg-[#e4f1df] text-[#355b35]" : "bg-[#e5eef9] text-[#34557a]"
      }`}
    >
      {children}
    </span>
  );
}

function MetaItem({
  icon: Icon,
  children,
}: {
  icon: typeof Github;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      <span>{children}</span>
    </span>
  );
}

function RepoTrend({
  stars,
  starDelta7d,
  starDelta30d,
}: {
  stars: number;
  starDelta7d: number;
  starDelta30d: number;
}) {
  const estimatedStart = Math.max(0, stars - Math.max(starDelta30d, starDelta7d * 2, Math.round(stars * 0.18)));
  const checkpoints = [
    estimatedStart,
    estimatedStart + Math.max(0, Math.round(starDelta30d * 0.16)),
    estimatedStart + Math.max(0, Math.round(starDelta30d * 0.34)),
    estimatedStart + Math.max(0, Math.round(starDelta30d * 0.48)),
    estimatedStart + Math.max(0, Math.round(starDelta30d * 0.63)),
    estimatedStart + Math.max(0, Math.round(starDelta30d * 0.79)),
    stars,
  ];
  const width = 320;
  const height = 120;
  const maxValue = Math.max(...checkpoints, 1);
  const minValue = Math.min(...checkpoints, 0);
  const step = width / (checkpoints.length - 1);
  const points = checkpoints.map((value, index) => {
    const normalized = (value - minValue) / Math.max(maxValue - minValue, 1);
    return {
      x: index * step,
      y: height - normalized * (height - 24) - 8,
    };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full">
      <path
        d={linePath}
        fill="none"
        stroke="#5b8d5a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4.5 : 2.5} fill="#5b8d5a" />
      ))}
    </svg>
  );
}

type KeySignal = {
  label: string;
  href: string | null;
  timestamp: string | null;
};

type DossierFact = {
  label: string;
  value: string;
};

export default function ConnectionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { access } = useAccessState();
  const graphQuery = useGraphData(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const githubProfilesQuery = useGithubSignalProfiles(access.isAuthenticated);
  const eventsQuery = useActivityEvents(access.isAuthenticated);
  const vcsQuery = useVcSources(access.isAuthenticated);

  const graphPeople = useMemo(() => graphQuery.data?.people ?? [], [graphQuery.data?.people]);
  const identitiesData = useMemo(() => identitiesQuery.data ?? [], [identitiesQuery.data]);
  const githubProfiles = useMemo(() => githubProfilesQuery.data ?? [], [githubProfilesQuery.data]);
  const eventsData = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const vcs = useMemo(() => vcsQuery.data ?? [], [vcsQuery.data]);
  const vcsById = useMemo(() => new Map(vcs.map((vc) => [vc.id, vc])), [vcs]);

  const person = useMemo(() => graphPeople.find((entry) => entry.id === id) ?? null, [graphPeople, id]);
  const identities = useMemo(() => identitiesData.filter((entry) => entry.personId === id), [identitiesData, id]);
  const githubProfile = useMemo(
    () => githubProfiles.find((entry) => entry.personId === id) ?? null,
    [githubProfiles, id],
  );
  const sortedEvents = useMemo(
    () =>
      eventsData
        .filter((event) => event.personId === id)
        .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()),
    [eventsData, id],
  );
  const socialIdentities = useMemo(
    () =>
      [...identities].sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) return Number(right.isPrimary) - Number(left.isPrimary);
        return left.platform.localeCompare(right.platform);
      }),
    [identities],
  );

  const xIdentity = identityFor(socialIdentities, "x");
  const githubIdentity = identityFor(socialIdentities, "github");
  const linkedinIdentity = identityFor(socialIdentities, "linkedin");

  const networkPeople = useMemo(() => {
    const unique = new Map<string, { vc: VcSource; occurredAt: string }>();
    for (const event of sortedEvents) {
      if (!event.vcSourceId) continue;
      const vc = vcsById.get(event.vcSourceId);
      if (!vc || unique.has(vc.id)) continue;
      unique.set(vc.id, {
        vc,
        occurredAt: event.occurredAt,
      });
    }
    return [...unique.values()];
  }, [sortedEvents, vcsById]);

  const dossierScore = scoreForDossier(
    networkPeople.length,
    githubProfile?.stars ?? 0,
    githubProfile?.starDelta7d ?? 0,
    socialIdentities.length,
  );
  const dossierConfidence = confidenceForDossier(networkPeople.length, !!githubProfile, socialIdentities.length);
  const hasGithubSignals = Boolean(githubProfile?.primaryRepoLabel || githubIdentity);
  const hasSocialPresence = Boolean(xIdentity || linkedinIdentity);
  const primaryStatus = person?.roleTitle?.toLowerCase().includes("founder") ? "FOUNDER" : person?.roleTitle?.trim() || "TRACKED";
  const secondaryStatus = hasGithubSignals ? "GITHUB" : hasSocialPresence ? "SOCIAL" : "PROFILE";

  const keySignals = useMemo(() => {
    const rows: KeySignal[] = [];

    if (githubProfile?.primaryRepoLabel) {
      rows.push({
        label:
          (githubProfile?.stars ?? 0) > 0
            ? `${githubProfile.primaryRepoLabel} · ${formatNumber(githubProfile.stars)} stars · +${formatNumber(githubProfile.starDelta7d)} / 7d`
            : `Owner of ${githubProfile.primaryRepoLabel}`,
        href: githubIdentity?.profileUrl || null,
        timestamp: formatSignalTimestamp(githubProfile.snapshotDate),
      });
    }

    if (sortedEvents[0]) {
      rows.push({
        label: sortedEvents[0].headline,
        href: sortedEvents[0].sourceUrl || null,
        timestamp: formatSignalTimestamp(sortedEvents[0].occurredAt),
      });
    }

    if (sortedEvents[1]) {
      rows.push({
        label: sortedEvents[1].headline,
        href: sortedEvents[1].sourceUrl || null,
        timestamp: formatSignalTimestamp(sortedEvents[1].occurredAt),
      });
    }

    return rows.slice(0, 3);
  }, [githubIdentity?.profileUrl, githubProfile, networkPeople, sortedEvents]);

  const dossierFacts = useMemo(() => {
    if (!person) return [] as DossierFact[];

    const facts: DossierFact[] = [];
    const normalizedRole = person.roleTitle.trim().toLowerCase();
    const hasCompany = Boolean(person.company?.trim());

    if (hasCompany && (normalizedRole.includes("founder") || normalizedRole.includes("co-founder") || normalizedRole.includes("cofounder"))) {
      facts.push({
        label: "Founder of",
        value: person.company.trim(),
      });
    } else if (hasCompany) {
      facts.push({
        label: "Works at",
        value: person.company.trim(),
      });
    }

    if (person.location.trim()) {
      facts.push({
        label: "Based in",
        value: person.location.trim(),
      });
    }

    if (networkPeople.length > 0) {
      facts.push({
        label: "Followed by",
        value: `${networkPeople.length} tracked VC${networkPeople.length === 1 ? "" : "s"}`,
      });
    }

    return facts.slice(0, 4);
  }, [networkPeople.length, person]);

  const repoName = githubProfile?.primaryRepoLabel?.split("/").at(-1) || githubProfile?.primaryRepoLabel || "No anchored repo yet";
  const repoDescription =
    person?.summary?.trim() || "This profile is being tracked through technical momentum and network interaction signals.";
  const personImageUrls = person ? avatarSourcesForPerson(person, identities) : [];
  const visibleNetworkWatchers = networkPeople.slice(0, 4);
  const trackingWindow = useMemo(() => {
    const timestamps = [
      githubProfile?.snapshotDate,
      ...sortedEvents.map((event) => event.occurredAt),
      ...networkPeople.map((entry) => entry.occurredAt),
    ]
      .map((value) => (value ? new Date(value).getTime() : Number.NaN))
      .filter((value) => Number.isFinite(value));

    if (timestamps.length === 0) return null;

    const earliest = new Date(Math.min(...timestamps)).toISOString();
    const latest = new Date(Math.max(...timestamps)).toISOString();
    const earliestLabel = formatTrackingDate(earliest);
    const latestLabel = formatTrackingDate(latest);

    if (!earliestLabel) return null;
    if (!latestLabel || earliestLabel === latestLabel) return `Tracking since ${earliestLabel}`;
    return `Tracking window ${earliestLabel} - ${latestLabel}`;
  }, [githubProfile?.snapshotDate, networkPeople, sortedEvents]);

  return (
    <ProductGate>
      <div className="min-h-screen bg-[#faf9f6] text-[#222222]">
        <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 md:px-11 md:py-10">
          <Link
            to="/graph"
            className="mb-10 inline-flex items-center gap-2 text-[15px] font-medium text-[#3f6aa1] transition-colors hover:text-[#264b78] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to feed
          </Link>

          {graphQuery.isLoading || identitiesQuery.isLoading || githubProfilesQuery.isLoading || eventsQuery.isLoading || vcsQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-56 w-full rounded-[28px]" />
              <Skeleton className="h-[520px] w-full rounded-[28px]" />
            </div>
          ) : !person ? (
            <div className="rounded-[28px] border border-[#dfddd5] bg-white/60 p-8 text-sm text-[#6a6a6a]">
              No dossier could be built for this profile yet.
            </div>
          ) : (
            <div className="space-y-10 md:space-y-12">
              <section className="border-b border-[#ddd8ce] pb-8 md:pb-10">
                <div className="grid gap-5 md:items-start md:[grid-template-columns:76px_minmax(0,1fr)_auto]">
                  <DossierAvatar name={person.fullName} imageUrls={personImageUrls} />

                  <div className="min-w-0 flex-1">
                    <div>
                      <div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                          <h1
                            className="text-[30px] leading-none tracking-[-0.04em] text-[#1d1d1b] sm:text-[34px] md:text-[42px]"
                            style={{ fontFamily: '"Playfair Display", Garamond, Georgia, serif' }}
                          >
                            {person.fullName}
                          </h1>
                          <StatusBadge tone="green">{primaryStatus}</StatusBadge>
                          <StatusBadge tone="blue">{secondaryStatus}</StatusBadge>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                          <span className="text-[18px] font-semibold tracking-[-0.03em] text-[#1d1d1b] sm:text-[20px] md:text-[22px]">
                            SCORE {dossierScore.toFixed(2)}
                          </span>
                          <span className="inline-flex items-center gap-2 text-[#4c7b54]">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#6f9a67]" />
                            {dossierConfidence}% confidence
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] sm:text-[14px] text-[#6f6b64]">
                          <MetaItem icon={User}>
                            {trackingWindow || "Tracking window unavailable"}
                          </MetaItem>
                        </div>

                        {dossierFacts.length > 0 && (
                          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {dossierFacts.map((fact) => (
                              <div
                                key={`${fact.label}-${fact.value}`}
                                className="rounded-[18px] border border-[#dfddd5] bg-[#fcfbf8] px-3 py-2.5"
                              >
                                <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b877f]">{fact.label}</div>
                                <div className="mt-1 text-[14px] leading-5 text-[#2d2c29]">{fact.value}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="mt-5 max-w-[760px] text-[14px] leading-6 text-[#403f3c] sm:text-[15px] sm:leading-7">
                          {person.summary?.trim() ||
                            `${person.fullName} is tracked in Anytrace through connected GitHub, X, and LinkedIn signals. This dossier summarizes current repository momentum, network activity, and evidence that makes the profile relevant.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
                    {githubIdentity ? (
                      <a
                        href={githubIdentity.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#d8d3c7] bg-[#fcfbf8] px-5 text-[14px] text-[#282826] transition-colors hover:border-[#bdb5a4] hover:text-black sm:h-14 sm:w-auto sm:px-6 sm:text-[15px]"
                      >
                        <Github className="h-5 w-5" />
                        GitHub
                      </a>
                    ) : null}
                    {linkedinIdentity ? (
                      <a
                        href={linkedinIdentity.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#d8d3c7] bg-[#fcfbf8] px-5 text-[14px] text-[#282826] transition-colors hover:border-[#bdb5a4] hover:text-black sm:h-14 sm:w-auto sm:px-6 sm:text-[15px]"
                      >
                        <Linkedin className="h-5 w-5" />
                        LinkedIn
                      </a>
                    ) : null}
                    {xIdentity ? (
                      <a
                        href={xIdentity.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#d8d3c7] bg-[#fcfbf8] px-5 text-[14px] text-[#282826] transition-colors hover:border-[#bdb5a4] hover:text-black sm:h-14 sm:w-auto sm:px-6 sm:text-[15px]"
                      >
                        <Twitter className="h-5 w-5" />
                        @{xIdentity.handle}
                      </a>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className={`grid gap-8 md:items-start ${hasGithubSignals ? "md:[grid-template-columns:minmax(0,1.18fr)_minmax(340px,0.82fr)]" : ""}`}>
                <div className="space-y-8">
                  {keySignals.length > 0 ? (
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b877f]">Key signals</div>
                      <div className="mt-3 divide-y divide-[#dfddd5] rounded-[20px] border border-[#dfddd5] bg-[#fcfbf8]">
                        {keySignals.map((signal, index) => (
                          <div key={`${signal.label}-${index}`} className="flex items-start gap-3 px-4 py-3">
                            <span className="mt-1 shrink-0 text-[14px] font-semibold leading-none text-[#c76b45]">*</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[14px] leading-5 text-[#2d2c29]">{signal.label}</div>
                              {signal.timestamp ? (
                                <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#8b877f]">{signal.timestamp}</div>
                              ) : null}
                            </div>
                            {signal.href ? (
                              <a
                                href={signal.href}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[12px] text-[#3f6aa1] transition-colors hover:text-[#264b78] hover:underline"
                                aria-label={`Open evidence for ${signal.label}`}
                              >
                                Open <ArrowUpRight className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b877f]">
                        Network Watchers ({networkPeople.length})
                      </div>
                      <Link
                        to="/graph"
                        className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#3f6aa1] transition-colors hover:text-[#264b78] hover:underline"
                      >
                        View all watchers
                      </Link>
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {visibleNetworkWatchers.length > 0 ? (
                        visibleNetworkWatchers.map(({ vc }) => (
                          <div
                            key={vc.id}
                            className="flex items-center gap-4 rounded-[22px] border border-[#dfddd5] bg-[#f3f1eb] px-4 py-4 transition-shadow hover:shadow-[0_8px_18px_rgba(20,20,20,0.05)]"
                          >
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#505050] text-sm font-semibold text-white">
                              {initialsForName(vc.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-semibold text-[#1f1f1d]">{vc.name}</div>
                              <div className="mt-1 text-sm text-[#7a766e]">{vc.firm || vc.title || "Tracked VC"}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-[#dfddd5] bg-[#f3f1eb] px-4 py-4 text-sm text-[#7a766e]">
                          No tracked VC follows are visible for this profile yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {hasGithubSignals ? (
                  <div className="rounded-[28px] border border-[#dfddd5] bg-[#f5f3ec] p-5 shadow-[0_8px_20px_rgba(20,20,20,0.03)] sm:p-6">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b877f]">Owned repository</div>
                    <div className="mt-4 break-words text-[24px] font-semibold tracking-[-0.03em] text-[#1f1f1d] sm:text-[28px]">{repoName}</div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#6d685f]">
                      <span className="inline-flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-[#5b8d5a]" />
                        {formatNumber(githubProfile?.stars ?? 0)}
                      </span>
                      <span className="rounded-full bg-[#ebe7dc] px-2.5 py-1 text-[12px] text-[#4f4b45]">GitHub</span>
                    </div>

                    <p className="mt-4 max-w-md text-[14px] leading-6 text-[#4c4a44]">
                      {repoDescription}
                    </p>

                    <div className="mt-5">
                      <RepoTrend
                        stars={githubProfile?.stars ?? 0}
                        starDelta7d={githubProfile?.starDelta7d ?? 0}
                        starDelta30d={githubProfile?.starDelta30d ?? 0}
                      />
                    </div>

                    <div className="mt-3 text-sm text-[#6f6b64]">
                      + {Math.max(0, Math.round((githubProfile?.watchers ?? 0) / 75))} other public repos
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>
      </div>
    </ProductGate>
  );
}
