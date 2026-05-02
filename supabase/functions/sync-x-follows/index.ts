import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type TwitterApiUser = {
  id?: string | number;
  userId?: string | number;
  rest_id?: string | number;
  name?: string;
  screen_name?: string;
  userName?: string;
  username?: string;
};

type ResolvedXUser = {
  id: string;
  name: string;
  username: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const twitterApiKey = Deno.env.get("TWITTERAPI_IO_KEY")!;
const followingsPageSize = Math.min(
  200,
  Math.max(20, Number(Deno.env.get("X_FOLLOWINGS_PAGE_SIZE") ?? "50")),
);
const maxPagesPerSync = Math.max(1, Number(Deno.env.get("X_MAX_FOLLOWING_PAGES_PER_SYNC") ?? "2"));
const maxVcsPerSync = Math.max(1, Number(Deno.env.get("X_MAX_VCS_PER_SYNC") ?? "8"));

const supabase = createClient(supabaseUrl, serviceRoleKey);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeTwitterHandle(value?: string | null) {
  return value?.replace(/^@/, "").trim().toLowerCase() ?? "";
}

function toResolvedXUser(raw: TwitterApiUser | null | undefined): ResolvedXUser | null {
  if (!raw) return null;

  const id = String(raw.id ?? raw.userId ?? raw.rest_id ?? "").trim();
  const username = normalizeTwitterHandle(raw.userName ?? raw.username ?? raw.screen_name ?? "");
  const name = (raw.name ?? username).trim();

  if (!id || !username) return null;
  return { id, username, name };
}

async function twitterApiFetch<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const response = await fetch(`https://api.twitterapi.io${path}?${query.toString()}`, {
    headers: { "x-api-key": twitterApiKey },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`twitterapi.io ${path} failed with ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

async function ensureXUserId(handle: string) {
  const normalized = normalizeTwitterHandle(handle);
  const payload = await twitterApiFetch<{ data?: TwitterApiUser }>(
    "/twitter/user/info",
    { userName: normalized },
  );

  const resolved = toResolvedXUser(payload.data);
  if (!resolved) {
    throw new Error(`Could not resolve X handle ${normalized}`);
  }

  return resolved;
}

async function fetchRecentFollowings(handle: string, knownIds: Set<string>, initialSync: boolean) {
  const recent: ResolvedXUser[] = [];
  let cursor = "";
  let page = 0;
  let sawKnownPage = false;

  while (page < maxPagesPerSync && !sawKnownPage) {
    const payload = await twitterApiFetch<{
      followings?: TwitterApiUser[];
      has_next_page?: boolean;
      next_cursor?: string;
    }>("/twitter/user/followings", {
      userName: normalizeTwitterHandle(handle),
      pageSize: String(followingsPageSize),
      ...(cursor ? { cursor } : {}),
    });

    const items = (payload.followings ?? [])
      .map(toResolvedXUser)
      .filter((entry): entry is ResolvedXUser => !!entry);

    if (items.length === 0) break;

    let newOnThisPage = 0;
    for (const item of items) {
      if (!knownIds.has(item.id)) {
        recent.push(item);
        newOnThisPage += 1;
      }
    }

    if (!initialSync && newOnThisPage === 0) {
      sawKnownPage = true;
      break;
    }

    if (!payload.has_next_page || !payload.next_cursor) break;
    cursor = payload.next_cursor;
    page += 1;
  }

  return recent;
}

async function ensureTrackedPerson(followed: ResolvedXUser) {
  const { data: existingIdentity } = await supabase
    .from("person_identities")
    .select("person_id")
    .eq("platform", "x")
    .eq("handle", followed.username)
    .maybeSingle();

  if (existingIdentity?.person_id) {
    return existingIdentity.person_id;
  }

  const slug = slugify(followed.username);
  const { data: insertedPerson, error: personError } = await supabase
    .from("tracked_people")
    .insert({
      slug,
      full_name: followed.name,
      role_title: "Imported from X follow graph",
      company: "",
      location: "",
      summary: `Imported after a selected VC followed @${followed.username} on X.`,
      top_pick_note: "",
      is_watchlist: true,
    })
    .select("id")
    .single();

  if (personError) throw personError;

  const { error: identityError } = await supabase.from("person_identities").insert({
    person_id: insertedPerson.id,
    platform: "x",
    handle: followed.username,
    profile_url: `https://x.com/${followed.username}`,
    is_primary: true,
  });

  if (identityError) throw identityError;
  return insertedPerson.id;
}

