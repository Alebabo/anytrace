import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Github,
  Loader2,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Twitter,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDossier } from "@/hooks/useApi";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { formatRelative } from "@/lib/format";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type {
  DossierClassification,
  DossierStatus,
  FeedbackSubmission,
  DossierOwnedRepo,
} from "@/data/types";

function classificationStyle(c: DossierClassification): string {
  switch (c) {
    case "founder":
      return "bg-[hsl(152_70%_92%)] text-[hsl(152_75%_25%)] border-[hsl(152_55%_70%)]";
    case "investor":
      return "bg-[hsl(212_85%_94%)] text-[hsl(212_75%_32%)] border-[hsl(212_65%_75%)]";
    case "operator":
      return "bg-[hsl(270_70%_94%)] text-[hsl(270_55%_38%)] border-[hsl(270_55%_75%)]";
    case "not_relevant":
      return "bg-[hsl(8_85%_94%)] text-[hsl(8_75%_38%)] border-[hsl(8_70%_75%)]";
    case "unclear":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusStyle(s: DossierStatus): string {
  switch (s) {
    case "ready_to_send":
      return "bg-[hsl(152_70%_92%)] text-[hsl(152_75%_25%)]";
    case "sent":
      return "bg-[hsl(212_85%_94%)] text-[hsl(212_75%_32%)]";
    case "rejected":
    case "failed":
      return "bg-[hsl(8_85%_94%)] text-[hsl(8_75%_38%)]";
    case "draft":
    default:
      return "bg-muted text-muted-foreground";
  }
}

function pickFeaturedRepo(repos: DossierOwnedRepo[]): DossierOwnedRepo | null {
  if (!repos.length) return null;
  return [...repos].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))[0];
}

/** Deterministic, decorative sparkline based on the repo name + stars.
 *  No real growth data exists yet; this is a "proof of capability" visual cue.
 */
