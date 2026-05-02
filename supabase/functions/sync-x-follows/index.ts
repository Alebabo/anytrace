import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type XUser = {
  id: string;
  name: string;
  username: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const xBearerToken = Deno.env.get("X_BEARER_TOKEN")!;

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

async function xFetch<T>(path: string) {
  const response = await fetch(`https://api.x.com${path}`, {
    headers: { Authorization: `Bearer ${xBearerToken}` },
  });
  if (!response.ok) {
    throw new Error(`X API ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function ensureXUserId(handle: string) {
  const normalized = handle.replace(/^@/, "");
  const payload = await xFetch<{ data?: XUser }>(
    `/2/users/by/username/${encodeURIComponent(normalized)}?user.fields=id,name,username`,
  );
  if (!payload.data) {
    throw new Error(`Could not resolve X handle ${normalized}`);
  }
  return payload.data;
}

async function fetchFollowing(xUserId: string) {
  const following: XUser[] = [];
  let nextToken: string | null = null;

  do {
    const query = new URLSearchParams({
      max_results: "100",
      "user.fields": "id,name,username",
    });
    if (nextToken) query.set("pagination_token", nextToken);

    const payload = await xFetch<{
      data?: XUser[];
      meta?: { next_token?: string };
    }>(`/2/users/${xUserId}/following?${query.toString()}`);

    following.push(...(payload.data ?? []));
    nextToken = payload.meta?.next_token ?? null;
  } while (nextToken);

  return following;
}

async function ensureTrackedPerson(followed: XUser) {
  const { data: existingIdentity } = await supabase
    .from("person_identities")
    .select("person_id")
    .eq("platform", "x")
    .eq("handle", followed.username.toLowerCase())
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
    handle: followed.username.toLowerCase(),
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

    const selectedVcIds = Array.from(new Set((watchlistItems ?? []).map((item) => item.vc_source_id)));
    if (selectedVcIds.length === 0) {
      return json({ ok: true, synced: 0, createdEvents: 0, message: "No selected VCs found." });
    }

    const { data: vcSources, error: vcError } = await supabase
      .from("vc_sources")
      .select("*")
      .in("id", selectedVcIds);

    if (vcError) throw vcError;

    let synced = 0;
    let createdEvents = 0;

    for (const vc of vcSources ?? []) {
      if (!vc.x_handle) continue;

      const resolvedUser = vc.x_user_id
        ? { id: vc.x_user_id, name: vc.name, username: vc.x_handle }
        : await ensureXUserId(vc.x_handle);

      if (!vc.x_user_id || vc.x_user_id !== resolvedUser.id) {
        await supabase
          .from("vc_sources")
          .update({ x_user_id: resolvedUser.id, sync_status: "pending", last_sync_error: null })
          .eq("id", vc.id);
      }

      const following = await fetchFollowing(resolvedUser.id);
      const { data: observations } = await supabase
        .from("vc_x_follow_observations")
        .select("followed_x_user_id")
        .eq("vc_source_id", vc.id);

      const knownIds = new Set((observations ?? []).map((row) => row.followed_x_user_id));
      const isInitialSync = !vc.last_x_sync_at;

      for (const followed of following) {
        const personId = await ensureTrackedPerson(followed);

        if (knownIds.has(followed.id)) {
          await supabase
            .from("vc_x_follow_observations")
            .update({
              followed_handle: followed.username.toLowerCase(),
              followed_name: followed.name,
              person_id: personId,
              last_seen_at: new Date().toISOString(),
            })
            .eq("vc_source_id", vc.id)
            .eq("followed_x_user_id", followed.id);
          continue;
        }

        await supabase.from("vc_x_follow_observations").insert({
          vc_source_id: vc.id,
          followed_x_user_id: followed.id,
          followed_handle: followed.username.toLowerCase(),
          followed_name: followed.name,
          person_id: personId,
        });

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
              description: `${vc.firm} entered ${followed.name}'s X graph.`,
              source_url: `https://x.com/${followed.username}`,
              occurred_at: new Date().toISOString(),
              metadata: {
                followed_handle: followed.username.toLowerCase(),
                followed_x_user_id: followed.id,
                vc_handle: vc.x_handle,
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
    }

    return json({ ok: true, synced, createdEvents });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
