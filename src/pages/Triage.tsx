import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
  Github,
  Sparkles,
  Terminal,
} from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  useLatestTriageRun,
  useRunLinkedInEnrichment,
  useRunTriage,
  useRunTwitterScrape,
  useSeedScanStatus,
} from "@/hooks/useAnytrace";
import type { SeedScanStatus, TriageAgentLogEntry, TriageCandidate, TriageDecision, TriageResult } from "@/data/anytrace";
import { isAnytraceDemoMode } from "@/lib/demoMode";

function formatTime(value?: string | null) {
  if (!value) return "Not run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCliTime(value?: string | null) {
  if (!value) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function categoryLabel(value: TriageResult["category"]) {
  if (value === "active_founder") return "Active founder";
  if (value === "company_no_raise_yet") return "Company, no raise yet";
  return "Potential founder";
}

function decisionLabel(value: TriageDecision) {
  if (value === "reach_out_now") return "Reach out now";
  if (value === "research_more") return "Research more";
  if (value === "watch") return "Watch";
  return "Discard";
}

function decisionTone(value: TriageDecision) {
  if (value === "reach_out_now") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "research_more") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "watch") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-border bg-surface-sunken text-muted-foreground";
}

type CliLogLevel = "info" | "pending" | "success" | "error";
type TriageProfile = Partial<TriageCandidate & TriageResult>;
type PipelinePhase = "idle" | "seed_scan" | "seed_wait" | "linkedin" | "triage" | "complete" | "error";

interface CliLogEntry {
  timestamp: string;
  command: string;
  message: string;
  level: CliLogLevel;
}

function cliLevelTone(level: CliLogLevel) {
  if (level === "success") return "text-emerald-300";
  if (level === "pending") return "text-amber-300";
  if (level === "error") return "text-red-300";
  return "text-sky-300";
}

function cliLevelForAgentStage(stage: string): CliLogLevel {
  const normalized = stage.toLowerCase();
  if (normalized.includes("error") || normalized.includes("failed")) return "error";
  if (
    normalized.includes("persist") ||
    normalized.includes("completed") ||
    normalized.includes("loaded") ||
    normalized.includes("resolved") ||
    normalized.includes("extract") ||
    normalized.includes("selection") ||
    normalized.includes("filter")
  ) {
    return "success";
  }
  if (normalized.includes("open") || normalized.includes("resolve") || normalized.includes("scrape") || normalized.includes("model")) return "pending";
  return "info";
}

function cliCommandForAgentStage(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes("seed") || normalized.includes("threshold")) {
    return `seed:${stage}`;
  }
  if (normalized.includes("x_connection") || normalized.includes("x_follow")) {
    return `x:${stage}`;
  }
  if (normalized.includes("github") || normalized === "builder") {
    return `github:${stage}`;
  }
  if (normalized.includes("linkedin") || normalized.includes("profile") || normalized.includes("browser") || normalized.includes("auth")) {
    return `linkedin:${stage}`;
  }
  if (
    normalized.includes("url_") ||
    normalized === "x_profile_cache" ||
    normalized === "candidate_pool" ||
    normalized === "candidate_filter" ||
    normalized === "target_selection" ||
    normalized === "run_start" ||
    normalized.includes("scrape") ||
    normalized.includes("persist")
  ) {
    return `linkedin:${stage}`;
  }
  return `agent:${stage}`;
}

const SEED_SCAN_TIMEOUT_MS = 180_000;
const SEED_SCAN_POLL_MS = 3_000;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function seedScanProgress(status?: SeedScanStatus | null) {
  const count = Math.max(0, Number(status?.count ?? 0));
  const total = Math.max(0, Number(status?.total ?? status?.limit ?? 0));
  const remaining = Math.max(0, Number(status?.remaining ?? (total > 0 ? total - count : 0)));
  return {
    count,
    total,
    remaining,
    currentAccount: status?.currentAccount || null,
    currentHandle: status?.currentHandle || null,
    lastCompletedAccount: status?.lastCompletedAccount || null,
  };
}

function seedScanProgressText(status?: SeedScanStatus | null) {
  const progress = seedScanProgress(status);
  const base = progress.total > 0
    ? `${progress.count}/${progress.total} seed accounts scanned, ${progress.remaining} remaining`
    : `${progress.count} seed accounts scanned`;
  if (progress.currentAccount) {
    const handle = progress.currentHandle ? ` (${progress.currentHandle})` : "";
    return `${base}; now scanning ${progress.currentAccount}${handle}.`;
  }
  if (progress.lastCompletedAccount && progress.remaining > 0) {
    return `${base}; last completed ${progress.lastCompletedAccount}.`;
  }
  return `${base}.`;
}

