import { env, requireEnv } from "./env";
import { supabaseAdmin } from "./supabase";
import { upsertPersonFromIdentity, enqueueAvatarBackfill } from "./people";
import { recomputeWeeklyTopPicks } from "./aggregate";

type TwitterApiUser = {
  id?: string | number;
  userId?: string | number;
  rest_id?: string | number;
  name?: string;
  screen_name?: string;
  userName?: string;
  username?: string;
  profile_picture?: string;
  profilePicture?: string;
  profile_image_url_https?: string;
};

type ResolvedXUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
};

let lastTwitterRequestAt = 0;

function normalizeHandle(value?: string | null) {
  return value?.replace(/^@/, "").trim().toLowerCase() ?? "";
}

function toResolvedXUser(raw: TwitterApiUser | null | undefined): ResolvedXUser | null {
  if (!raw) return null;

  const id = String(raw.id ?? raw.userId ?? raw.rest_id ?? "").trim();
  const username = normalizeHandle(raw.userName ?? raw.username ?? raw.screen_name ?? "");
  const name = (raw.name ?? username).trim();
  const avatarUrl =
    raw.profilePicture ?? raw.profile_picture ?? raw.profile_image_url_https ?? null;

  if (!id || !username) return null;
  return { id, username, name, avatarUrl };
}

async function twitterFetch<T>(path: string, params: Record<string, string>) {
  requireEnv("twitterApiKey");

  const elapsed = Date.now() - lastTwitterRequestAt;
  if (elapsed < env.xMinIntervalMs) {
    await new Promise((resolve) => setTimeout(resolve, env.xMinIntervalMs - elapsed));
  }

  const query = new URLSearchParams(params);
  const response = await fetch(`https://api.twitterapi.io${path}?${query.toString()}`, {
    headers: { "x-api-key": env.twitterApiKey },
  });
  lastTwitterRequestAt = Date.now();

  if (!response.ok) {
    throw new Error(`twitterapi.io ${path} failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function fetchXProfile(handle: string) {
  const payload = await twitterFetch<{ data?: TwitterApiUser }>("/twitter/user/info", {
    userName: normalizeHandle(handle),
  });
  return toResolvedXUser(payload.data);
}

async function fetchCurrentFollowings(handle: string) {
  const followings: ResolvedXUser[] = [];
  let cursor = "";
  let page = 0;

  while (page < env.xMaxPagesPerSync) {
    const payload = await twitterFetch<{
      followings?: TwitterApiUser[];
      has_next_page?: boolean;
      next_cursor?: string;
    }>("/twitter/user/followings", {
      userName: normalizeHandle(handle),
      pageSize: String(env.xFollowingPageSize),
      ...(cursor ? { cursor } : {}),
    });

    const items = (payload.followings ?? [])
      .map(toResolvedXUser)
      .filter((item): item is ResolvedXUser => !!item);

    followings.push(...items);

    if (!payload.has_next_page || !payload.next_cursor) {
      break;
    }

    cursor = payload.next_cursor;
    page += 1;
  }

  return followings;
}

export async function syncXSignals() {
  const { data: vcs, error: vcError } = await supabaseAdmin
    .from("vc_sources")
    .select("id, name, x_handle, x_user_id")
    .not("x_handle", "is", null)
    .order("last_x_sync_at", { ascending: true, nullsFirst: true })
    .limit(env.xMaxVcsPerSync);

  if (vcError) throw vcError;

  let snapshotsCreated = 0;
  let signalsCreated = 0;
  const syncedHandles: string[] = [];
  const skipped: Array<{ handle: string; reason: string }> = [];

  for (const vc of vcs ?? []) {
    const handle = normalizeHandle(vc.x_handle);
    if (!handle) continue;

    try {
      const profile = await fetchXProfile(handle);
      const followings = await fetchCurrentFollowings(handle);
      const followingIds = Array.from(new Set(followings.map((item) => item.id)));

      const { data: previousSnapshot, error: previousError } = await supabaseAdmin
        .from("x_snapshots")
        .select("id, following_ids")
        .eq("vc_source_id", vc.id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousError) throw previousError;

      const previousIds = new Set<string>(
        Array.isArray(previousSnapshot?.following_ids)
          ? previousSnapshot.following_ids.map((id: unknown) => String(id))
          : [],
      );

      const { error: snapshotError } = await supabaseAdmin.from("x_snapshots").insert({
        vc_source_id: vc.id,
        vc_handle: handle,
        twitter_id: profile?.id ?? vc.x_user_id,
        following_ids: followingIds,
      });

      if (snapshotError) throw snapshotError;
      snapshotsCreated += 1;

      const newFollowings = previousSnapshot
        ? followings.filter((item) => !previousIds.has(item.id))
        : [];

      for (const followed of newFollowings) {
        const personId = await upsertPersonFromIdentity({
          platform: "x",
          handle: followed.username,
          fullName: followed.name,
          profileUrl: `https://x.com/${followed.username}`,
          avatarUrl: followed.avatarUrl,
        });

        const sourceKey = `x:${vc.id}:${followed.id}`;
        const { error: signalError } = await supabaseAdmin.from("signals").upsert(
          {
            person_id: personId,
            vc_id: vc.id,
            signal_type: "x_new_follow",
            source_key: sourceKey,
            metadata: {
              vc_handle: handle,
              followed_handle: followed.username,
              followed_x_user_id: followed.id,
              source: "twitterapi.io",
            },
          },
          { onConflict: "source_key", ignoreDuplicates: true },
        );

        if (signalError) throw signalError;

        const { error: eventError } = await supabaseAdmin.from("activity_events").upsert(
          {
            person_id: personId,
            vc_source_id: vc.id,
            platform: "x",
            event_type: "vc_follow",
            headline: `${vc.name} followed ${followed.name} on X`,
            description: `${vc.name} newly followed @${followed.username}.`,
            source_url: `https://x.com/${followed.username}`,
            occurred_at: new Date().toISOString(),
            metadata: {
              followed_handle: followed.username,
              followed_x_user_id: followed.id,
              vc_handle: handle,
              source: "twitterapi.io",
            },
            event_fingerprint: `x-follow:${vc.id}:${followed.id}`,
          },
          { onConflict: "event_fingerprint", ignoreDuplicates: true },
        );

        if (eventError) throw eventError;

        await enqueueAvatarBackfill(personId);
        signalsCreated += 1;
      }

      await supabaseAdmin
        .from("vc_sources")
        .update({
          x_user_id: profile?.id ?? vc.x_user_id,
          sync_status: "ok",
          last_x_sync_at: new Date().toISOString(),
          last_sync_error: null,
        })
        .eq("id", vc.id);

      syncedHandles.push(handle);
    } catch (error) {
      await supabaseAdmin
        .from("vc_sources")
        .update({
          sync_status: "error",
          last_sync_error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", vc.id);

      skipped.push({
        handle,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const topPicks = await recomputeWeeklyTopPicks();

  return {
    ok: true,
    synced: syncedHandles.length,
    syncedHandles,
    snapshotsCreated,
    signalsCreated,
    skipped,
    topPicks,
  };
}
