import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const githubToken = Deno.env.get("GITHUB_TOKEN")!;
const importanceThreshold = Number(Deno.env.get("GITHUB_IMPORTANCE_THRESHOLD") ?? "700");
const starDeltaThreshold = Number(Deno.env.get("GITHUB_STAR_DELTA_THRESHOLD") ?? "25");

const supabase = createClient(supabaseUrl, serviceRoleKey);

type GithubFollower = {
  id: number;
  login: string;
  html_url: string;
};

type GithubRepo = {
  full_name: string;
  name: string;
  html_url: string;
  stargazers_count: number;
};

type GithubUser = {
  followers: number;
  public_repos: number;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function ghFetch<T>(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchAllFollowers(username: string) {
  const followers: GithubFollower[] = [];
  let page = 1;
  while (true) {
    const batch = await ghFetch<GithubFollower[]>(
      `/users/${encodeURIComponent(username)}/followers?per_page=100&page=${page}`,
    );
    followers.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return followers;
}

async function fetchRepos(username: string) {
  return await ghFetch<GithubRepo[]>(
    `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
  );
}

async function computeImportance(login: string) {
  const [profile, repos] = await Promise.all([
    ghFetch<GithubUser>(`/users/${encodeURIComponent(login)}`),
    fetchRepos(login),
  ]);

  const repoStars = repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 8)
    .reduce((sum, repo) => sum + repo.stargazers_count, 0);

  return repoStars + profile.followers * 2 + profile.public_repos * 5;
}

Deno.serve(async () => {
  try {
    const { data: identities, error: identitiesError } = await supabase
      .from("person_identities")
      .select("person_id, handle")
      .eq("platform", "github");

    if (identitiesError) throw identitiesError;

    let repoEvents = 0;
    let followerEvents = 0;

    for (const identity of identities ?? []) {
      const username = identity.handle;
      const personId = identity.person_id;

      const [repos, followers] = await Promise.all([
        fetchRepos(username),
        fetchAllFollowers(username),
      ]);

      const { data: existingRepoObs } = await supabase
        .from("github_repo_observations")
        .select("*")
        .eq("person_id", personId);
      const { data: existingFollowerObs } = await supabase
        .from("person_github_follower_observations")
        .select("*")
        .eq("person_id", personId);

      const repoMap = new Map((existingRepoObs ?? []).map((row) => [row.repo_full_name, row]));
      const followerMap = new Map((existingFollowerObs ?? []).map((row) => [row.follower_login, row]));

      const initialRepoSync = repoMap.size === 0;
      const initialFollowerSync = followerMap.size === 0;

      for (const repo of repos) {
        const existing = repoMap.get(repo.full_name);
        if (!existing) {
          await supabase.from("github_repo_observations").insert({
            person_id: personId,
            repo_full_name: repo.full_name,
            repo_name: repo.name,
            repo_url: repo.html_url,
            stargazer_count: repo.stargazers_count,
            release_count: 0,
          });
          continue;
        }

        const delta = repo.stargazers_count - existing.stargazer_count;
        await supabase
          .from("github_repo_observations")
          .update({
            repo_url: repo.html_url,
            stargazer_count: repo.stargazers_count,
            observed_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (!initialRepoSync && delta >= starDeltaThreshold) {
          const fingerprint = `github-traction:${personId}:${repo.full_name}:${repo.stargazers_count}`;
          const { data: existingEvent } = await supabase
            .from("activity_events")
            .select("id")
            .eq("event_fingerprint", fingerprint)
            .maybeSingle();

          if (!existingEvent) {
            const { error } = await supabase.from("activity_events").insert({
              person_id: personId,
              platform: "github",
              event_type: "repo_traction",
              headline: `${repo.full_name} accelerated on GitHub`,
              description: `${repo.full_name} added ${delta} stars since the last sync.`,
              source_url: repo.html_url,
              occurred_at: new Date().toISOString(),
              metadata: {
                repo_full_name: repo.full_name,
                stars: repo.stargazers_count,
                weekly_star_delta: delta,
              },
              event_fingerprint: fingerprint,
            });
            if (error) throw error;
            repoEvents += 1;
          }
        }
      }

      for (const follower of followers) {
        const existing = followerMap.get(follower.login);
        if (existing) {
          await supabase
            .from("person_github_follower_observations")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id);
          continue;
        }

        const importanceScore = await computeImportance(follower.login);
        await supabase.from("person_github_follower_observations").insert({
          person_id: personId,
          follower_login: follower.login,
          follower_github_id: follower.id,
          importance_score: importanceScore,
        });

        if (!initialFollowerSync && importanceScore >= importanceThreshold) {
          const fingerprint = `github-important-follower:${personId}:${follower.login}`;
          const { data: existingEvent } = await supabase
            .from("activity_events")
            .select("id")
            .eq("event_fingerprint", fingerprint)
            .maybeSingle();

          if (!existingEvent) {
            const { error } = await supabase.from("activity_events").insert({
              person_id: personId,
              platform: "github",
              event_type: "important_github_follower",
              headline: `${follower.login} followed this person on GitHub`,
              description: "A new follower with meaningful open-source reach was detected.",
              source_url: follower.html_url,
              occurred_at: new Date().toISOString(),
              metadata: {
                follower_login: follower.login,
                follower_count: 1,
                importance_score: importanceScore,
              },
              event_fingerprint: fingerprint,
            });
            if (error) throw error;
            followerEvents += 1;
          }
        }
      }
    }

    const now = new Date().toISOString();
    await supabase
      .from("vc_sources")
      .update({
        last_github_sync_at: now,
        sync_status: "ok",
        last_sync_error: null,
      })
      .not("github_username", "is", null);

    return json({ ok: true, repoEvents, followerEvents });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
