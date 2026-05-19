import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useAccessState,
  useLatestTriageRun,
  useRunLinkedInEnrichment,
  useRunTriage,
  useRunTwitterScrape,
  useSeedScanStatus,
} from "@/hooks/useTraqr";
import type { SeedScanStatus, TriageAgentLogEntry } from "@/data/traqr";

type PipelinePhase = "idle" | "seed_scan" | "seed_wait" | "linkedin" | "triage" | "complete" | "error";

const SEED_SCAN_TIMEOUT_MS = 180_000;
const SEED_SCAN_POLL_MS = 3_000;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

function pipelineStatusLabel({
  phase,
  running,
  seedScanInProgress,
  seedStatus,
  seedProgress,
  triagePending,
}: {
  phase: PipelinePhase;
  running: boolean;
  seedScanInProgress: boolean;
  seedStatus?: SeedScanStatus | null;
  seedProgress: ReturnType<typeof seedScanProgress>;
  triagePending: boolean;
}) {
  if (running) {
    if (phase === "seed_scan" || phase === "seed_wait" || seedScanInProgress) {
      return seedProgress.total > 0
        ? `Scanning X connections: ${seedProgress.count}/${seedProgress.total}`
        : seedScanProgressText(seedStatus);
    }
    if (phase === "triage" || triagePending) return "Ranking founder leads with Featherless.";
    return "Refreshing LinkedIn context.";
  }
  if (phase === "complete") return "Pipeline completed.";
  if (phase === "error") return "Pipeline needs attention.";
  return "Ready to run.";
}

export function FullPipelinePanel() {
  const { access } = useAccessState();
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("idle");
  const [pipelineLinkedInLog, setPipelineLinkedInLog] = useState<TriageAgentLogEntry[]>([]);
  const latestQuery = useLatestTriageRun(access.isAuthenticated);
  const seedScanStatusQuery = useSeedScanStatus(access.isAuthenticated);
  const runSeedScan = useRunTwitterScrape();
  const runTriage = useRunTriage();
  const runLinkedInEnrichment = useRunLinkedInEnrichment();
  const seedScanStatus = seedScanStatusQuery.data?.scanStatus;
  const seedProgress = seedScanProgress(seedScanStatus);
  const seedScanInProgress = seedScanStatus?.status === "queued" || seedScanStatus?.status === "running";
  const activeRun = runTriage.data ?? latestQuery.data;
  const triageAgentLog = useMemo(() => activeRun?.agentLog ?? [], [activeRun?.agentLog]);
  const filterLogEntries = useMemo(
    () => triageAgentLog.filter((entry) => entry.stage === "filter"),
    [triageAgentLog],
  );
  const results = activeRun?.results ?? [];
  const researchCount = results.filter((result) => result.decision === "reach_out_now" || result.decision === "research_more").length;
  const watchCount = results.filter((result) => result.decision === "watch").length;
  const pipelineRunning =
    pipelinePhase === "seed_scan" ||
    pipelinePhase === "seed_wait" ||
    pipelinePhase === "linkedin" ||
    pipelinePhase === "triage" ||
    seedScanInProgress ||
    runSeedScan.isPending ||
    runLinkedInEnrichment.isPending ||
    runTriage.isPending;
  const linkedInRunLog = pipelineLinkedInLog.length > 0
    ? pipelineLinkedInLog
    : runLinkedInEnrichment.data?.agentLog || runLinkedInEnrichment.data?.agent_log || [];
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
    if (pipelinePhase === "seed_scan" || pipelinePhase === "seed_wait" || runSeedScan.isPending || seedScanInProgress) {
      return "Scanning X connections...";
    }
    if (pipelinePhase === "triage" || runTriage.isPending) return "Ranking founder leads...";
    return "Enriching LinkedIn context...";
  })();
  const statusLabel = pipelineStatusLabel({
    phase: pipelinePhase,
    running: pipelineRunning,
    seedScanInProgress,
    seedStatus: seedScanStatus,
    seedProgress,
    triagePending: runTriage.isPending,
  });

  return (
    <Card className="overflow-hidden rounded-[28px] border-border shadow-none">
      <div className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            traqr.ai founder pipeline
          </div>
          <h3 className="max-w-3xl text-3xl font-medium md:text-4xl">Pre-seed founders before the market sees them.</h3>
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

      <div className="flex flex-wrap gap-2 border-t border-border px-6 py-3 text-xs text-muted-foreground">
        <span className="rounded-full bg-slate-50 px-3 py-1.5">Latest run: {formatTime(activeRun?.completedAt || activeRun?.startedAt)}</span>
        <span className="rounded-full bg-slate-50 px-3 py-1.5">{activeRun?.qualifiedCount ?? 0} qualified profiles</span>
        <span className="rounded-full bg-slate-50 px-3 py-1.5">{statusLabel}</span>
      </div>

      {runLinkedInEnrichment.isSuccess && runLinkedInEnrichment.data ? (
        <div className="mx-6 mb-4 flex flex-wrap items-center gap-2 rounded-[22px] border border-signal-linkedin/20 bg-signal-linkedin/5 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>
            LinkedIn refreshed: {runLinkedInEnrichment.data.enriched} enriched, {runLinkedInEnrichment.data.skipped} skipped.
          </span>
          {linkedInRunLog.length > 0 ? <span className="text-slate-400">{linkedInRunLog.length} enrichment steps logged.</span> : null}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mx-6 mb-4 flex items-start gap-2 rounded-[22px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </Card>
  );
}