function RepoSparkline({ seed, stars }: { seed: string; stars: number }) {
  const points = 24;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const data: number[] = [];
  let v = 0.15 + rand() * 0.1;
  for (let i = 0; i < points; i++) {
    const growth = 0.02 + rand() * 0.06;
    v = Math.min(1, v + growth);
    data.push(v);
  }
  // ensure last point is highest
  data[data.length - 1] = 1;
  const w = 160;
  const hgt = 36;
  const stepX = w / (points - 1);
  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(hgt - d * (hgt - 4) - 2).toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${w} ${hgt} L 0 ${hgt} Z`;
  return (
    <svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} className="overflow-visible" aria-label={`Trend for ${stars} stars`}>
      <path d={area} fill="hsl(var(--success) / 0.12)" />
      <path d={path} fill="none" stroke="hsl(var(--success))" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Dossier() {
  const { dossierId } = useParams();
  const dossierQuery = useDossier(dossierId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const undoMutation = useMutation({
    mutationFn: () =>
      api.submitDossierFeedback(dossierId!, { verdict: "correct" }),
    onSuccess: () => {
      toast({ title: "Endorsement recorded" });
      qc.invalidateQueries({ queryKey: ["dossier", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossier-feedback", dossierId] });
    },
    onError: (err: Error) =>
      toast({
        title: "Couldn't undo",
        description: err.message,
        variant: "destructive",
      }),
  });
  const feedbackMutation = useMutation({
    mutationFn: (body: FeedbackSubmission) =>
      api.submitDossierFeedback(dossierId!, body),
    onSuccess: (res) => {
      const rejected = res.new_dossier_status === "rejected";
      toast({
        title: rejected ? "Marked as wrong, dossier rejected" : "Feedback recorded ✓",
      });
      qc.invalidateQueries({ queryKey: ["dossier", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossier-feedback", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
    },
    onError: (err: Error) =>
      toast({
        title: "Couldn't submit feedback",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (dossierQuery.isLoading) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-5xl mx-auto space-y-4 animate-fade-in">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (dossierQuery.isError || !dossierQuery.data) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-muted-foreground">
          {dossierQuery.isError ? "Couldn't load dossier." : "Dossier not found."}
        </p>
        {dossierQuery.isError && (
          <Button size="sm" className="mt-3" onClick={() => dossierQuery.refetch()}>
            Retry
          </Button>
        )}
        <Link to="/" className="text-accent-indigo text-sm mt-3 inline-block">
          ← Back to feed
        </Link>
      </div>
    );
  }

  const d = dossierQuery.data;
  const eb = d.evidence_bundle;
  const conv = eb?.convergence_evidence ?? null;
  const confidencePct = Math.round((d.confidence ?? 0) * 100);
  const isRejected = d.status === "rejected";
  const featuredRepo = eb ? pickFeaturedRepo(eb.owned_repos) : null;
  const otherRepos = eb && featuredRepo
    ? eb.owned_repos.filter((r) => r.full_name !== featuredRepo.full_name)
    : [];
  const networkSignals = eb?.cross_platform_followers ?? [];
  const topNetworkSignal = networkSignals[0]?.display_name ?? null;

  return (
    <div className="px-4 md:px-8 py-10 max-w-4xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to feed
      </Link>

      {isRejected && (
        <Card className="mb-6 p-4 rounded-2xl border-[hsl(38_75%_72%)] bg-[hsl(38_90%_96%)] flex items-start gap-3">
          <div className="flex-1 text-xs text-[hsl(28_80%_28%)] leading-relaxed">
            <span className="font-medium">
              You marked this dossier as wrong / spam.
            </span>{" "}
            It's been removed from your active inbox.
            {d.rejected_at && (
              <span className="text-[hsl(28_70%_40%)]">
                {" "}
                Rejected {formatRelative(d.rejected_at)}.
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={undoMutation.isPending}
            onClick={() => undoMutation.mutate()}
            className="shrink-0"
          >
            {undoMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : null}
            Undo
          </Button>
        </Card>
      )}

      {/* ============== 1. IDENTITY HEADER ============== */}
      <section className="mb-8">
        <div className="flex items-start gap-5 flex-wrap">
          <EntityAvatar
            githubUsername={eb?.github_profile?.handle}
            name={d.target_name}
            size={88}
            rounded="full"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-serif text-4xl md:text-5xl leading-[1.05] tracking-tight">
                {d.target_name}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${classificationStyle(
                  d.classification
                )}`}
              >
                {d.classification.replace("_", " ")}
              </span>
              {d.status !== "draft" && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusStyle(
                    d.status
                  )}`}
                >
                  {d.status.replace("_", " ")}
                </span>
              )}
            </div>

            {/* Score line */}
            <div className="flex items-center gap-x-2 gap-y-1 mt-2 text-sm flex-wrap">
              {conv && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Score</span>
                  <span className="font-serif text-2xl leading-none tabular-nums text-foreground">
                    {conv.score.toFixed(2)}
                  </span>
                </span>
              )}
              {conv && <span className="text-muted-foreground/50">·</span>}
              <span className="inline-flex items-center gap-1 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="tabular-nums">{confidencePct}% confidence</span>
              </span>
            </div>

            {/* Sub-line: anchor + signals */}
            <div className="flex items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted-foreground flex-wrap">
              {eb?.github_profile && (
                <span className="inline-flex items-center gap-1">
                  <Github className="h-3 w-3" />
                  GitHub-anchored
                </span>
              )}
              {eb?.github_profile && networkSignals.length > 0 && <span>·</span>}
              {networkSignals.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {networkSignals.length} network signal{networkSignals.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {/* Handles */}
            {(eb?.github_profile || eb?.twitter_profile) && (
              <div className="flex items-center gap-4 mt-3 flex-wrap text-xs">
                {eb?.github_profile && (
                  <a
                    href={eb.github_profile.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-foreground hover:text-accent-indigo transition-colors"
                  >
                    <Github className="h-3.5 w-3.5" />
                    <span className="font-medium">@{eb.github_profile.handle}</span>
                    <span className="text-muted-foreground tabular-nums">
                      · {eb.github_profile.followers ?? 0} followers · {eb.github_profile.public_repos ?? 0} repos
                    </span>
                  </a>
                )}
                {eb?.twitter_profile && (
                  <a
                    href={eb.twitter_profile.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    <span>@{eb.twitter_profile.handle}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={isRejected ? "opacity-60 saturate-50 transition" : ""}>

      {/* ============== 2. INVESTMENT SUMMARY ============== */}
      {d.narrative && (
        <section className="mb-8">
          <p className="text-[15px] md:text-base leading-relaxed text-foreground text-pretty max-w-3xl">
            {d.narrative}
          </p>
        </section>
      )}

      {/* ============== 3. KEY SIGNALS + FEATURED REPO ============== */}
      <section className="grid md:grid-cols-5 gap-5 mb-8">
        {/* LEFT: Key signals */}
        <Card className="md:col-span-3 p-6 rounded-2xl border-border shadow-sm">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-4">
            Key signals
          </div>
          {d.key_signals.length > 0 ? (
            <ul className="space-y-3">
              {d.key_signals.map((s, i) => {
                const hasUrl = !!s.supporting_url;
                return (
                  <li
                    key={i}
                    className={`group flex items-start gap-3 text-sm ${hasUrl ? "" : "opacity-60"}`}
                  >
                    <Sparkles className="h-3.5 w-3.5 mt-1 text-accent-indigo shrink-0" />
                    <span className="flex-1 text-pretty leading-relaxed">{s.claim}</span>
                    {hasUrl && (
                      <a
                        href={s.supporting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-accent-indigo hover:underline shrink-0 transition-colors"
                      >
                        View evidence <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No key signals.</p>
          )}
        </Card>

        {/* RIGHT: Featured / owned repo (proof of capability) */}
        <Card className="md:col-span-2 p-6 rounded-2xl border-border shadow-sm bg-surface-sunken/40">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-3">
            Owned repository
          </div>
          {featuredRepo ? (
            <div>
              <a
                href={featuredRepo.html_url}
                target="_blank"
                rel="noreferrer"
                className="block font-serif text-xl leading-tight text-foreground hover:text-accent-indigo transition-colors break-words"
              >
                {featuredRepo.full_name.split("/").pop()}
              </a>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 tabular-nums text-foreground font-medium">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {featuredRepo.stars.toLocaleString()}
                </span>
                {featuredRepo.language && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-accent-indigo" />
                    {featuredRepo.language}
                  </span>
                )}
              </div>
              {featuredRepo.description && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed text-pretty line-clamp-3">
                  {featuredRepo.description}
                </p>
              )}
              <div className="mt-4">
                <RepoSparkline seed={featuredRepo.full_name} stars={featuredRepo.stars} />
              </div>
              {otherRepos.length > 0 && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  + {otherRepos.length} other public repo{otherRepos.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No public repositories.</p>
          )}
        </Card>
      </section>

      {/* ============== 4. NETWORK SIGNALS ============== */}
      {networkSignals.length > 0 && (
        <section className="mb-8">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
            Network signals
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            These people interacted with this profile.
          </p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {networkSignals.map((f) => (
              <li
                key={`${f.platform}-${f.canonical_id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-sunken/60 hover:bg-surface-sunken transition-colors"
              >
                <EntityAvatar name={f.display_name} size={32} rounded="full" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {f.display_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate capitalize">
                    via {f.platform}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ============== 5. RECOMMENDED ACTION ============== */}
      {(d.recommended_action || topNetworkSignal) && (
        <section className="mb-8">
          <Card className="p-5 md:p-6 rounded-2xl border-0 shadow-sm bg-[hsl(152_55%_94%)]">
            <div className="text-[10px] uppercase tracking-wider font-medium text-[hsl(152_55%_28%)] mb-2">
              Recommended action
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <p className="font-serif text-xl md:text-2xl leading-snug text-[hsl(152_75%_18%)] text-pretty flex-1 min-w-0">
                {d.recommended_action ||
                  (topNetworkSignal ? `Warm intro via ${topNetworkSignal}` : "")}
              </p>
              {topNetworkSignal && (
                <Button
                  size="sm"
                  className="bg-[hsl(152_75%_22%)] text-white hover:bg-[hsl(152_75%_18%)] gap-1.5 shrink-0"
                  asChild
                >
                  <Link to={`/connections/${d.target_person_id}`}>
                    View intro path <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* ============== 6. FOOTER ACTIONS ============== */}
      <FooterActions
        eb={eb}
        recentTweets={eb?.recent_tweets ?? []}
        onCorrect={() => feedbackMutation.mutate({ verdict: "correct" })}
        onWrong={() => feedbackMutation.mutate({ verdict: "wrong_target" })}
        pending={feedbackMutation.isPending}
      />

      </div>
    </div>
  );
}

function FooterActions({
  recentTweets,
  onCorrect,
  onWrong,
  pending,
}: {
  eb: unknown;
  recentTweets: { id: string; text: string; created_at: string; url: string; favorite_count: number; retweet_count: number }[];
  onCorrect: () => void;
  onWrong: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-10 pt-6 border-t border-border">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Hide" : "View"} full dossier
        </button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onCorrect}
            className="gap-1.5"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
            Right
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onWrong}
            className="gap-1.5"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Wrong
          </Button>
        </div>
      </div>

      {open && recentTweets.length > 0 && (
        <Card className="mt-5 p-6 rounded-2xl border-border shadow-none">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-3">
            Recent tweets
          </div>
          <ul className="space-y-4">
            {recentTweets.map((t) => (
              <li key={t.id} className="border-b border-border/60 last:border-b-0 pb-3 last:pb-0">
                <p className="text-sm text-pretty leading-relaxed">{t.text}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                  <span>{formatRelative(t.created_at)}</span>
                  <span>♥ {t.favorite_count}</span>
                  <span>↻ {t.retweet_count}</span>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-accent-indigo hover:underline"
                  >
                    view <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}