import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, Clock, Heart, RotateCcw, Search, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { SeedPromotionDialog } from "@/components/anytrace/SeedPromotionDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useAppSettings, useSeedFollowAlerts, useUpdateSeedFollowAlertStatus } from "@/hooks/useAnytrace";
import type { SeedFollowAlert, SeedFollowerAccount } from "@/data/anytrace";
import { isActiveSeedFollowAlert, isArchivedSeedFollowAlert, isLikedSeedFollowAlert } from "@/lib/seedFollowAlerts";

type AlertFilter = "top-picks" | "all" | "today" | "this-week" | "liked" | "seen" | "archived" | "multi-follow" | "threshold-only";
const ALERT_FILTER_OPTIONS: AlertFilter[] = [
  "top-picks",
  "all",
  "today",
  "this-week",
  "liked",
  "multi-follow",
  "threshold-only",
  "seen",
  "archived",
];
const DEFAULT_ALERT_FILTER: AlertFilter = "top-picks";

function normalizeAlertFilter(value?: string | null): AlertFilter {
  return ALERT_FILTER_OPTIONS.includes(value as AlertFilter) ? (value as AlertFilter) : DEFAULT_ALERT_FILTER;
}

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

function seedLabel(seed: SeedFollowerAccount) {
  return seed.xHandle ? `${seed.name} (@${seed.xHandle})` : seed.name;
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isThisWeek(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const currentDay = now.getDay();
  const offsetToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - offsetToMonday);

  return date >= weekStart && date <= now;
}

function matchesFilter(alert: SeedFollowAlert, filter: AlertFilter, activeThreshold = 2) {
  const archived = isArchivedSeedFollowAlert(alert);
  if (filter === "top-picks") {
    return !archived && alert.currentSeedFollowerCount >= activeThreshold;
  }
  if (filter === "all") return !archived;
  if (filter === "today") {
    return !archived && isToday(alert.triggeredAt);
  }
  if (filter === "this-week") {
    return !archived && isThisWeek(alert.triggeredAt);
  }
  if (filter === "liked") {
    return !archived && isLikedSeedFollowAlert(alert);
  }
  if (filter === "seen" || filter === "archived") {
    return filter === "archived" ? archived : (alert.status || "").toLowerCase() === filter;
  }
  if (filter === "multi-follow") {
    return !archived && alert.currentSeedFollowerCount >= activeThreshold + 1;
  }
  if (filter === "threshold-only") {
    return !archived && alert.currentSeedFollowerCount === (alert.alertThreshold ?? activeThreshold);
  }
  return true;
}

function filterLabel(filter: AlertFilter, activeThreshold = 2) {
  switch (filter) {
    case "top-picks":
      return "Qualified";
    case "all":
      return "All";
    case "today":
      return "Today";
    case "this-week":
      return "This Week";
    case "liked":
      return "Liked";
    case "seen":
      return "Seen";
    case "archived":
      return "Archived";
    case "multi-follow":
      return "Multi Follow";
    case "threshold-only":
      return `${activeThreshold} Seeds`;
    default:
      return filter;
  }
}

