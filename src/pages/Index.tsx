import { useEffect, useRef } from "react";
import { ArrowUpRight, Bell, Clock, Eye, Linkedin, RefreshCw, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessState,
  useAppSettings,
  useRefreshAnytraceData,
  useRunLinkedInEnrichment,
  useSeedScanStatus,
  useRunTwitterScrape,
  useSeedFollowAlerts,
  useUpdateSeedFollowAlertStatus,
} from "@/hooks/useAnytrace";
import type { SeedFollowAlert, SeedFollowerAccount } from "@/data/anytrace";
import { isVisibleSeedFollowAlert } from "@/lib/seedFollowAlerts";

function formatTime(value?: string | null) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function followerLabel(account: SeedFollowerAccount) {
  return account.xHandle ? `${account.name} (@${account.xHandle})` : account.name;
}

function AlertRow({
  alert,
  onDismiss,
  busy,
}: {
  alert: SeedFollowAlert;
  onDismiss: (alert: SeedFollowAlert) => void;
  busy: boolean;
}) {
  const triggerThreshold = alert.alertThreshold ?? 2;
  const triggerAccounts = alert.triggeringSeedAccounts.slice(0, triggerThreshold);
  const remainingCount = Math.max(0, alert.currentSeedFollowerCount - triggerAccounts.length);

  return (
    <Card className="rounded-lg border-border p-4 shadow-none">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              <Bell className="h-3.5 w-3.5" />
              New signal
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(alert.triggeredAt)}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <h2 className="truncate text-xl font-medium">{alert.displayName}</h2>
            <div className="text-sm text-muted-foreground">
              {alert.currentSeedFollowerCount} tracked seed sources follow this person
            </div>
          </div>

          {alert.linkedinHeadline || alert.linkedinRoleTitle || alert.linkedinCompany ? (
            <div className="mt-4 rounded-md border border-signal-linkedin/20 bg-signal-linkedin/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn context
              </div>
              <div className="mt-1 text-sm font-medium">
                {[alert.linkedinRoleTitle, alert.linkedinCompany].filter(Boolean).join(" at ") || "Profile enriched"}
              </div>
              {alert.linkedinHeadline ? (
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{alert.linkedinHeadline}</div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {triggerAccounts.map((account) => (
              <div key={account.id} className="rounded-md border border-border bg-surface-sunken/40 px-3 py-2">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Trigger account</div>
                <div className="mt-1 truncate text-sm font-medium">{followerLabel(account)}</div>
              </div>
            ))}
          </div>

          {remainingCount > 0 ? (
            <div className="mt-3 text-sm text-muted-foreground">
              +{remainingCount} more tracked account{remainingCount === 1 ? "" : "s"} also follow this person.
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button type="button" variant="outline" size="sm" className="rounded-md" disabled={busy} onClick={() => onDismiss(alert)}>
            Dismiss <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button asChild size="sm" className="rounded-md">
            <a href={alert.primaryProfileUrl} target="_blank" rel="noreferrer">
              Open X <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
          {alert.linkedinUrl ? (
            <Button asChild variant="outline" size="sm" className="rounded-md">
              <a href={alert.linkedinUrl} target="_blank" rel="noreferrer">
                LinkedIn <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="rounded-md">
            <Link to={`/graph?focusPerson=${encodeURIComponent(alert.personId)}`}>
              Graph <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function MainDashboard() {
  const { access } = useAccessState();
  const appSettings = useAppSettings(access.isAuthenticated);
  const alertsQuery = useSeedFollowAlerts(access.isAuthenticated);
  const refreshData = useRefreshAnytraceData();
  const runSeedScan = useRunTwitterScrape();
  const seedScanStatusQuery = useSeedScanStatus(access.isAuthenticated);
  const runLinkedInEnrichment = useRunLinkedInEnrichment();
  const updateAlertStatus = useUpdateSeedFollowAlertStatus();
  const seedScanStatus = seedScanStatusQuery.data?.scanStatus;
  const seedScanSummary = seedScanStatusQuery.data?.scanSummary ?? appSettings.data?.seedScan ?? null;
  const seedScanRunning = seedScanStatus?.status === "queued" || seedScanStatus?.status === "running";
  const previousSeedScanStatus = useRef(seedScanStatus?.status);

  useEffect(() => {
    const previous = previousSeedScanStatus.current;
    const current = seedScanStatus?.status;
    if ((previous === "queued" || previous === "running") && current === "completed") {
      refreshData.mutate();
    }
    previousSeedScanStatus.current = current;
  }, [refreshData, seedScanStatus?.status]);

  const visibleAlerts = [...(alertsQuery.data ?? [])].filter(isVisibleSeedFollowAlert);
  const activeThreshold = appSettings.data?.seedFollowAlertThreshold ?? visibleAlerts[0]?.alertThreshold ?? 3;
  const alerts = visibleAlerts
    .filter((alert) => alert.currentSeedFollowerCount >= activeThreshold)
    .sort((left, right) => new Date(right.triggeredAt || 0).getTime() - new Date(left.triggeredAt || 0).getTime());
  const seedAccountCount = new Set(alerts.flatMap((alert) => alert.seedFollowers.map((account) => account.id))).size;
  const newCount = alerts.filter((alert) => alert.status === "new").length;

  return (
    <ProductGate title="Seed Scan">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <Bell className="h-3.5 w-3.5" />
              Seed-source scan
            </div>
            <h1 className="text-3xl font-medium md:text-4xl">
              People crossing the {activeThreshold}-seed-follow threshold
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              New people appear here when at least {activeThreshold} curated seed sources follow them on X.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="w-full rounded-md sm:w-auto"
              disabled={runSeedScan.isPending || seedScanRunning}
              onClick={() => runSeedScan.mutate()}
            >
              <RefreshCw className={`h-4 w-4 ${runSeedScan.isPending || seedScanRunning ? "animate-spin" : ""}`} />
              {seedScanRunning ? "Seed scan running" : "Run seed scan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-md sm:w-auto"
              disabled={runLinkedInEnrichment.isPending}
              onClick={() => runLinkedInEnrichment.mutate({ missingOnly: true })}
            >
              <Linkedin className={`h-4 w-4 ${runLinkedInEnrichment.isPending ? "animate-pulse" : ""}`} />
              Enrich LinkedIn
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-md sm:w-auto"
              disabled={refreshData.isPending}
              onClick={() => refreshData.mutate()}
            >
              <RefreshCw className={`h-4 w-4 ${refreshData.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {runSeedScan.isError ? (
          <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(runSeedScan.error as Error)?.message || "Seed scan could not be started."}
          </div>
        ) : null}

        {runSeedScan.isSuccess && runSeedScan.data ? (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {runSeedScan.data.message || "Seed scan started."} The latest completed scan remains preloaded while the new batch runs.
          </div>
        ) : null}

        {seedScanStatus?.status === "error" ? (
          <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {seedScanStatus.error || "Latest seed scan failed."}
          </div>
        ) : null}

        {runLinkedInEnrichment.isError ? (
          <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(runLinkedInEnrichment.error as Error)?.message || "Native LinkedIn enrichment could not be started."}
          </div>
        ) : null}

        {runLinkedInEnrichment.isSuccess && runLinkedInEnrichment.data ? (
          <div className="mb-5 rounded-lg border border-signal-linkedin/25 bg-signal-linkedin/5 px-4 py-3 text-sm text-muted-foreground">
            {runLinkedInEnrichment.data.enriched > 0
              ? `Native LinkedIn scraper enriched ${runLinkedInEnrichment.data.enriched} of ${runLinkedInEnrichment.data.processed} selected profile${runLinkedInEnrichment.data.processed === 1 ? "" : "s"}. ${runLinkedInEnrichment.data.skipped ? `${runLinkedInEnrichment.data.skipped} skipped.` : ""}`
              : runLinkedInEnrichment.data.message || "No source-qualified profiles need LinkedIn enrichment right now."}
            {(runLinkedInEnrichment.data.agentLog || runLinkedInEnrichment.data.agent_log || []).length > 0 ? (
              <div className="mt-3 space-y-1 border-t border-signal-linkedin/20 pt-3">
                {(runLinkedInEnrichment.data.agentLog || runLinkedInEnrichment.data.agent_log || []).slice(-4).map((entry, index) => (
                  <div key={`${entry.timestamp}-${index}`} className="font-mono text-xs text-muted-foreground">
                    [{entry.stage}] {entry.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">New signals</div>
            <div className="mt-1 text-2xl font-medium">{newCount}</div>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Qualified people</div>
            <div className="mt-1 text-2xl font-medium">{alerts.length}</div>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Seed accounts involved</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-medium">
              <Users className="h-5 w-5 text-muted-foreground" />
              {seedAccountCount}
            </div>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Last seed scan</div>
            <div className="mt-1 text-sm font-medium">
              {seedScanRunning ? "Running now" : formatTime(seedScanSummary?.latestRunAt)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {seedScanSummary
                ? `${seedScanSummary.snapshotCount.toLocaleString()} follows, ${seedScanSummary.alertCount.toLocaleString()} source signals`
                : "Loading latest scan"}
            </div>
          </div>
        </div>

        {alertsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ) : alertsQuery.isError ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            {String(alertsQuery.error || "Seed scan signals could not be loaded.")}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
            No {activeThreshold}-seed-follow signals yet. Run the X seed-account scraper to populate the source history.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onDismiss={(target) => updateAlertStatus.mutate({ alertId: target.id, status: "archived" })}
                busy={updateAlertStatus.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </ProductGate>
  );
}