function CliUpdateLog({ entries, statusLabel }: { entries: CliLogEntry[]; statusLabel: string }) {
  const [open, setOpen] = useState(false);
  const visibleEntries = entries;
  let currentIndex = -1;
  visibleEntries.forEach((entry, index) => {
    if (entry.level === "pending") currentIndex = index;
  });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] ${open ? "max-w-[520px]" : "max-w-[310px]"}`}
      data-testid="e2e-cli-update-log"
    >
      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white/95 text-slate-950 shadow-2xl shadow-slate-950/12 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-950 text-white">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Anytrace.ai agent activity</div>
              <div className="truncate text-xs text-slate-500">{statusLabel}</div>
            </div>
          </div>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              aria-label={open ? "Collapse E2E update log" : "Expand E2E update log"}
              data-testid="e2e-cli-update-log-toggle"
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div
            className="max-h-[340px] space-y-2 overflow-y-auto bg-slate-50/70 px-3 py-3 text-xs leading-5"
            aria-live="polite"
            data-testid="e2e-cli-update-log-lines"
          >
            {visibleEntries.map((entry, index) => {
              const isCurrent = index === currentIndex;
              return (
                <div
                  key={`${entry.timestamp}-${entry.command}-${index}`}
                  className={`rounded-[18px] border bg-white px-3 py-2.5 shadow-sm transition ${
                    isCurrent
                      ? "e2e-log-current border-slate-300 shadow-slate-300/60"
                      : entry.level === "error"
                        ? "border-red-200 bg-red-50"
                        : "border-slate-200"
                  }`}
                  data-testid="e2e-cli-update-log-line"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        entry.level === "success"
                          ? "bg-emerald-500"
                          : entry.level === "error"
                            ? "bg-red-500"
                            : entry.level === "pending"
                              ? "bg-slate-950"
                              : "bg-sky-500"
                      } ${isCurrent ? "animate-ping" : ""}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">{formatCliTime(entry.timestamp)}</span>
                        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${cliLevelTone(entry.level)} bg-slate-950`}>
                          {entry.level === "pending" ? "running" : entry.level}
                        </span>
                        <span className="truncate font-mono text-[11px] text-slate-500">{entry.command}</span>
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-800">{entry.message}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function sourceLabel(candidate: TriageCandidate) {
  const count = candidate.currentSeedFollowerCount;
  return `${count} curated source${count === 1 ? "" : "s"}`;
}

function sourceCountLabel(count: number) {
  return `${count} curated source${count === 1 ? "" : "s"}`;
}

function compactNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" })
    .format(value)
    .replace("K", "k")
    .replace("M", "m");
}

function normalizeUiHandle(value?: string | null) {
  return String(value || "").replace(/^@/, "").toLowerCase();
}

function avatarFor(profile?: TriageProfile | null) {
  return profile?.xAvatarUrl || profile?.avatarUrl || null;
}

