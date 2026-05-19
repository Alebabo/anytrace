import type {
  ActivityEvent,
  GithubSignalProfile,
  IdentityPlatform,
  PersonIdentity,
  TrackedPerson,
  WeeklyPick,
  WeeklyPickReason,
} from "@/data/traqr";

export type SignalFilterMode = "all" | "multi_follow" | "new" | "cross_verified" | "strong";

export type PersonSignalSnapshot = {
  personId: string;
  person: TrackedPerson;
  identities: PersonIdentity[];
  events: ActivityEvent[];
  githubProfile: GithubSignalProfile | null;
  uniqueVcFollowerCount: number;
  recentVcFollowerCount: number;
  githubEventCount: number;
  linkedinEventCount: number;
  viralRepoCount: number;
  importantGithubFollowerCount: number;
  repoTractionCount: number;
  recentPlatforms: IdentityPlatform[];
  crossPlatformCount: number;
  hasGithubEvidence: boolean;
  hasLinkedinEvidence: boolean;
  hasXEvidence: boolean;
  strongSignalScore: number;
  thresholds: {
    isMultiFollow: boolean;
    isNew: boolean;
    isCrossVerified: boolean;
    isStrong: boolean;
  };
  reasons: string[];
  primaryReason: string;
  summary: string;
};

function isRecent(value?: string | null, days = 7) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function compareDateDesc(left?: string | null, right?: string | null) {
  const leftTime = new Date(left || 0).getTime();
  const rightTime = new Date(right || 0).getTime();
  return rightTime - leftTime;
}

function pushReason(reasons: string[], value: string) {
  if (!reasons.includes(value)) {
    reasons.push(value);
  }
}

