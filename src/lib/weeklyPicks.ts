import type {
  ActivityEvent,
  TrackedPerson,
  WeeklyPick,
  WeeklyPickReason,
} from "@/data/anytrace";

const DAY_MS = 86_400_000;

function startOfWeekUtc(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function referenceNow(events: ActivityEvent[]) {
  const latest = events.reduce((max, event) => {
    const time = Date.parse(event.occurredAt);
    return Number.isFinite(time) ? Math.max(max, time) : max;
  }, 0);
  return Math.max(Date.now(), latest);
}

function importanceScoreFromFollowers(events: ActivityEvent[]) {
  return events.reduce((sum, event) => {
    const score = Number(event.metadata.importance_score ?? event.metadata.follower_count ?? 0);
    return sum + (Number.isFinite(score) ? score : 0);
  }, 0);
}

export function buildWeeklyPicks(
  people: TrackedPerson[],
  events: ActivityEvent[],
): WeeklyPick[] {
  const now = referenceNow(events);
  const windowStart = now - 7 * DAY_MS;
  const weekStart = startOfWeekUtc(now);

  const picks = people
    .map<WeeklyPick | null>((person) => {
      const personEvents = events.filter((event) => {
        if (event.personId !== person.id) return false;
        const timestamp = Date.parse(event.occurredAt);
        return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp <= now;
      });

      if (personEvents.length === 0) return null;

      const vcFollowEvents = personEvents.filter((event) => event.eventType === "vc_follow");
      const repoTractionEvents = personEvents.filter((event) => event.eventType === "repo_traction");
      const importantFollowerEvents = personEvents.filter(
        (event) => event.eventType === "important_github_follower",
      );
      const bigTechExit = personEvents.some((event) => event.eventType === "big_tech_exit");

      const vcFollowCount = vcFollowEvents.length;
      const githubAttentionScore = repoTractionEvents.reduce((sum, event) => {
        const delta = Number(event.metadata.weekly_star_delta ?? 0);
        return sum + (Number.isFinite(delta) ? delta : 0);
      }, 0);
      const githubFollowerImportance = importanceScoreFromFollowers(importantFollowerEvents);
      const importantGithubFollowers = importantFollowerEvents.reduce((sum, event) => {
        const followerCount = Number(event.metadata.follower_count ?? 1);
        return sum + (Number.isFinite(followerCount) ? followerCount : 1);
      }, 0);

      const score =
        vcFollowCount * 30 +
        Math.min(githubAttentionScore, 600) / 4 +
        Math.min(githubFollowerImportance, 2400) / 8 +
        (bigTechExit ? 8 : 0);

      if (score <= 0) return null;

      const reasons: WeeklyPickReason[] = [];

      if (vcFollowCount > 0) {
        reasons.push({
          id: `reason-${person.id}-vc`,
          reasonKind: "vc_follow_burst",
          title:
            vcFollowCount >= 3
              ? `${vcFollowCount} VC follows this week`
              : `${vcFollowCount} VC follow${vcFollowCount === 1 ? "" : "s"} so far`,
          detail:
            vcFollowCount >= 3
              ? "Selected venture accounts converged on this person inside the same seven-day window."
              : "Investor attention is building, but the hard threshold has not been reached yet.",
          metricValue: vcFollowCount,
          displayOrder: 0,
          sourceEventId: vcFollowEvents[0]?.id ?? null,
        });
      }

      if (githubAttentionScore > 0) {
        reasons.push({
          id: `reason-${person.id}-repo`,
          reasonKind: "repo_traction",
          title: "GitHub traction accelerating",
          detail: "Repository momentum is compounding based on recent star growth and releases.",
          metricValue: githubAttentionScore,
          displayOrder: 1,
          sourceEventId: repoTractionEvents[0]?.id ?? null,
        });
      }

      if (importantGithubFollowers > 0) {
        reasons.push({
          id: `reason-${person.id}-important-followers`,
          reasonKind: "important_github_followers",
          title:
            importantGithubFollowers > 1
              ? `${importantGithubFollowers} important new GitHub followers`
              : "Important new GitHub follower",
          detail:
            "New followers with strong open-source reach were detected, increasing confidence that this person is breaking out.",
          metricValue: githubFollowerImportance,
          displayOrder: 2,
          sourceEventId: importantFollowerEvents[0]?.id ?? null,
        });
      }

      if (bigTechExit) {
        reasons.push({
          id: `reason-${person.id}-exit`,
          reasonKind: "big_tech_exit",
          title: "Recent big-tech exit",
          detail: "A recent operator-to-founder move adds conviction to the underlying attention signals.",
          metricValue: 1,
          displayOrder: 3,
          sourceEventId:
            personEvents.find((event) => event.eventType === "big_tech_exit")?.id ?? null,
        });
      }

      const primaryReason =
        vcFollowCount >= 3
          ? `${vcFollowCount} VC follows in 7 days`
          : importantGithubFollowers > 0
            ? "Important GitHub followers"
            : githubAttentionScore > 0
              ? "GitHub repo traction"
              : bigTechExit
                ? "Big tech exit"
                : "Emerging signal";

      return {
        id: `weekly-pick-${person.id}`,
        weekStart,
        rank: 0,
        score: Math.round(score),
        primaryReason,
        summary: [
          vcFollowCount > 0
            ? `${vcFollowCount} selected VC follow${vcFollowCount === 1 ? "" : "s"}`
            : null,
          githubAttentionScore > 0 ? `${githubAttentionScore} GitHub momentum points` : null,
          importantGithubFollowers > 0
            ? `${importantGithubFollowers} important GitHub follower${importantGithubFollowers === 1 ? "" : "s"}`
            : null,
          bigTechExit ? "recent big-tech exit" : null,
        ]
          .filter(Boolean)
          .join(", "),
        vcFollowCount,
        githubAttentionScore,
        bigTechExit,
        person,
        reasons,
      };
    })
    .filter((pick): pick is WeeklyPick => !!pick)
    .sort((a, b) => {
      if (b.vcFollowCount !== a.vcFollowCount) return b.vcFollowCount - a.vcFollowCount;
      return b.score - a.score;
    })
    .map((pick, index) => ({
      ...pick,
      rank: index + 1,
      reasons: pick.reasons.sort((a, b) => a.displayOrder - b.displayOrder),
    }));

  return picks;
}