function AlertLogRow({
  alert,
  onPromote,
  onToggleLike,
  onArchive,
  onRestore,
  busy,
  rank,
}: {
  alert: SeedFollowAlert;
  onPromote: (alert: SeedFollowAlert) => void;
  onToggleLike: (alert: SeedFollowAlert) => void;
  onArchive: (alert: SeedFollowAlert) => void;
  onRestore: (alert: SeedFollowAlert) => void;
  busy: boolean;
  rank?: number;
}) {
  const triggerThreshold = alert.alertThreshold ?? 2;
  const triggeringSeeds = alert.triggeringSeedAccounts.slice(0, triggerThreshold);
  const laterSeeds = Math.max(0, alert.currentSeedFollowerCount - triggeringSeeds.length);
  const archived = isArchivedSeedFollowAlert(alert);
  const liked = isLikedSeedFollowAlert(alert);

  return (
    <Card className="rounded-lg border-border p-4 shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
              {rank ? <Sparkles className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {rank ? `#${rank}` : "Signal captured"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(alert.triggeredAt)}
            </span>
            {liked ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 font-medium text-rose-700">
                <Heart className="h-3.5 w-3.5 fill-current" />
                Liked
              </span>
            ) : null}
          </div>

          <h2 className="mt-3 truncate text-xl font-medium">{alert.displayName}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            New person followed by {triggeringSeeds.map(seedLabel).join(" + ") || `${triggerThreshold} tracked seed accounts`}.
            {laterSeeds > 0 ? ` ${laterSeeds} additional tracked account${laterSeeds === 1 ? "" : "s"} followed later.` : ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {triggeringSeeds.map((seed) => (
              <span key={seed.id} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                {seedLabel(seed)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {archived ? (
            <Button type="button" variant="outline" size="sm" className="rounded-md" disabled={busy} onClick={() => onRestore(alert)}>
              Restore <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant={liked ? "default" : "outline"}
                size="sm"
                className="rounded-md"
                disabled={busy}
                onClick={() => onToggleLike(alert)}
              >
                {liked ? "Liked" : "Like"} <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-md" disabled={busy} onClick={() => onArchive(alert)}>
                Dismiss <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => onPromote(alert)}>
                Add to seed list <UserPlus className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
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
        </div>
      </div>
    </Card>
  );
}

export default function ActivitiesPage() {
  const { access } = useAccessState();
  const [searchParams, setSearchParams] = useSearchParams();
  const appSettings = useAppSettings(access.isAuthenticated);
  const alertsQuery = useSeedFollowAlerts(access.isAuthenticated);
  const updateAlertStatus = useUpdateSeedFollowAlertStatus();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<AlertFilter>(() => normalizeAlertFilter(searchParams.get("filter")));
  const [promotionAlert, setPromotionAlert] = useState<SeedFollowAlert | null>(null);
  const deferredQuery = useDeferredValue(query);
  const allAlerts = useMemo(() => (alertsQuery.data ?? []).filter(isActiveSeedFollowAlert), [alertsQuery.data]);
  const activeThreshold = appSettings.data?.seedFollowAlertThreshold ?? 2;

  useEffect(() => {
    setActiveFilter(normalizeAlertFilter(searchParams.get("filter")));
  }, [searchParams]);

  function selectFilter(filter: AlertFilter) {
    setActiveFilter(filter);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (filter === DEFAULT_ALERT_FILTER) {
          next.delete("filter");
        } else {
          next.set("filter", filter);
        }
        return next;
      },
      { replace: true },
    );
  }

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        ALERT_FILTER_OPTIONS.map((filter) => [
          filter,
          allAlerts.filter((alert) => matchesFilter(alert, filter, activeThreshold)).length,
        ]),
      ) as Record<AlertFilter, number>,
    [activeThreshold, allAlerts],
  );

  const alerts = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return [...allAlerts]
      .filter((alert) => matchesFilter(alert, activeFilter, activeThreshold))
      .filter((alert) => {
        if (!search) return true;
        return [
          alert.displayName,
          alert.xHandle,
          ...alert.triggeringSeedAccounts.map((seed) => `${seed.name} ${seed.xHandle ?? ""}`),
          ...alert.seedFollowers.map((seed) => `${seed.name} ${seed.xHandle ?? ""}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((left, right) => {
        if (activeFilter === "top-picks") {
          const countDiff = right.currentSeedFollowerCount - left.currentSeedFollowerCount;
          if (countDiff !== 0) return countDiff;
        }
        return new Date(right.triggeredAt || 0).getTime() - new Date(left.triggeredAt || 0).getTime();
      });
  }, [activeFilter, activeThreshold, allAlerts, deferredQuery]);

  const seedAccountCount = new Set(alerts.flatMap((alert) => alert.seedFollowers.map((seed) => seed.id))).size;

  return (
    <ProductGate
      title="Source History"
      description={`Raw seed-follow history behind the founder pipeline. Current threshold: ${activeThreshold}.`}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Raw source signals
            </div>
            <h1 className="text-3xl font-medium md:text-4xl">Seed-follow history</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Use this audit view only when you need the raw source trail behind the founder pipeline.
            </p>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {seedAccountCount} seed account{seedAccountCount === 1 ? "" : "s"} involved
            </div>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 shadow-sm lg:max-w-md">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people or seed accounts"
            className="h-auto border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {ALERT_FILTER_OPTIONS.map((filter) => {
            const isActive = filter === activeFilter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => selectFilter(filter)}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <span>{filterLabel(filter, activeThreshold)}</span>
                <span className={isActive ? "text-background/80" : "text-muted-foreground/80"}>{filterCounts[filter]}</span>
              </button>
            );
          })}
        </div>

        {alertsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-lg" />
            ))}
          </div>
        ) : alertsQuery.isError ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
            {String(alertsQuery.error || "Source history could not be loaded.")}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
            {activeFilter === "top-picks"
              ? `No qualified source signals at the ${activeThreshold}-seed threshold.`
              : "No qualified source signals yet. Run the agent pipeline or seed scan to start building this history."}
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <AlertLogRow
                key={alert.id}
                alert={alert}
                onPromote={setPromotionAlert}
                onToggleLike={(target) =>
                  updateAlertStatus.mutate({
                    alertId: target.id,
                    status: isLikedSeedFollowAlert(target) ? "new" : "liked",
                  })
                }
                onArchive={(target) => updateAlertStatus.mutate({ alertId: target.id, status: "archived" })}
                onRestore={(target) => updateAlertStatus.mutate({ alertId: target.id, status: "new" })}
                busy={updateAlertStatus.isPending}
                rank={activeFilter === "top-picks" ? index + 1 : undefined}
              />
            ))}
          </div>
        )}
        <SeedPromotionDialog
          alert={promotionAlert}
          open={Boolean(promotionAlert)}
          onOpenChange={(open) => {
            if (!open) setPromotionAlert(null);
          }}
        />
      </div>
    </ProductGate>
  );
}