Deno.serve(async () => {
  try {
    const { data: watchlistItems, error: watchlistError } = await supabase
      .from("user_vc_watchlist_items")
      .select("vc_source_id");

    if (watchlistError) throw watchlistError;

    const selectedVcIds = Array.from(new Set((watchlistItems ?? []).map((item) => item.vc_source_id))).slice(
      0,
      maxVcsPerSync,
    );

    if (selectedVcIds.length === 0) {
      return json({ ok: true, synced: 0, createdEvents: 0, message: "No selected VCs found." });
    }

    const { data: vcSources, error: vcError } = await supabase
      .from("vc_sources")
      .select("*")
      .in("id", selectedVcIds)
      .not("x_handle", "is", null)
      .order("last_x_sync_at", { ascending: true, nullsFirst: true });

    if (vcError) throw vcError;

    let synced = 0;
    let createdEvents = 0;
    const skippedVcs: string[] = [];

    for (const vc of vcSources ?? []) {
      const handle = normalizeTwitterHandle(vc.x_handle);
      if (!handle) {
        skippedVcs.push(vc.name);
        continue;
      }

      try {
        const resolvedUser = vc.x_user_id
          ? { id: vc.x_user_id, name: vc.name, username: handle }
          : await ensureXUserId(handle);

        if (!vc.x_user_id || vc.x_user_id !== resolvedUser.id) {
          await supabase
            .from("vc_sources")
            .update({ x_user_id: resolvedUser.id, sync_status: "pending", last_sync_error: null })
            .eq("id", vc.id);
        }

        const { data: observations, error: observationError } = await supabase
          .from("vc_x_follow_observations")
          .select("followed_x_user_id")
          .eq("vc_source_id", vc.id);

        if (observationError) throw observationError;

        const knownIds = new Set((observations ?? []).map((row) => String(row.followed_x_user_id)));
        const isInitialSync = !vc.last_x_sync_at;
        const newFollowings = await fetchRecentFollowings(handle, knownIds, isInitialSync);

        for (const followed of newFollowings) {
          const personId = await ensureTrackedPerson(followed);

          await supabase.from("vc_x_follow_observations").upsert(
            {
              vc_source_id: vc.id,
              followed_x_user_id: followed.id,
              followed_handle: followed.username,
              followed_name: followed.name,
              person_id: personId,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "vc_source_id,followed_x_user_id" },
          );

          if (!isInitialSync) {
            const eventFingerprint = `x-follow:${vc.id}:${followed.id}`;
            const { data: existingEvent } = await supabase
              .from("activity_events")
              .select("id")
              .eq("event_fingerprint", eventFingerprint)
              .maybeSingle();

            if (!existingEvent) {
              const { error: eventError } = await supabase.from("activity_events").insert({
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
                event_fingerprint: eventFingerprint,
              });

              if (eventError) throw eventError;
              createdEvents += 1;
            }
          }
        }

        await supabase
          .from("vc_sources")
          .update({
            x_user_id: resolvedUser.id,
            sync_status: "ok",
            last_x_sync_at: new Date().toISOString(),
            last_sync_error: null,
          })
          .eq("id", vc.id);

        synced += 1;
      } catch (error) {
        await supabase
          .from("vc_sources")
          .update({
            sync_status: "error",
            last_sync_error: error instanceof Error ? error.message : String(error),
          })
          .eq("id", vc.id);
        skippedVcs.push(vc.name);
      }
    }

    return json({
      ok: true,
      synced,
      createdEvents,
      skippedVcs,
      limits: {
        followingsPageSize,
        maxPagesPerSync,
        maxVcsPerSync,
      },
    });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