export function buildPersonSignalSnapshots({
  people,
  identities,
  events,
  githubProfiles,
}: {
  people: TrackedPerson[];
  identities: PersonIdentity[];
  events: ActivityEvent[];
  githubProfiles: GithubSignalProfile[];
}) {
  const identitiesByPerson = new Map<string, PersonIdentity[]>();
  const eventsByPerson = new Map<string, ActivityEvent[]>();
  const githubProfilesByPerson = new Map(githubProfiles.map((profile) => [profile.personId, profile]));

  for (const identity of identities) {
    const list = identitiesByPerson.get(identity.personId) ?? [];
    list.push(identity);
    identitiesByPerson.set(identity.personId, list);
  }

  for (const event of events) {
    const list = eventsByPerson.get(event.personId) ?? [];
    list.push(event);
    eventsByPerson.set(event.personId, list);
  }

  return people.map((person) => {
    const personEvents = [...(eventsByPerson.get(person.id) ?? [])].sort((left, right) =>
      compareDateDesc(left.occurredAt, right.occurredAt),
    );
    const personIdentities = identitiesByPerson.get(person.id) ?? [];
    const githubProfile = githubProfilesByPerson.get(person.id) ?? null;
    const uniqueRecentVcIds = new Set(
      personEvents
        .filter((event) => event.eventType === "vc_follow" && !!event.vcSourceId && isRecent(event.occurredAt, 21))
        .map((event) => event.vcSourceId as string),
    );
    const recentPlatforms = new Set<IdentityPlatform>();
    let githubEventCount = 0;
    let linkedinEventCount = 0;
    let viralRepoCount = 0;
    let importantGithubFollowerCount = 0;
    let repoTractionCount = 0;

    for (const event of personEvents) {
      if (isRecent(event.occurredAt, 14) && (event.platform === "x" || event.platform === "github" || event.platform === "linkedin")) {
        recentPlatforms.add(event.platform);
      }

      if (event.platform === "github") githubEventCount += 1;
      if (event.platform === "linkedin") linkedinEventCount += 1;
      if (event.eventType === "viral_repo") viralRepoCount += 1;
      if (event.eventType === "important_github_follower") importantGithubFollowerCount += 1;
      if (event.eventType === "repo_traction") repoTractionCount += 1;
    }

    const hasGithubEvidence =
      !!githubProfile && (githubProfile.starDelta7d > 0 || githubProfile.recentGithubEvents > 0 || githubProfile.stars > 0) ||
      githubEventCount > 0;
    const hasLinkedinEvidence = linkedinEventCount > 0;
    const hasXEvidence = uniqueRecentVcIds.size > 0;
    if (hasGithubEvidence) recentPlatforms.add("github");
    if (hasLinkedinEvidence) recentPlatforms.add("linkedin");
    if (hasXEvidence) recentPlatforms.add("x");

    const crossPlatformCount = recentPlatforms.size;
    const reasons: string[] = [];
    let strongSignalScore = 0;

    if (uniqueRecentVcIds.size >= 2) {
      strongSignalScore += 24;
      pushReason(reasons, `${uniqueRecentVcIds.size} VCs followed recently on X`);
    } else if (uniqueRecentVcIds.size === 1) {
      strongSignalScore += 10;
      pushReason(reasons, "Fresh VC follow on X");
    }

    if (uniqueRecentVcIds.size >= 4) {
      strongSignalScore += 8;
      pushReason(reasons, "Consensus is forming across multiple VCs");
    }

    if (viralRepoCount > 0) {
      strongSignalScore += 16;
      pushReason(reasons, "Viral GitHub repo signal");
    }

    if (importantGithubFollowerCount > 0) {
      strongSignalScore += 12;
      pushReason(reasons, "High-signal GitHub followers detected");
    }

    if (repoTractionCount > 0) {
      strongSignalScore += 10;
      pushReason(reasons, "Repository traction on GitHub");
    }

    if (githubProfile?.starDelta7d) {
      strongSignalScore += Math.min(14, Math.round(githubProfile.starDelta7d / 4));
      if (githubProfile.starDelta7d >= 12) {
        pushReason(reasons, `+${githubProfile.starDelta7d} GitHub stars in 7 days`);
      }
    }

    if (hasLinkedinEvidence) {
      strongSignalScore += 8;
      pushReason(reasons, "LinkedIn corroboration available");
    }

    if (crossPlatformCount >= 2) {
      strongSignalScore += 12;
      pushReason(reasons, "Cross-platform confirmation");
    }

    if (crossPlatformCount >= 3) {
      strongSignalScore += 8;
      pushReason(reasons, "Verified across X, GitHub and LinkedIn");
    }

    const thresholds = {
      isMultiFollow: uniqueRecentVcIds.size >= 2,
      isNew: personEvents.some((event) => isRecent(event.occurredAt, 7)),
      isCrossVerified: crossPlatformCount >= 2,
      isStrong: strongSignalScore >= 35,
    };

    const primaryReason =
      reasons[0] ||
      (hasGithubEvidence ? "GitHub momentum detected" : hasXEvidence ? "Recent VC follow signal" : "Emerging tracked profile");
    const summary =
      thresholds.isCrossVerified
        ? `${person.fullName} is showing aligned signal across ${crossPlatformCount} platforms.`
        : hasGithubEvidence && hasXEvidence
          ? `${person.fullName} combines fresh X attention with GitHub momentum.`
          : hasXEvidence
            ? `${person.fullName} is beginning to attract fresh VC attention on X.`
            : hasGithubEvidence
              ? `${person.fullName} is gaining technical momentum on GitHub.`
              : `${person.fullName} is tracked but still needs stronger corroboration.`;

    return {
      personId: person.id,
      person,
      identities: personIdentities,
      events: personEvents,
      githubProfile,
      uniqueVcFollowerCount: uniqueRecentVcIds.size,
      recentVcFollowerCount: uniqueRecentVcIds.size,
      githubEventCount,
      linkedinEventCount,
      viralRepoCount,
      importantGithubFollowerCount,
      repoTractionCount,
      recentPlatforms: [...recentPlatforms],
      crossPlatformCount,
      hasGithubEvidence,
      hasLinkedinEvidence,
      hasXEvidence,
      strongSignalScore,
      thresholds,
      reasons,
      primaryReason,
      summary,
    } satisfies PersonSignalSnapshot;
  });
}

