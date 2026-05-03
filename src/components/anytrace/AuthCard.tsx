import { Layers3, Sparkles } from "lucide-react";

export function AuthCard() {
  return (
    <div className="max-w-xl rounded-[28px] border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-indigo-soft text-foreground">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="font-serif text-3xl leading-tight">Anytrace workspace</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Die Oberfläche nutzt jetzt Supabase für erste Live-Daten und kann den X-Scraper manuell triggern.
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-surface-sunken px-4 py-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Layers3 className="h-4 w-4" />
          Status
        </div>
        <p className="mt-2 leading-relaxed">
          Wenn keine Daten erscheinen, prüfe zuerst `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` und deine RLS-Regeln.
        </p>
      </div>
    </div>
  );
}
