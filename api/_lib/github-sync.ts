import { env, requireEnv } from "./env";
import { supabaseAdmin } from "./supabase";
import { daysAgoIso, dateDaysAgo } from "./time";
import { upsertPersonFromIdentity, enqueueAvatarBackfill } from "./people";
import { recomputeWeeklyTopPicks } from "./aggregate";

type GithubSearchRepo = {
  full_name: string;
  name: string;
  html_url: string;
  stargazers_count: number;
  description: string | null;
  created_at: string;
  owner: {
    login: string;
    avatar_url: string | null;
    html_url: string;
  };
};

async function githubFetch<T>(path: string) {
  requireEnv("githubToken");

  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function searchTrendingRepos() {
  const sevenDaysAgo = dateDaysAgo(7);
  const query = new URLSearchParams({
    q: `pushed:>=${sevenDaysAgo}`,
    sort: "stars",
    order: "desc",
    per_page: String(Math.min(100, env.githubSearchResultLimit)),
  });

  const result = await githubFetch<{ items?: GithubSearchRepo[] }>(`/search/repositories?${query.toString()}`);
  return result.items ?? [];
}

async function getSevenDayStarDelta(repoFullName: string, currentStars: number, createdAt: string) {
  const { data, error } = await supabaseAdmin
    .from("github_repo_snapshots")
    .select("stargazer_count, observed_at")
    .eq("repo_full_name", repoFullName)
    .gte("observed_at", daysAgoIso(8))
    .order("observed_at", { ascending: true });

  if (error) throw error;

  if (!data || data.length === 0) {
    const repoCreatedRecently = Date.parse(createdAt) >= Date.parse(daysAgoIso(7));
    return repoCreatedRecently ? currentStars : 0;
  }

  return Math.max(0, currentStars - Number(data[0].stargazer_count ?? 0));
}

export async function fetchGithubAvatar(handle: string) {
  const user = await githubFetch<{ avatar_url?: string | null }>(`/users/${encodeURIComponent(handle)}`);
  return user.avatar_url ?? null;
}

export async function syncGithubSignals() {
  const repos = await searchTrendingRepos();
  let snapshotsCreated = 0;
  let githubSignalsCreated = 0;
  let highConfidenceSignals = 0;

  for (const repo of repos) {
    const delta = await getSevenDayStarDelta(repo.full_name, repo.stargazers_count, repo.created_at);

    const { error: snapshotError } = await supabaseAdmin.from("github_repo_snapshots").insert({
      owner_login: repo.owner.login,
      repo_name: repo.name,
      repo_full_name: repo.full_name,
      repo_url: repo.html_url,
      stargazer_count: repo.stargazers_count,
    });

    if (snapshotError) throw snapshotError;
    snapshotsCreated += 1;

    if (delta < env.githubViralStarDeltaThreshold) {
      continue;
    }

    const personId = await upsertPersonFromIdentity({
      platform: "github",
      handle: repo.owner.login,
      fullName: repo.owner.login,
      profileUrl: repo.owner.html_url,
      avatarUrl: repo.owner.avatar_url,
      bio: repo.description,
    });

    const windowStart = daysAgoIso(7);
    const { data: recentXSignals, error: crossRefError } = await supabaseAdmin
      .from("signals")
      .select("id, vc_id")
      .eq("person_id", personId)
      .eq("signal_type", "x_new_follow")
      .gte("detected_at", windowStart);

    if (crossRefError) throw crossRefError;

    const isHighConfidence = (recentXSignals ?? []).length > 0;
    const signalKey = `github:${repo.full_name}:${repo.stargazers_count}`;

    const { error: githubSignalError } = await supabaseAdmin.from("github_signals").upsert(
      {
        person_id: personId,
        repo_url: repo.html_url,
        repo_full_name: repo.full_name,
        owner_login: repo.owner.login,
        stars_count: repo.stargazers_count,
        stars_delta: delta,
        source_key: signalKey,
        metadata: {
          repo_name: repo.name,
          current_stars: repo.stargazers_count,
          high_confidence: isHighConfidence,
        },
      },
      { onConflict: "source_key", ignoreDuplicates: true },
    );

    if (githubSignalError) throw githubSignalError;

    const { error: genericSignalError } = await supabaseAdmin.from("signals").upsert(
      {
        person_id: personId,
        signal_type: "github_viral_repo",
        source_key: signalKey,
        metadata: {
          repo_full_name: repo.full_name,
          repo_url: repo.html_url,
          stars_delta: delta,
          high_confidence: isHighConfidence,
        },
      },
      { onConflict: "source_key", ignoreDuplicates: true },
    );

    if (genericSignalError) throw genericSignalError;

    if (isHighConfidence) {
      const { error: crossSignalError } = await supabaseAdmin.from("signals").upsert(
        {
          person_id: personId,
          signal_type: "high_confidence_crossref",
          source_key: `crossref:${personId}:${repo.full_name}:${repo.stargazers_count}`,
          metadata: {
            repo_full_name: repo.full_name,
            vc_count: recentXSignals?.length ?? 0,
          },
        },
        { onConflict: "source_key", ignoreDuplicates: true },
      );

      if (crossSignalError) throw crossSignalError;
      highConfidenceSignals += 1;
    }

    const { error: eventError } = await supabaseAdmin.from("activity_events").upsert(
      {
        person_id: personId,
        platform: "github",
        event_type: "repo_traction",
        headline: `${repo.full_name} is trending on GitHub`,
        description: `${repo.full_name} gained ${delta} stars in the last 7 days.`,
        source_url: repo.html_url,
        occurred_at: new Date().toISOString(),
        metadata: {
          repo_full_name: repo.full_name,
          stars: repo.stargazers_count,
          weekly_star_delta: delta,
          high_confidence: isHighConfidence,
        },
        event_fingerprint: `github-viral:${personId}:${repo.full_name}:${repo.stargazers_count}`,
      },
      { onConflict: "event_fingerprint", ignoreDuplicates: true },
    );

    if (eventError) throw eventError;

    await enqueueAvatarBackfill(personId);
    githubSignalsCreated += 1;
  }

  const topPicks = await recomputeWeeklyTopPicks();

  return {
    ok: true,
    searched: repos.length,
    snapshotsCreated,
    githubSignalsCreated,
    highConfidenceSignals,
    threshold: env.githubViralStarDeltaThreshold,
    topPicks,
  };
}
