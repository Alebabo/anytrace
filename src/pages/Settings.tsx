import { DatabaseZap, Layers3, Loader2, PlayCircle, ShieldOff, Trash2 } from "lucide-react";
import { useRunTwitterScrape, useTwitterScrapeEndpoint } from "@/hooks/useAnytrace";
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
  const twitterScrapeEndpoint = useTwitterScrapeEndpoint();
  const lastRun = runTwitterScrape.data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <div className="mb-10">
        <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Hier kannst du den aktuellen Projektzustand sehen und den X-Scrape aus dem Frontend anstoßen.
        </p>
      </div>

      <div className="grid gap-4">
        <Card className="rounded-[28px] border-border p-6 shadow-none">
          <h3 className="mb-4 text-base font-medium">Current state</h3>
          <InfoRow icon={DatabaseZap} label="Backend" value="External scraper endpoint" />
          <InfoRow icon={ShieldOff} label="Auth" value="Noch nicht verdrahtet" />
          <InfoRow icon={Trash2} label="Fallback data" value="Entfernt" />
          <InfoRow icon={Layers3} label="Frontend mode" value="Supabase + external scraper trigger" />
        </Card>

        <Card className="rounded-[28px] border-border p-6 shadow-none">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-base font-medium">Manual X scrape</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Startet deinen externen Python-Scraper per `POST` auf die in `VITE_TWITTER_SCRAPE_URL` konfigurierte URL.
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Endpoint: {twitterScrapeEndpoint || "nicht konfiguriert"}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => runTwitterScrape.mutate()}
              disabled={runTwitterScrape.isPending || !twitterScrapeEndpoint}
              className="rounded-full"
            >
              {runTwitterScrape.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Run X scrape
                </>
              )}
            </Button>
          </div>

          {!twitterScrapeEndpoint && (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              Setze `VITE_TWITTER_SCRAPE_URL`, damit der Button einen externen Scraper triggern kann.
            </div>
          )}

          {runTwitterScrape.isError && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {(runTwitterScrape.error as Error)?.message || "Der X-Scrape konnte nicht gestartet werden."}
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
      </div>
    </div>
  );
}
