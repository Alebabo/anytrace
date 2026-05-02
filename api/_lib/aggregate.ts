import { supabaseAdmin } from "./supabase";
import { daysAgoIso, isoWeekStart } from "./time";

export async function recomputeWeeklyTopPicks() {
  const windowStart = daysAgoIso(7);
  const weekStart = isoWeekStart();

  const [{ data: xSignals, error: xError }, { data: githubSignals, error: ghError }, { data: linkedinEvents, error: linkedinError }] =
    await Promise.all([
      supabaseAdmin
        .from("signals")
        .select("id, person_id, vc_id, signal_type, metadata")
        .eq("signal_type", "x_new_follow")
        .gte("detected_at", windowStart),
      supabaseAdmin
        .from("github_signals")
        .select("id, person_id, repo_url, repo_full_name, stars_delta, metadata")
        .gte("detected_at", windowStart),
      supabaseAdmin
        .from("activity_events")
        .select("id, person_id, headline")
        .eq("platform", "linkedin")
        .eq("event_type", "mention")
        .gte("occurred_at", windowStart),
    ]);

  if (xError) throw xError;
  if (ghError) throw ghError;
  if (linkedinError) throw linkedinError;

  const scoreMap = new Map<string, any>();
  const takeBucket = (personId: string) => {
    const existing = scoreMap.get(personId);
    if (existing) return existing;
    const next = {
      person_id: personId,
      vcIds: new Set<string>(),
      githubSignals: [] as any[],
      linkedinMentions: [] as any[],
      signalIds: [] as string[],
      highConfidence: false,
    };
    scoreMap.set(personId, next);
    return next;
  };

  for (const signal of xSignals ?? []) {
    const bucket = takeBucket(signal.person_id);
    if (signal.vc_id) bucket.vcIds.add(signal.vc_id);
    bucket.signalIds.push(signal.id);
    if (signal.metadata?.high_confidence === true) bucket.highConfidence = true;
  }

  for (const signal of githubSignals ?? []) {
    const bucket = takeBucket(signal.person_id);
    bucket.githubSignals.push(signal);
    bucket.signalIds.push(signal.id);
    if (signal.metadata?.high_confidence === true) bucket.highConfidence = true;
  }

  for (const event of linkedinEvents ?? []) {
    const bucket = takeBucket(event.person_id);
    bucket.linkedinMentions.push(event);
    bucket.signalIds.push(event.id);
  }

  const ranked = Array.from(scoreMap.values())
    .map((bucket) => {
      const vcFollowCount = bucket.vcIds.size;
      const hasViralRepo = bucket.githubSignals.length > 0;
      const linkedinMentionCount = bucket.linkedinMentions.length;
      return {
        person_id: bucket.person_id,
        vc_follow_count: vcFollowCount,
        has_viral_repo: hasViralRepo,
        linkedin_mention_count: linkedinMentionCount,
        score: vcFollowCount * 3 + (hasViralRepo ? 2 : 0) + (linkedinMentionCount > 0 ? 1 : 0),
        evidence: {
          signal_ids: bucket.signalIds,
          github_repos: bucket.githubSignals.map((signal: any) => ({
            repo_url: signal.repo_url,
            repo_full_name: signal.repo_full_name,
            stars_delta: signal.stars_delta,
          })),
          high_confidence: bucket.highConfidence,
        },
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.vc_follow_count !== a.vc_follow_count) return b.vc_follow_count - a.vc_follow_count;
      return Number(b.has_viral_repo) - Number(a.has_viral_repo);
    })
    .slice(0, 10)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const { error: deleteError } = await supabaseAdmin.from("top_picks").delete().eq("week_start", weekStart);
  if (deleteError) throw deleteError;

  if (ranked.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("top_picks").insert(
      ranked.map((item) => ({
        person_id: item.person_id,
        week_start: weekStart,
        rank: item.rank,
        score: item.score,
        vc_follow_count: item.vc_follow_count,
        has_viral_repo: item.has_viral_repo,
        linkedin_mention_count: item.linkedin_mention_count,
        evidence: item.evidence,
      })),
    );
    if (insertError) throw insertError;
  }

  return {
    weekStart,
    created: ranked.length,
    topPicks: ranked,
  };
}