function initials(name?: string | null) {
  const parts = String(name || "?")
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function PersonAvatar({
  name,
  src,
  size = "md",
}: {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm";

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-full border border-white bg-slate-200 shadow-sm ring-1 ring-slate-200`}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-100 to-slate-300 font-medium text-slate-600">
          {initials(name)}
        </div>
      )}
    </div>
  );
}

function linkedinLine(profile: TriageProfile) {
  const roleLine = [profile.linkedinRoleTitle, profile.linkedinCompany].filter(Boolean).join(" at ");
  return roleLine || profile.linkedinHeadline || null;
}

function githubLine(profile: TriageProfile) {
  const context = profile.githubContext;
  if (!context) return null;
  if (context.builderSignal) return context.builderSignal;
  if (context.handle) return `GitHub @${context.handle}`;
  return null;
}

function topGithubRepo(profile: TriageProfile) {
  return profile.githubContext?.topRepos?.find((repo) => repo.repoLabel || repo.stars || repo.starDelta7d) || null;
}

function githubStats(profile: TriageProfile) {
  const context = profile.githubContext;
  const repo = topGithubRepo(profile);
  const parts = [
    context?.publicRepos ? `${context.publicRepos} repos` : null,
    context?.followers ? `${compactNumber(context.followers) || context.followers} followers` : null,
    repo?.stars ? `${compactNumber(repo.stars) || repo.stars} stars` : null,
    repo?.starDelta7d ? `+${repo.starDelta7d} in 7d` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function profileOverview(profile: TriageProfile) {
  if (profile.overview) return profile.overview;
  const fragments = [
    linkedinLine(profile) ? `LinkedIn: ${linkedinLine(profile)}.` : null,
    githubLine(profile) ? `GitHub builder proof: ${githubLine(profile)}.` : null,
    profile.xBio ? `X bio: ${profile.xBio}` : null,
    profile.currentSeedFollowerCount
      ? `${profile.currentSeedFollowerCount} curated sources follow this profile.`
      : null,
  ].filter(Boolean);
  return fragments.length
    ? fragments.join(" ")
    : "Anytrace.ai has a signal cluster here, but founder and company context still need verification.";
}

function filterHandle(message: string) {
  const match = message.match(/@?([A-Za-z0-9_]{2,32})\s+from top picks/i);
  return match ? normalizeUiHandle(match[1]) : "";
}

function GithubBuilderProof({ profile, compact = false }: { profile: TriageProfile; compact?: boolean }) {
  const context = profile.githubContext;
  if (!context) return null;
  const repo = topGithubRepo(profile);
  const stats = githubStats(profile);

  return (
    <div className={`rounded-[20px] border border-slate-200 bg-white px-4 py-3 ${compact ? "" : "shadow-sm shadow-slate-200/50"}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-white">
          <Github className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Builder proof</div>
            {context.handle ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">@{context.handle}</span>
            ) : null}
          </div>
          {context.builderSignal ? <div className="mt-2 text-sm leading-6 text-slate-800">{context.builderSignal}</div> : null}
          {repo?.repoLabel ? (
            <div className="mt-2 text-sm font-medium text-slate-900">
              {repo.repoLabel}
              {stats ? <span className="font-normal text-muted-foreground"> | {stats}</span> : null}
            </div>
          ) : stats ? (
            <div className="mt-2 text-sm text-muted-foreground">{stats}</div>
          ) : null}
          {context.bio || context.company ? (
            <div className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {[context.company, context.bio].filter(Boolean).join(" | ")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: TriageCandidate }) {
  const seeds = candidate.seedFollowers ?? [];
  const publicAudience = compactNumber(candidate.xPublicFollowerCount);
  const overview = profileOverview(candidate);
  const linkedinContext = linkedinLine(candidate);
  const gitHubContext = githubLine(candidate);

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white/95 p-4 shadow-sm shadow-slate-200/70">
      <div className="flex items-start gap-3">
        <PersonAvatar name={candidate.displayName} src={avatarFor(candidate)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                candidate.qualified ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {candidate.qualified ? "Qualified" : "Below threshold"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{sourceLabel(candidate)}</span>
          </div>
          <h2 className="mt-3 truncate text-base font-semibold">{candidate.displayName}</h2>
          <div className="mt-1 text-sm text-muted-foreground">
            {[candidate.xHandle || "No X handle", publicAudience ? `${publicAudience} public X audience` : null]
              .filter(Boolean)
              .join(" | ")}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">AI overview</div>
        <div className="mt-1 line-clamp-4">{overview}</div>
        {linkedinContext ? <div className="mt-2 font-medium text-slate-800">{linkedinContext}</div> : null}
        {gitHubContext ? <div className="mt-2 font-medium text-slate-800">GitHub: {gitHubContext}</div> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {seeds.slice(0, 4).map((seed) => (
          <span key={seed.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-muted-foreground">
            {seed.xHandle ? `${seed.name} (@${seed.xHandle})` : seed.name}
          </span>
        ))}
        {seeds.length > 4 ? (
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-muted-foreground">
            +{seeds.length - 4} more
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function AgentLog({ entries, running }: { entries: TriageAgentLogEntry[]; running: boolean }) {
  const visibleEntries = running
    ? [
        {
          stage: "system",
          message: "Starting Anytrace.ai Featherless triage...",
          timestamp: new Date().toISOString(),
        },
        {
          stage: "collector",
          message: "Collecting Proof of Signal candidates from the 3+ source inbox...",
          timestamp: new Date().toISOString(),
        },
        {
          stage: "model",
          message: "Preparing Featherless model payload...",
          timestamp: new Date().toISOString(),
        },
      ]
    : entries;

  if (visibleEntries.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-sm text-muted-foreground">
        Run triage to see every agent step, model call, and decision.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleEntries.map((entry, index) => (
        <div key={`${entry.timestamp}-${index}`} className="rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {entry.stage}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
          </div>
          <div className="mt-2 text-sm leading-6">{entry.message}</div>
        </div>
      ))}
    </div>
  );
}

function FilteredOutList({
  entries,
  candidateByHandle,
}: {
  entries: TriageAgentLogEntry[];
  candidateByHandle: Map<string, TriageCandidate>;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-sm text-muted-foreground">
        No profiles were removed by the fit filter in the latest run.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const handle = filterHandle(entry.message);
        const candidate = handle ? candidateByHandle.get(handle) : undefined;
        return (
          <div key={`${entry.timestamp}-${index}`} className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
            <div className="flex items-start gap-3">
              <PersonAvatar name={candidate?.displayName || handle || "Removed"} src={avatarFor(candidate)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{candidate?.displayName || (handle ? `@${handle}` : "Filtered profile")}</div>
                    <div className="text-sm text-muted-foreground">
                      {[candidate?.xHandle, candidate ? sourceLabel(candidate) : null].filter(Boolean).join(" | ")}
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-800">
                    Removed
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{entry.message}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{formatTime(entry.timestamp)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultCard({ result }: { result: TriageResult }) {
  const verificationLabel = result.decision === "reach_out_now" ? "Risk flags" : "Verification needed";
  const publicAudience = compactNumber(result.xPublicFollowerCount);
  const overview = profileOverview(result);
  const linkedinContext = linkedinLine(result);
  const gitHubContext = githubLine(result);

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white/95 p-4 shadow-sm shadow-slate-200/70">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <PersonAvatar name={result.displayName} src={avatarFor(result)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background">#{result.rank}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${decisionTone(result.decision)}`}>
                {decisionLabel(result.decision)}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-muted-foreground">
                {categoryLabel(result.category)}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold">{result.displayName}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              {[result.xHandle || sourceCountLabel(result.currentSeedFollowerCount), publicAudience ? `${publicAudience} public X audience` : null]
                .filter(Boolean)
                .join(" | ")}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Founder fit</div>
            <div className="mt-1 text-lg font-medium">{result.score}</div>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Evidence</div>
            <div className="mt-1 text-lg font-medium">{result.confidence}%</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">AI overview</div>
        <div className="mt-1">{overview}</div>
        {linkedinContext ? <div className="mt-2 font-medium text-slate-800">{linkedinContext}</div> : null}
        {gitHubContext ? <div className="mt-2 font-medium text-slate-800">GitHub: {gitHubContext}</div> : null}
      </div>

      {result.githubContext ? (
        <div className="mt-4">
          <GithubBuilderProof profile={result} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Next action</div>
          <div className="mt-2 text-sm leading-6">{result.nextAction}</div>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{verificationLabel}</div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {result.riskFlags.length > 0 ? result.riskFlags.join(" / ") : "No additional risk flags."}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Evidence, not scores</div>
        {result.evidence.slice(0, 5).map((evidence, index) => (
          <div key={`${evidence.type}-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{evidence.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {result.primaryProfileUrl ? (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={result.primaryProfileUrl} target="_blank" rel="noreferrer">
              Source profile <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
        {result.linkedinUrl ? (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={result.linkedinUrl} target="_blank" rel="noreferrer">
              LinkedIn <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
        {result.githubUrl ? (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={result.githubUrl} target="_blank" rel="noreferrer">
              GitHub <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function InboxPickCard({
  result,
  candidate,
  selected,
  expanded,
  onExpandedChange,
  compact = false,
}: {
  result: TriageResult;
  candidate?: TriageCandidate | null;
  selected: boolean;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  compact?: boolean;
}) {
  const publicAudience = compactNumber(result.xPublicFollowerCount);
  const gitHubContext = githubLine(result);

  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange}>
      <div
        className={`overflow-hidden rounded-[26px] border bg-white shadow-sm transition ${
          selected ? "border-emerald-300 shadow-emerald-100 ring-2 ring-emerald-100" : "border-slate-200 shadow-slate-200/70"
        }`}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={`w-full ${compact ? "p-3" : "p-4"} text-left transition hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200`}
          >
            <div className="flex items-start gap-3">
              <PersonAvatar name={result.displayName} src={avatarFor(result)} size={compact ? "md" : "lg"} />
              <div className="min-w-0 flex-1">
                <div className="flex gap-3 md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className={`truncate font-semibold ${compact ? "text-base" : "text-lg"}`}>{result.displayName}</h3>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {[result.xHandle, publicAudience ? `${publicAudience} public X audience` : null].filter(Boolean).join(" | ")}
                    </div>
                  </div>
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500">
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background">#{result.rank}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${decisionTone(result.decision)}`}>
                    {decisionLabel(result.decision)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                    {categoryLabel(result.category)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {sourceCountLabel(result.currentSeedFollowerCount)}
                  </span>
                  {gitHubContext ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                      <Github className="h-3.5 w-3.5 shrink-0 text-slate-900" />
                      <span>GitHub proof</span>
                    </span>
                  ) : null}
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {expanded ? "Hide details" : "Show evidence"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-1 text-sm leading-6 text-slate-700">{profileOverview(result)}</p>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-slate-100 bg-white px-4 pb-4 pt-3">
            <SignalsPanel result={result} candidate={candidate} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function SignalsPanel({
  result,
  candidate,
}: {
  result?: TriageResult | null;
  candidate?: TriageCandidate | null;
}) {
  const profile = (result || candidate) as TriageProfile | undefined;

  if (!profile) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-sm text-muted-foreground">
        Select a top pick to see the AI reasoning, source evidence, and missing context.
      </div>
    );
  }

  const evidence = result?.evidence || candidate?.evidence || [];
  const seeds = candidate?.seedFollowers || [];
  const missingContext = result?.missingContext || [];
  const riskFlags = result?.riskFlags || [];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Proof of Signal</div>
          <div className="mt-2 text-xl font-semibold">{profile.currentSeedFollowerCount || 0}</div>
          <div className="text-sm text-muted-foreground">curated sources</div>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Founder fit</div>
          <div className="mt-2 text-xl font-semibold">{result?.score ?? "-"}</div>
          <div className="text-sm text-muted-foreground">{result ? `${result.confidence}% confidence` : "No model rank yet"}</div>
        </div>
        <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Next step</div>
          <div className="mt-2 line-clamp-3 text-sm leading-6 text-emerald-950">{result?.nextAction || "Research company and founder context."}</div>
        </div>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">AI overview</div>
        <p className="mt-2 text-sm leading-6 text-slate-800">{profileOverview(profile)}</p>
      </div>

      {profile.githubContext ? <GithubBuilderProof profile={profile} compact /> : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Why this is interesting</div>
          <p className="mt-2 text-sm leading-6 text-slate-800">{result?.whyNow || "This profile is visible because it crossed the source threshold."}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {evidence.slice(0, 6).map((item, index) => (
              <div key={`${item.type}-${index}`} className="flex items-start gap-2 rounded-[16px] bg-white px-3 py-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Risk / uncertainty</div>
            <div className="mt-3 space-y-2">
              {(riskFlags.length ? riskFlags : ["No additional risk flags."]).slice(0, 4).map((item) => (
                <div key={item} className="rounded-[16px] bg-white px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Missing context</div>
            <div className="mt-3 space-y-2">
              {(missingContext.length ? missingContext : ["No major missing context surfaced."]).slice(0, 4).map((item) => (
                <div key={item} className="rounded-[16px] bg-white px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {seeds.length > 0 ? (
        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Capital adjacency</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {seeds.slice(0, 10).map((seed) => (
              <span key={seed.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                {seed.xHandle ? `${seed.name} (@${seed.xHandle})` : seed.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TriagePage() {
  const { access } = useAccessState();
  const demoMode = isAnytraceDemoMode();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("idle");
  const [pipelineStartedAt, setPipelineStartedAt] = useState<string | null>(null);
  const [pipelineLinkedInLog, setPipelineLinkedInLog] = useState<TriageAgentLogEntry[]>([]);
  const [showResearchQueue, setShowResearchQueue] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const latestQuery = useLatestTriageRun(access.isAuthenticated);
  const seedScanStatusQuery = useSeedScanStatus(access.isAuthenticated);
  const runSeedScan = useRunTwitterScrape();
  const runTriage = useRunTriage();
  const runLinkedInEnrichment = useRunLinkedInEnrichment();
  const seedScanStatus = seedScanStatusQuery.data?.scanStatus;
  const seedProgress = seedScanProgress(seedScanStatus);
  const seedScanInProgress = seedScanStatus?.status === "queued" || seedScanStatus?.status === "running";
  const activeRun = runTriage.data ?? latestQuery.data;
  const triageAgentLog = activeRun?.agentLog ?? [];
  const linkedInRunLog = useMemo(
    () => (pipelineLinkedInLog.length > 0 ? pipelineLinkedInLog : runLinkedInEnrichment.data?.agentLog || runLinkedInEnrichment.data?.agent_log || []),
    [pipelineLinkedInLog, runLinkedInEnrichment.data?.agentLog, runLinkedInEnrichment.data?.agent_log],
  );
  const pipelineRunning =
    pipelinePhase === "seed_scan" ||
    pipelinePhase === "seed_wait" ||
    pipelinePhase === "linkedin" ||
    pipelinePhase === "triage" ||
    seedScanInProgress ||
    runSeedScan.isPending ||
    runLinkedInEnrichment.isPending ||
    runTriage.isPending;
  const pipelineTimestamp = pipelineStartedAt || new Date().toISOString();
  const seedScanPendingLog = useMemo(
    () => [
      {
        stage: "seed_scan_start",
        message: seedScanStatus?.status === "queued" ? "Queued X seed-source scan for curated investor and builder accounts." : "Starting X seed-source scan for curated investor and builder accounts.",
        timestamp: pipelineTimestamp,
      },
      {
        stage: "x_connections",
        message: seedScanProgressText(seedScanStatus),
        timestamp: pipelineTimestamp,
      },
      {
        stage: "seed_threshold",
        message: seedProgress.remaining > 0
          ? "Building alert-qualified people as each scanned account updates the 3+ source threshold."
          : "Seed-source scan finished; alert-qualified people are ready for LinkedIn and triage.",
        timestamp: pipelineTimestamp,
      },
    ],
    [pipelineTimestamp, seedProgress.remaining, seedScanStatus],
  );
  const linkedInPendingLog = useMemo(
    () => [
      {
        stage: "run_start",
        message: "Starting native LinkedIn enrichment for source-qualified profiles.",
        timestamp: pipelineTimestamp,
      },
      {
        stage: "candidate_pool",
        message: "Loading 3+ source candidates for the founder pipeline.",
        timestamp: pipelineTimestamp,
      },
      {
        stage: "url_resolver",
        message: "Resolving LinkedIn URLs from person records, prior enrichment, and X profile cache.",
        timestamp: pipelineTimestamp,
      },
      {
        stage: "open_profile",
        message: "Opening known LinkedIn profiles or public metadata fallback.",
        timestamp: pipelineTimestamp,
      },
    ],
    [pipelineTimestamp],
  );
  const triagePendingLog = useMemo(
    () => [
      {
        stage: "triage_collect",
        message: "Collecting enriched candidates, Proof of Signal, and capital adjacency evidence.",
        timestamp: new Date().toISOString(),
      },
      {
        stage: "triage_filter",
        message: "Removing obvious network magnets, VC partners, and public AI lab accounts from top picks.",
        timestamp: new Date().toISOString(),
      },
      {
        stage: "github",
        message: "Attaching GitHub builder evidence without rewarding popularity alone.",
        timestamp: new Date().toISOString(),
      },
      {
        stage: "triage_model",
        message: "Calling Featherless to classify founder fit and rank the shortlist.",
        timestamp: new Date().toISOString(),
      },
    ],
    [pipelinePhase],
  );
  const activeAgentLog = useMemo(() => {
    if (runSeedScan.isPending || pipelinePhase === "seed_scan" || pipelinePhase === "seed_wait" || (pipelinePhase === "idle" && seedScanInProgress)) {
      return seedScanPendingLog;
    }
    if (runLinkedInEnrichment.isPending) {
      return linkedInPendingLog;
    }
    const entries: TriageAgentLogEntry[] = [];
    if (linkedInRunLog.length > 0) entries.push(...linkedInRunLog);
    if (runTriage.isPending) entries.push(...triagePendingLog);
    if (runTriage.data?.agentLog?.length) entries.push(...runTriage.data.agentLog);
    if (entries.length > 0) return entries;
    return triageAgentLog;
  }, [
    linkedInPendingLog,
    linkedInRunLog,
    pipelinePhase,
    runLinkedInEnrichment.isPending,
    runSeedScan.isPending,
    runTriage.data?.agentLog,
    runTriage.isPending,
    seedScanInProgress,
    seedScanPendingLog,
    triageAgentLog,
    triagePendingLog,
  ]);
  const filterLogEntries = useMemo(
    () => triageAgentLog.filter((entry) => entry.stage === "filter"),
    [triageAgentLog],
  );
  const rawCandidates = useMemo(
    () =>
      [...(activeRun?.rawCandidates ?? [])].sort((left, right) => {
        if (left.qualified !== right.qualified) return Number(right.qualified) - Number(left.qualified);
        return right.currentSeedFollowerCount - left.currentSeedFollowerCount;
      }),
    [activeRun?.rawCandidates],
  );
  const results = activeRun?.results ?? [];
  const actionableResults = results.filter((result) => result.decision === "reach_out_now" || result.decision === "research_more");
  const watchResults = results.filter((result) => result.decision === "watch");
  const candidateById = useMemo(
    () => new Map(rawCandidates.map((candidate) => [candidate.id, candidate])),
    [rawCandidates],
  );
  const candidateByHandle = useMemo(() => {
    const rows = new Map<string, TriageCandidate>();
    rawCandidates.forEach((candidate) => {
      const handle = normalizeUiHandle(candidate.xHandle);
      if (handle) rows.set(handle, candidate);
    });
    return rows;
  }, [rawCandidates]);
  const researchCount = actionableResults.length;
  const watchCount = watchResults.length;
  const isLoading = latestQuery.isLoading && !runTriage.data;
  const errorMessage =
    (runSeedScan.error as Error | null)?.message ||
    (seedScanStatusQuery.error as Error | null)?.message ||
    seedScanStatusQuery.data?.scanStatus?.error ||
    (runLinkedInEnrichment.error as Error | null)?.message ||
    (runTriage.error as Error | null)?.message ||
    (latestQuery.error as Error | null)?.message ||
    activeRun?.error ||
    null;
  const waitForSeedScanCompletion = useCallback(async () => {
    const deadline = Date.now() + SEED_SCAN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const latestSeedScan = await seedScanStatusQuery.refetch();
      const status = latestSeedScan.data?.scanStatus?.status;
      if (status === "completed") {
        return latestSeedScan.data;
      }
      if (status === "error") {
        throw new Error(latestSeedScan.data?.scanStatus?.error || "Seed-source X scan failed.");
      }
      await wait(SEED_SCAN_POLL_MS);
    }
    throw new Error("Seed-source X scan did not finish within 3 minutes. Check the backend log and try again.");
  }, [seedScanStatusQuery]);

  const runAgentPipeline = useCallback(async () => {
    setPipelineStartedAt(new Date().toISOString());
    setPipelinePhase("seed_scan");
    setPipelineLinkedInLog([]);
    runSeedScan.reset();
    runLinkedInEnrichment.reset();
    runTriage.reset();
    try {
      await runSeedScan.mutateAsync();
      setPipelinePhase("seed_wait");
      await waitForSeedScanCompletion();
      setPipelinePhase("linkedin");
      const linkedInResult = await runLinkedInEnrichment.mutateAsync({ limit: 1, missingOnly: false });
      setPipelineLinkedInLog(linkedInResult.agentLog || linkedInResult.agent_log || []);
      setPipelinePhase("triage");
      await runTriage.mutateAsync();
      setPipelinePhase("complete");
    } catch {
      setPipelinePhase("error");
    }
  }, [runLinkedInEnrichment, runSeedScan, runTriage, waitForSeedScanCompletion]);
  const pipelineButtonLabel = (() => {
    if (!pipelineRunning) return pipelinePhase === "error" ? "Retry Full Pipeline" : "Run Full Pipeline";
    if (pipelinePhase === "seed_scan" || pipelinePhase === "seed_wait" || runSeedScan.isPending || (pipelinePhase === "idle" && seedScanInProgress)) {
      return "Scanning X connections...";
    }
    if (pipelinePhase === "triage" || runTriage.isPending) return "Ranking founder leads...";
    return "Enriching LinkedIn context...";
  })();
  const cliEntries = useMemo<CliLogEntry[]>(() => {
    const now = new Date().toISOString();
    const rows: CliLogEntry[] = [
      {
        timestamp: activeRun?.startedAt || now,
        command: "route /triage",
        message: "Founder Pipeline mounted for E2E observation.",
        level: "info",
      },
    ];

    if (latestQuery.isLoading) {
      rows.push({
        timestamp: now,
        command: "GET /triage/latest",
        message: "Loading latest persisted Featherless run.",
        level: "pending",
      });
    } else if (latestQuery.isError) {
      rows.push({
        timestamp: now,
        command: "GET /triage/latest",
        message: (latestQuery.error as Error | null)?.message || "Latest run request failed.",
        level: "error",
      });
    } else {
      rows.push({
        timestamp: activeRun?.completedAt || activeRun?.startedAt || now,
        command: "GET /triage/latest",
        message: `${activeRun?.status || "empty"} run loaded with ${activeRun?.qualifiedCount ?? 0} qualified profiles and ${filterLogEntries.length} obvious magnets filtered.`,
        level: "success",
      });
    }

    if (pipelinePhase !== "idle") {
      rows.push({
        timestamp: pipelineStartedAt || now,
        command: "agent pipeline",
        message: "Single-click flow: X seed-source scan, LinkedIn context refresh, fit filtering, Featherless ranking, then UI render.",
        level: pipelineRunning ? "pending" : pipelinePhase === "error" ? "error" : "success",
      });
    }

    if (runSeedScan.isPending || pipelinePhase === "seed_scan" || pipelinePhase === "seed_wait" || (pipelinePhase === "idle" && seedScanInProgress)) {
      rows.push({
        timestamp: now,
        command: "POST /run-twitter",
        message: seedScanProgressText(seedScanStatus),
        level: "pending",
      });
    }
    if (runSeedScan.isSuccess && runSeedScan.data) {
      rows.push({
        timestamp: seedScanStatusQuery.data?.scanStatus?.startedAt || now,
        command: "POST /run-twitter",
        message: runSeedScan.data.message || `seed scan accepted for ${runSeedScan.data.limit ?? "configured"} seed sources.`,
        level: "success",
      });
    }
    if (pipelinePhase === "seed_wait") {
      rows.push({
        timestamp: now,
        command: "GET /seed-scan/latest",
        message: `waiting for X scan status=${seedScanStatus?.status || "queued"}; ${seedScanProgressText(seedScanStatus)}`,
        level: "pending",
      });
    }
    if (runSeedScan.isError) {
      rows.push({
        timestamp: now,
        command: "POST /run-twitter",
        message: (runSeedScan.error as Error | null)?.message || "Seed-source X scan failed to start.",
        level: "error",
      });
    }

    if (runLinkedInEnrichment.isPending) {
      rows.push({
        timestamp: now,
        command: "POST /run-linkedin-enrichment",
        message: "Resolving LinkedIn URLs and enriching source-qualified profiles.",
        level: "pending",
      });
    }
    if (runLinkedInEnrichment.isSuccess && runLinkedInEnrichment.data) {
      rows.push({
        timestamp: now,
        command: "POST /run-linkedin-enrichment",
        message: `processed=${runLinkedInEnrichment.data.processed} enriched=${runLinkedInEnrichment.data.enriched} skipped=${runLinkedInEnrichment.data.skipped}`,
        level: "success",
      });
    }
    if (runLinkedInEnrichment.isError) {
      rows.push({
        timestamp: now,
        command: "POST /run-linkedin-enrichment",
        message: (runLinkedInEnrichment.error as Error | null)?.message || "LinkedIn enrichment failed.",
        level: "error",
      });
    }

    if (runTriage.isPending) {
      rows.push({
        timestamp: now,
        command: "POST /triage/run",
        message: "Running 3+ source filter and Featherless founder triage.",
        level: "pending",
      });
    }
    if (runTriage.isSuccess && runTriage.data) {
      rows.push({
        timestamp: runTriage.data.completedAt || now,
        command: "POST /triage/run",
        message: `completed live triage with ${runTriage.data.results.length} ranked profiles.`,
        level: "success",
      });
    }
    if (runTriage.isError) {
      rows.push({
        timestamp: now,
        command: "POST /triage/run",
        message: (runTriage.error as Error | null)?.message || "Featherless triage failed.",
        level: "error",
      });
    }

    activeAgentLog.forEach((entry) => {
      rows.push({
        timestamp: entry.timestamp || now,
        command: cliCommandForAgentStage(entry.stage),
        message: entry.message,
        level: cliLevelForAgentStage(entry.stage),
      });
    });

    if (activeRun?.status === "completed") {
      rows.push({
        timestamp: activeRun.completedAt || now,
        command: "render shortlist",
        message: `${actionableResults.length} top picks and ${watchResults.length} watch profiles visible from ${rawCandidates.length} raw candidates.`,
        level: "success",
      });
    }
    if (errorMessage) {
      rows.push({
        timestamp: now,
        command: "surface error",
        message: errorMessage,
        level: "error",
      });
    }

    return rows;
  }, [
    activeAgentLog,
    activeRun?.completedAt,
    activeRun?.qualifiedCount,
    activeRun?.startedAt,
    activeRun?.status,
    actionableResults.length,
    errorMessage,
    filterLogEntries.length,
    latestQuery.error,
    latestQuery.isError,
    latestQuery.isLoading,
    pipelinePhase,
    pipelineRunning,
    pipelineStartedAt,
    rawCandidates.length,
    runLinkedInEnrichment.data,
    runLinkedInEnrichment.error,
    runLinkedInEnrichment.isError,
    runLinkedInEnrichment.isPending,
    runLinkedInEnrichment.isSuccess,
    runSeedScan.data,
    runSeedScan.error,
    runSeedScan.isError,
    runSeedScan.isPending,
    runSeedScan.isSuccess,
    runTriage.data,
    runTriage.error,
    runTriage.isError,
    runTriage.isPending,
    runTriage.isSuccess,
    seedScanInProgress,
    seedScanStatus,
    watchResults.length,
  ]);
  const cliStatusLabel = (() => {
    if (pipelineRunning) {
      if (pipelinePhase === "seed_scan" || pipelinePhase === "seed_wait" || runSeedScan.isPending || (pipelinePhase === "idle" && seedScanInProgress)) {
        return seedProgress.total > 0
          ? `scanning X connections: ${seedProgress.count}/${seedProgress.total}`
          : "scanning X connections";
      }
      if (pipelinePhase === "seed_wait") return "waiting for seed scan";
      if (pipelinePhase === "triage" || runTriage.isPending) return "ranking founders with Featherless";
      return "refreshing LinkedIn context";
    }
    if (pipelinePhase === "complete") return "pipeline completed";
    if (errorMessage) return "attention required";
    if (activeRun?.status === "completed") return `${actionableResults.length} top picks ready`;
    return "waiting for first run";
  })();

  return (
    <ProductGate
      title="Founder Pipeline"
      description="Top picks, evidence, filtering, and run log in one VC workflow."
    >
      <div className="mx-auto max-w-5xl px-4 pb-36 pt-6 md:px-8 md:pb-40 md:pt-8">
        <section className="mb-4 overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Anytrace.ai founder pipeline
              </div>
              <h1 className="max-w-3xl text-3xl font-medium md:text-4xl">Pre-seed founders before the market sees them.</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                One click scans X seed-source follows, enriches LinkedIn context, attaches GitHub builder proof, filters obvious magnets, and asks Featherless for the founder shortlist.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:min-w-[280px]">
              <Button
                type="button"
                className="h-12 rounded-full px-5"
                disabled={pipelineRunning}
                onClick={runAgentPipeline}
                data-testid="e2e-run-agent-pipeline-button"
              >
                <Sparkles className={`h-4 w-4 ${pipelineRunning ? "animate-pulse" : ""}`} />
                {pipelineButtonLabel}
              </Button>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[18px] bg-slate-50 px-3 py-2">
                  <div className="text-lg font-semibold">{researchCount}</div>
                  <div className="text-[11px] text-muted-foreground">research</div>
                </div>
                <div className="rounded-[18px] bg-slate-50 px-3 py-2">
                  <div className="text-lg font-semibold">{watchCount}</div>
                  <div className="text-[11px] text-muted-foreground">watch</div>
                </div>
                <div className="rounded-[18px] bg-slate-50 px-3 py-2">
                  <div className="text-lg font-semibold">{filterLogEntries.length}</div>
                  <div className="text-[11px] text-muted-foreground">filtered</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 text-xs text-muted-foreground">
            <span className="rounded-full bg-slate-50 px-3 py-1.5">Latest run: {formatTime(activeRun?.completedAt || activeRun?.startedAt)}</span>
            <span className="rounded-full bg-slate-50 px-3 py-1.5">{activeRun?.qualifiedCount ?? 0} qualified profiles</span>
            <span className="rounded-full bg-slate-50 px-3 py-1.5">Evidence, not scores</span>
          </div>
        </section>

        {errorMessage ? (
          <div className="mb-4 flex items-start gap-2 rounded-[24px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {runLinkedInEnrichment.isSuccess && runLinkedInEnrichment.data ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[22px] border border-signal-linkedin/20 bg-signal-linkedin/5 px-4 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>
              LinkedIn refreshed: {runLinkedInEnrichment.data.enriched} enriched, {runLinkedInEnrichment.data.skipped} skipped.
            </span>
            {!demoMode && <span className="text-slate-400">Detailed steps are in the corner log.</span>}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[140px] rounded-[30px]" />
            <Skeleton className="h-[132px] rounded-[30px]" />
            <Skeleton className="h-[96px] rounded-[28px]" />
          </div>
        ) : (
          <div className="space-y-4">
            <section
              className="rounded-[30px] border border-slate-200 bg-slate-50/70 p-3 shadow-sm shadow-slate-200/70"
              data-testid="e2e-founder-shortlist"
            >
              <div className="px-2 pb-3 pt-1">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">Shortlist</div>
                <h2 className="mt-1 text-2xl font-semibold">Best founder leads</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A compact VC inbox. Open a lead to see the evidence, founder fit, GitHub proof, and missing context.
                </p>
              </div>
              <div className="space-y-3">
                {actionableResults.length > 0 ? (
                  actionableResults.map((result) => {
                    const candidate = candidateById.get(result.candidateId) || null;
                    const expanded = selectedCandidateId === result.candidateId;
                    return (
                      <InboxPickCard
                        key={result.candidateId}
                        result={result}
                        candidate={candidate}
                        selected={expanded}
                        expanded={expanded}
                        onExpandedChange={(open) => setSelectedCandidateId(open ? result.candidateId : null)}
                      />
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-sm text-muted-foreground">
                    No founder-grade profiles passed the AI fit filter in the latest run.
                  </div>
                )}
              </div>

              <Collapsible open={showResearchQueue} onOpenChange={setShowResearchQueue} className="mt-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium shadow-sm shadow-slate-200/50"
                  >
                    <span>Research queue ({watchResults.length})</span>
                    {showResearchQueue ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 space-y-2">
                    {watchResults.length > 0 ? (
                      watchResults.map((result) => {
                        const candidate = candidateById.get(result.candidateId) || null;
                        const expanded = selectedCandidateId === result.candidateId;
                        return (
                          <InboxPickCard
                            key={result.candidateId}
                            result={result}
                            candidate={candidate}
                            selected={expanded}
                            expanded={expanded}
                            onExpandedChange={(open) => setSelectedCandidateId(open ? result.candidateId : null)}
                            compact
                          />
                        );
                      })
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-muted-foreground">
                        No watchlist profiles in the latest run.
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>

            <Collapsible open={showAuditTrail} onOpenChange={setShowAuditTrail}>
              <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex w-full items-center justify-between gap-4 text-left">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Audit trail</div>
                      <h2 className="mt-1 text-xl font-semibold">Filtered profiles, raw candidates, and run log</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Open this when you want to verify why OpenAI, Anthropic, VC partners, and other magnets did not enter the shortlist.
                      </p>
                    </div>
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200">
                      {showAuditTrail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    <div className="min-w-0 rounded-[24px] bg-slate-50 p-3">
                      <div className="mb-3 px-1 text-sm font-semibold">Filtered magnets ({filterLogEntries.length})</div>
                      <div className="max-h-[520px] overflow-y-auto pr-1">
                        <FilteredOutList entries={filterLogEntries} candidateByHandle={candidateByHandle} />
                      </div>
                    </div>
                    <div className="min-w-0 rounded-[24px] bg-slate-50 p-3" data-testid="e2e-raw-candidates">
                      <div className="mb-3 px-1 text-sm font-semibold">Raw 3+ profiles ({rawCandidates.length})</div>
                      <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                        {rawCandidates.length > 0 ? (
                          rawCandidates.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />)
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-muted-foreground">
                            No triage candidates loaded yet.
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-[24px] bg-slate-50 p-3" data-testid="e2e-agent-log">
                      <div className="mb-3 px-1 text-sm font-semibold">Agent log</div>
                      <div className="max-h-[520px] overflow-y-auto pr-1">
                        <AgentLog entries={activeAgentLog} running={runTriage.isPending} />
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </section>
            </Collapsible>
          </div>
        )}
      </div>
      {!demoMode && <CliUpdateLog entries={cliEntries} statusLabel={cliStatusLabel} />}
    </ProductGate>
  );
}
