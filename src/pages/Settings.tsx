import { DatabaseZap, Github, Layers3, Loader2, RefreshCcw, ShieldOff, Sparkles, Trash2, Twitter } from "lucide-react";
import {
  useGithubScanEndpoint,
  useRefreshAnytraceData,
  useResetActivities,
  useRunFullPipeline,
  useRunGithubScan,
  useRunIdentityMatch,
  useRunTwitterScrape,
  useTwitterScrapeEndpoint,
} from "@/hooks/useAnytrace";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
  const runTwitterScrape = useRunTwitterScrape();
  const runGithubScan = useRunGithubScan();
  const runIdentityMatch = useRunIdentityMatch();
  const runFullPipeline = useRunFullPipeline();
  const resetActivities = useResetActivities();
  const refreshAnytraceData = useRefreshAnytraceData();
  const twitterScrapeEndpoint = useTwitterScrapeEndpoint();
  const githubScanEndpoint = useGithubScanEndpoint();
  const lastRun = runTwitterScrape.data;
  const lastGithubRun = runGithubScan.data;

  return (
    <ProductGate title="Settings">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
        <div className="mb-10">
          <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Hier kannst du den aktuellen Projektzustand sehen und X- sowie GitHub-Scans aus dem Frontend anstoßen.
          </p>
        </div>

        <div className="grid gap-4">
          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <h3 className="mb-4 text-base font-medium">Current state</h3>
            <InfoRow icon={DatabaseZap} label="Backend" value="Local Anytrace API or custom endpoint" />
            <InfoRow icon={ShieldOff} label="Access" value="Direct local mode" />
            <InfoRow icon={Trash2} label="Fallback data" value="Entfernt" />
            <InfoRow icon={Layers3} label="Frontend mode" value="Supabase + local scan triggers" />
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-medium">Backend controls</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Sobald `python -m backend.main serve-api` laeuft, kannst du hier alles direkt im Frontend ausloesen und die Daten danach sofort neu laden.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => runFullPipeline.mutate()}
                  disabled={runFullPipeline.isPending}
                  className="rounded-full"
                >
                  {runFullPipeline.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Run full pipeline
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => runIdentityMatch.mutate()}
                  disabled={runIdentityMatch.isPending}
                  className="rounded-full"
                >
                  {runIdentityMatch.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Run identity match
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => refreshAnytraceData.mutate()}
                  disabled={refreshAnytraceData.isPending}
                  className="rounded-full"
                >
                  {refreshAnytraceData.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reloading...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="h-4 w-4" />
                      Reload data
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resetActivities.mutate()}
                  disabled={resetActivities.isPending}
                  className="rounded-full"
                >
                  {resetActivities.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Reset activities
                    </>
                  )}
                </Button>
              </div>

              {runFullPipeline.isError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {(runFullPipeline.error as Error)?.message || "Die Pipeline konnte nicht gestartet werden."}
                </div>
              )}

              {runIdentityMatch.isError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {(runIdentityMatch.error as Error)?.message || "Der Identity-Match-Run konnte nicht gestartet werden."}
                </div>
              )}

              {refreshAnytraceData.isError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {(refreshAnytraceData.error as Error)?.message || "Die Daten konnten nicht neu geladen werden."}
                </div>
              )}

              {resetActivities.isError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {(resetActivities.error as Error)?.message || "Activities konnten nicht zurueckgesetzt werden."}
                </div>
              )}

              {runIdentityMatch.data && (
                <div className="rounded-2xl border border-border bg-surface-sunken/40 px-4 py-3 text-sm text-muted-foreground">
                  {runIdentityMatch.data.count ?? 0} Identity-Matches verarbeitet.
                </div>
              )}

              {runFullPipeline.data && (
                <div className="rounded-2xl border border-border bg-surface-sunken/40 px-4 py-3 text-sm text-muted-foreground">
                  Pipeline status: {runFullPipeline.data.status || "completed"}
                </div>
              )}

              {resetActivities.data?.message && (
                <div className="rounded-2xl border border-border bg-surface-sunken/40 px-4 py-3 text-sm text-muted-foreground">
                  {resetActivities.data.message}
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h3 className="text-base font-medium">Manual X scan</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Startet deinen X API Scan per Button. Standardmaessig wird dein lokales Backend unter `http://127.0.0.1:8766/run-twitter` verwendet.
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Endpoint: {twitterScrapeEndpoint || "nicht konfiguriert"}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => runTwitterScrape.mutate()}
                disabled={runTwitterScrape.isPending}
                className="rounded-full"
              >
                {runTwitterScrape.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Twitter className="h-4 w-4" />
                    Run X scan
                  </>
                )}
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface-sunken/40 px-4 py-3 text-sm text-muted-foreground">
              Starte dafuer lokal `python -m backend.main serve-api`. Optional kannst du mit `VITE_ANYTRACE_BACKEND_URL` oder `VITE_TWITTER_SCRAPE_URL` einen anderen Endpoint ueberschreiben.
            </div>

            {runTwitterScrape.isError && (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {(runTwitterScrape.error as Error)?.message || "Der X-Scan konnte nicht gestartet werden."}
              </div>
            )}

            {lastRun && (
              <div className="mt-4 rounded-2xl border border-border bg-surface-sunken/40 px-4 py-4">
                <div className="text-sm font-medium">
                  {lastRun.count} VC{lastRun.count === 1 ? "" : "s"} processed
                </div>
                <div className="mt-3 grid gap-3">
                  {lastRun.results?.map((result) => (
                    <div key={result.vc_name} className="rounded-2xl bg-background px-4 py-3 text-sm">
                      <div className="font-medium">{result.vc_name}</div>
                      <div className="mt-1 text-muted-foreground">
                        {result.new_snapshot_count} neue Handles / {result.matched_candidate_count} Candidate-Matches / {result.stopped_early ? "Early stop" : "Full pass"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {result.baseline_run ? "Baseline run" : "Incremental run"} / {result.output_file}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h3 className="text-base font-medium">Manual GitHub scan</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Startet deinen GitHub API Scan per Button. Standardmaessig wird dein lokales Backend unter `http://127.0.0.1:8766/run-github` verwendet.
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Endpoint: {githubScanEndpoint || "nicht konfiguriert"}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => runGithubScan.mutate()}
                disabled={runGithubScan.isPending}
                className="rounded-full"
              >
                {runGithubScan.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4" />
                    Run GitHub scan
                  </>
                )}
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface-sunken/40 px-4 py-3 text-sm text-muted-foreground">
              Starte dafuer lokal `python -m backend.main serve-api`. Optional kannst du mit `VITE_ANYTRACE_BACKEND_URL` oder `VITE_GITHUB_SCAN_URL` einen anderen Endpoint ueberschreiben.
            </div>

            {runGithubScan.isError && (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {(runGithubScan.error as Error)?.message || "Der GitHub-Scan konnte nicht gestartet werden."}
              </div>
            )}

            {lastGithubRun && (
              <div className="mt-4 rounded-2xl border border-border bg-surface-sunken/40 px-4 py-4">
                <div className="text-sm font-medium">
                  {lastGithubRun.scanned_people ?? lastGithubRun.count ?? 0} people scanned
                  {typeof lastGithubRun.scanned_repos === "number" ? ` / ${lastGithubRun.scanned_repos} repos` : ""}
                  {typeof lastGithubRun.viral_repo_count === "number" ? ` / ${lastGithubRun.viral_repo_count} viral repos` : ""}
                </div>
                {lastGithubRun.results?.length ? (
                  <div className="mt-3 grid gap-3">
                    {lastGithubRun.results.map((result, index) => (
                      <div key={`${result.person_name || result.repo || "github"}-${index}`} className="rounded-2xl bg-background px-4 py-3 text-sm">
                        <div className="font-medium">{result.person_name || result.repo || "GitHub result"}</div>
                        <div className="mt-1 text-muted-foreground">
                          {result.status || "ok"}
                          {typeof result.stars === "number" ? ` / ${result.stars} stars` : ""}
                          {typeof result.star_delta_7d === "number" ? ` / ${result.star_delta_7d} 7d delta` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </div>
    </ProductGate>
  );
}
