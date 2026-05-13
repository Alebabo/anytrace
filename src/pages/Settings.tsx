import { useEffect, useState } from "react";
import { BellRing, DatabaseZap, Layers3, RefreshCcw, Save, ShieldOff, Trash2 } from "lucide-react";
import { useAppSettings, useRefreshAnytraceData, useResetActivities, useUpdateAppSettings } from "@/hooks/useAnytrace";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DatabaseZap;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-3 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <span className="text-right text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const appSettings = useAppSettings();
  const updateAppSettings = useUpdateAppSettings();
  const resetActivities = useResetActivities();
  const refreshAnytraceData = useRefreshAnytraceData();
  const [thresholdDraft, setThresholdDraft] = useState(2);

  useEffect(() => {
    if (appSettings.data?.seedFollowAlertThreshold) {
      setThresholdDraft(appSettings.data.seedFollowAlertThreshold);
    }
  }, [appSettings.data?.seedFollowAlertThreshold]);

  const savedThreshold = appSettings.data?.seedFollowAlertThreshold ?? 2;
  const hasThresholdChanges = thresholdDraft !== savedThreshold;
  const saveThreshold = () => {
    updateAppSettings.mutate({ seedFollowAlertThreshold: thresholdDraft });
  };

  return (
    <ProductGate title="Settings">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
        <div className="mb-10">
          <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Dieses Projekt lädt Daten bevorzugt aus dem lokalen Backend und nutzt Seed-Daten nur als Fallback, wenn das Backend kurz nicht erreichbar ist.
          </p>
        </div>

        <div className="grid gap-4">
          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <div className="flex flex-col gap-5">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  <BellRing className="h-3.5 w-3.5" />
                  Alert logic
                </div>
                <h3 className="text-base font-medium">Seed-follow threshold</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Neue Alerts entstehen, sobald eine entdeckte Person von mindestens dieser Anzahl kuratierter Seed-Accounts gefolgt wird. Bestehende Alerts bleiben als Historie erhalten.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-surface-sunken/30 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="seed-follow-threshold">Minimum seed followers</Label>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Aktuell gespeichert: {savedThreshold} Seed-Accounts. Empfehlung fuer V1: 2.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      id="seed-follow-threshold"
                      type="number"
                      min={2}
                      max={10}
                      value={thresholdDraft}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        if (Number.isFinite(nextValue)) {
                          setThresholdDraft(Math.max(2, Math.min(10, nextValue)));
                        }
                      }}
                      className="w-24 rounded-xl text-center text-lg font-medium"
                    />
                    <span className="text-sm text-muted-foreground">Seeds</span>
                  </div>
                </div>

                <Slider
                  value={[thresholdDraft]}
                  min={2}
                  max={10}
                  step={1}
                  onValueChange={(value) => setThresholdDraft(value[0] ?? 2)}
                  className="mt-5"
                />

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Niedriger = mehr Discovery, hoeher = weniger Rauschen.
                  </div>
                  <Button
                    type="button"
                    onClick={saveThreshold}
                    disabled={!hasThresholdChanges || updateAppSettings.isPending}
                    className="rounded-full"
                  >
                    <Save className="h-4 w-4" />
                    Save threshold
                  </Button>
                </div>

                {updateAppSettings.isError ? (
                  <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {(updateAppSettings.error as Error)?.message || "Der Threshold konnte nicht gespeichert werden."}
                  </div>
                ) : null}

                {updateAppSettings.data ? (
                  <div className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    Threshold gespeichert. {updateAppSettings.data.backfillStats?.alertsCreated ?? 0} zusaetzliche Alerts aus vorhandenen Beobachtungen erzeugt.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <h3 className="mb-4 text-base font-medium">Current state</h3>
            <InfoRow icon={DatabaseZap} label="Storage" value="Backend snapshot + local browser overlays" />
            <InfoRow icon={ShieldOff} label="Auth" value="Local access only" />
            <InfoRow icon={Layers3} label="Frontend mode" value="Backend-first with seed fallback" />
            <InfoRow icon={Trash2} label="Reset action" value="Deletes local additions, then refetches the latest data" />
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-medium">Local workspace controls</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  `Reload data` fragt das Backend erneut ab und aktualisiert danach die lokale Ansicht. `Reset local workspace` löscht nur manuelle Browser-Ergänzungen und lädt anschließend den aktuellen Datenstand neu.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => refreshAnytraceData.mutate()}
                  disabled={refreshAnytraceData.isPending}
                  className="rounded-full"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reload data
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resetActivities.mutate()}
                  disabled={resetActivities.isPending}
                  className="rounded-full"
                >
                  <Trash2 className="h-4 w-4" />
                  Reset local workspace
                </Button>
              </div>

              {refreshAnytraceData.isError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {(refreshAnytraceData.error as Error)?.message || "Die Daten konnten nicht neu geladen werden."}
                </div>
              )}

              {resetActivities.isError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {(resetActivities.error as Error)?.message || "Der lokale Workspace konnte nicht zurückgesetzt werden."}
                </div>
              )}

              {resetActivities.data?.message && (
                <div className="rounded-2xl border border-border bg-surface-sunken/40 px-4 py-3 text-sm text-muted-foreground">
                  {resetActivities.data.message}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </ProductGate>
  );
}
