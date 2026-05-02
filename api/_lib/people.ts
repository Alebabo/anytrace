import { supabaseAdmin } from "./supabase";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeHandle(value: string) {
  return value.replace(/^@/, "").trim();
}

async function insertIdentity(personId: string, platform: "x" | "github", handle: string, profileUrl: string) {
  const { error } = await supabaseAdmin.from("person_identities").upsert(
    {
      person_id: personId,
      platform,
      handle,
      profile_url: profileUrl,
      is_primary: true,
    },
    { onConflict: "person_id,platform,handle" },
  );

  if (error) throw error;
}

export async function upsertPersonFromIdentity(input: {
  platform: "x" | "github";
  handle: string;
  fullName?: string | null;
  profileUrl: string;
  avatarUrl?: string | null;
  bio?: string | null;
}) {
  const handle = normalizeHandle(input.handle);

  const { data: existingIdentity, error: identityError } = await supabaseAdmin
    .from("person_identities")
    .select("person_id")
    .eq("platform", input.platform)
    .eq("handle", handle)
    .maybeSingle();

  if (identityError) throw identityError;

  if (existingIdentity?.person_id) {
    const updates: Record<string, unknown> = {};
    if (input.avatarUrl) updates.avatar_url = input.avatarUrl;
    if (input.fullName) updates.full_name = input.fullName;
    if (input.bio) updates.summary = input.bio;

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("tracked_people").update(updates).eq("id", existingIdentity.person_id);
    }

    return existingIdentity.person_id;
  }

  const fallbackName = input.fullName?.trim() || handle;
  const slug = slugify(handle);
  const { data: person, error: personError } = await supabaseAdmin
    .from("tracked_people")
    .insert({
      slug: `${slug}-${input.platform}`,
      full_name: fallbackName,
      role_title: input.platform === "x" ? "Imported from VC X follow graph" : "Imported from viral GitHub repo",
      company: "",
      location: "",
      summary: input.bio?.trim() || `Imported from ${input.platform === "x" ? "X" : "GitHub"} sync.`,
      avatar_url: input.avatarUrl ?? null,
      top_pick_note: "",
      is_watchlist: true,
    })
    .select("id")
    .single();

  if (personError) throw personError;

  await insertIdentity(person.id, input.platform, handle, input.profileUrl);
  return person.id;
}

export async function enqueueAvatarBackfill(personId: string) {
  const { error } = await supabaseAdmin.from("person_media_backfill_jobs").upsert(
    {
      person_id: personId,
      status: "pending",
      last_error: null,
    },
    { onConflict: "person_id,status", ignoreDuplicates: true },
  );

  if (error && !String(error.message).includes("duplicate key")) {
    throw error;
  }
}
