import { Layers3, Sparkles } from "lucide-react";

export function AuthCard() {
  return (
    <div className="rounded-[28px] border border-border bg-card shadow-sm p-6 md:p-8 max-w-xl">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-indigo-soft text-foreground mb-5">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="font-serif text-3xl leading-tight">Frontend-only workspace</h2>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        Das bisherige Backend, die Authentifizierung und alle Seed- oder Fallback-Daten wurden entfernt.
        Diese Oberfläche ist jetzt bewusst nur noch die visuelle Basis für die nächste Logik.
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-surface-sunken px-4 py-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Layers3 className="h-4 w-4" />
          Status
        </div>
        <p className="mt-2 leading-relaxed">
          Sobald wir die neue Supabase-Struktur aufsetzen, können wir Datenmodell, Flows und Sync-Logik von hier aus neu aufbauen.
        </p>
      </div>
    </div>
  );
}