export function eventMatchesSignalFilter(event: ActivityEvent, snapshot: PersonSignalSnapshot | undefined, mode: SignalFilterMode) {
  if (!snapshot || mode === "all") return true;
  if (mode === "multi_follow") return snapshot.thresholds.isMultiFollow;
  if (mode === "new") return isRecent(event.occurredAt, 7);
  if (mode === "cross_verified") return snapshot.thresholds.isCrossVerified;
  if (mode === "strong") return snapshot.thresholds.isStrong;
  return true;
}

export function deriveTopPicksFromSignals(snapshots: PersonSignalSnapshot[]): WeeklyPick[] {
  return snapshots
    .filter((snapshot) => snapshot.thresholds.isStrong && (snapshot.thresholds.isMultiFollow || snapshot.thresholds.isCrossVerified))
    .sort((left, right) => {
      const scoreDiff = right.strongSignalScore - left.strongSignalScore;
      if (scoreDiff !== 0) return scoreDiff;
      return compareDateDesc(right.events[0]?.occurredAt, left.events[0]?.occurredAt);
    })
    .slice(0, 12)
    .map((snapshot, index) => {
      const reasons: WeeklyPickReason[] = [];
      if (snapshot.uniqueVcFollowerCount > 0) {
        reasons.push({
          id: `${snapshot.personId}-x-burst`,
          reasonKind: "vc_follow_burst",
          title: "VC follow burst",
          detail: `${snapshot.uniqueVcFollowerCount} unique VC follow signals on X over the recent window.`,
          metricValue: snapshot.uniqueVcFollowerCount,
          displayOrder: reasons.length,
          sourceEventId: snapshot.events.find((event) => event.eventType === "vc_follow")?.id || null,
        });
      }
      if (snapshot.hasGithubEvidence) {
        reasons.push({
          id: `${snapshot.personId}-github-traction`,
          reasonKind: "repo_traction",
          title: "GitHub traction",
          detail:
            snapshot.githubProfile?.starDelta7d && snapshot.githubProfile.starDelta7d > 0
              ? `${snapshot.githubProfile.primaryRepoLabel} gained ${snapshot.githubProfile.starDelta7d} stars in 7 days.`
              : "GitHub activity adds technical confirmation.",
          metricValue: snapshot.githubProfile?.starDelta7d ?? snapshot.githubEventCount,
          displayOrder: reasons.length,
          sourceEventId: snapshot.events.find((event) => event.platform === "github")?.id || null,
        });
      }
      if (snapshot.hasLinkedinEvidence) {
        reasons.push({
          id: `${snapshot.personId}-linkedin-check`,
          reasonKind: "big_tech_exit",
          title: "LinkedIn confirmation",
          detail: "LinkedIn activity corroborates the momentum seen on X or GitHub.",
          metricValue: snapshot.linkedinEventCount,
          displayOrder: reasons.length,
          sourceEventId: snapshot.events.find((event) => event.platform === "linkedin")?.id || null,
        });
      }

      return {
        id: `top-pick-${snapshot.personId}`,
        weekStart: new Date().toISOString().slice(0, 10),
        rank: index + 1,
        score: snapshot.strongSignalScore,
        primaryReason: snapshot.primaryReason,
        summary: snapshot.summary,
        vcFollowCount: snapshot.uniqueVcFollowerCount,
        githubAttentionScore: snapshot.githubProfile?.githubAttentionScore ?? snapshot.githubEventCount,
        bigTechExit: snapshot.hasLinkedinEvidence,
        person: snapshot.person,
        reasons,
        githubProfile: snapshot.githubProfile,
      } satisfies WeeklyPick;
    });
}
