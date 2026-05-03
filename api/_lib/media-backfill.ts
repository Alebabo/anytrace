import { supabaseAdmin } from "./supabase.js";
import { fetchXProfile } from "./x-sync.js";
import { fetchGithubAvatar } from "./github-sync.js";

export async function processMediaBackfill(limit = 20) {
  const { data: jobs, error } = await supabaseAdmin
    .from("person_media_backfill_jobs")
    .select("id, person_id, attempts")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let completed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    try {
      await supabaseAdmin
        .from("person_media_backfill_jobs")
        .update({
          status: "processing",
          attempts: Number(job.attempts ?? 0) + 1,
          last_error: null,
        })
        .eq("id", job.id);

      const { data: identities, error: identityError } = await supabaseAdmin
        .from("person_identities")
        .select("platform, handle")
        .eq("person_id", job.person_id);

      if (identityError) throw identityError;

      const xHandle = identities?.find((item) => item.platform === "x")?.handle ?? null;
      const githubHandle = identities?.find((item) => item.platform === "github")?.handle ?? null;

      const xProfile = xHandle ? await fetchXProfile(xHandle) : null;
      const githubAvatar = githubHandle ? await fetchGithubAvatar(githubHandle) : null;
      const avatarUrl = xProfile?.avatarUrl ?? githubAvatar ?? null;

      if (avatarUrl) {
        const { error: updateError } = await supabaseAdmin
          .from("tracked_people")
          .update({ avatar_url: avatarUrl })
          .eq("id", job.person_id);

        if (updateError) throw updateError;
      }

      await supabaseAdmin
        .from("person_media_backfill_jobs")
        .update({
          status: "done",
          last_error: null,
        })
        .eq("id", job.id);

      completed += 1;
    } catch (jobError) {
      await supabaseAdmin
        .from("person_media_backfill_jobs")
        .update({
          status: "failed",
          last_error: jobError instanceof Error ? jobError.message : String(jobError),
        })
        .eq("id", job.id);
      failed += 1;
    }
  }

  return {
    ok: true,
    processed: (jobs ?? []).length,
    completed,
    failed,
  };
}
