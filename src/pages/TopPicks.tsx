import { ArrowUpRight, Bell, Clock, Heart, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { SeedPromotionDialog } from "@/components/anytrace/SeedPromotionDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useAppSettings, useSeedFollowAlerts, useUpdateSeedFollowAlertStatus } from "@/hooks/useAnytrace";
import type { SeedFollowAlert } from "@/data/anytrace";
import { isLikedSeedFollowAlert, isVisibleSeedFollowAlert } from "@/lib/seedFollowAlerts";

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

function AlertPickCard({
  alert,
  rank,
  onPromote,
  onToggleLike,
  onDismiss,
  busy,
}: {
  alert: SeedFollowAlert;
  rank: number;
  onPromote: (alert: SeedFollowAlert) => void;
  onToggleLike: (alert: SeedFollowAlert) => void;
  onDismiss: (alert: SeedFollowAlert) => void;
  busy: boolean;
}) {
  const liked = isLikedSeedFollowAlert(alert);
  const triggerThreshold = alert.alertThreshold ?? 2;
  const triggerNames = alert.triggeringSeedAccounts
    .slice(0, triggerThreshold)
    .map((account) => account.name)
    .join(" + ");

  return (
    <Card className="rounded-lg border-border p-4 shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              #{rank}
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
            Followed by {triggerNames || "two tracked seed accounts"} and now at {alert.currentSeedFollowerCount} tracked seed-source follows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
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
          <Button type="button" variant="outline" size="sm" className="rounded-md" disabled={busy} onClick={() => onDismiss(alert)}>
            Dismiss <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => onPromote(alert)}>
            Add to seed list <UserPlus className="h-3.5 w-3.5" />
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
        </div>
      </div>
    </Card>
  );
}

export default function TopPicksPage() {
  const { access } = useAccessState();
  const appSettings = useAppSettings(access.isAuthenticated);
  const alertsQuery = useSeedFollowAlerts(access.isAuthenticated);
  const updateAlertStatus = useUpdateSeedFollowAlertStatus();
  const [promotionAlert, setPromotionAlert] = useState<SeedFollowAlert | null>(null);
  const activeThreshold = appSettings.data?.seedFollowAlertThreshold ?? 2;
  const alerts = [...(alertsQuery.data ?? [])]
    .filter(isVisibleSeedFollowAlert)
    .filter((alert) => alert.currentSeedFollowerCount >= activeThreshold)
    .sort((left, right) => {
      const countDiff = right.currentSeedFollowerCount - left.currentSeedFollowerCount;
      if (countDiff !== 0) return countDiff;
      return new Date(right.triggeredAt || 0).getTime() - new Date(left.triggeredAt || 0).getTime();
    });

  return (
    <ProductGate
      title="Top Picks"
      description={`People newly followed by at least ${activeThreshold} tracked seed accounts.`}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            Qualified alerts
          </div>
          <h1 className="text-3xl font-medium md:text-4xl">Top people to inspect now</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Sorted by how many curated seed sources already follow each new person, then by the alert time.
          </p>
        </div>

        <div className="mb-5 rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {alerts.length} person{alerts.length === 1 ? "" : "s"} have crossed the {activeThreshold}-seed-follow threshold.
          </div>
        </div>

        {alertsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-lg" />
            ))}
          </div>
        ) : alertsQuery.isError ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            {String(alertsQuery.error || "Could not load top picks.")}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
            No top picks yet. The first pick appears when {activeThreshold} curated seed accounts follow the same new person.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <AlertPickCard
                key={alert.id}
                alert={alert}
                rank={index + 1}
                onPromote={setPromotionAlert}
                onToggleLike={(target) =>
                  updateAlertStatus.mutate({
                    alertId: target.id,
                    status: isLikedSeedFollowAlert(target) ? "new" : "liked",
                  })
                }
                onDismiss={(target) => updateAlertStatus.mutate({ alertId: target.id, status: "archived" })}
                busy={updateAlertStatus.isPending}
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
