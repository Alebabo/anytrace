import { DatabaseZap, Layers3, ShieldOff, Trash2 } from "lucide-react";
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
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <span className="text-sm text-muted-foreground text-right">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="px-4 md:px-8 py-10 max-w-4xl mx-auto">
      <div className="mb-10">
        <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Diese Seite dokumentiert den aktuellen Reset-Zustand des Projekts nach dem vollständigen Entfernen des alten Backends.
        </p>
      </div>

      <div className="grid gap-4">
        <Card className="rounded-[28px] border-border p-6 shadow-none">
          <h3 className="text-base font-medium mb-4">Current state</h3>
          <InfoRow icon={DatabaseZap} label="Backend" value="Entfernt" />
          <InfoRow icon={ShieldOff} label="Auth" value="Entfernt" />
          <InfoRow icon={Trash2} label="Fallback data" value="Entfernt" />
          <InfoRow icon={Layers3} label="Frontend mode" value="Shell only" />
        </Card>

        <Card className="rounded-[28px] border-border p-6 shadow-none">
          <h3 className="text-base font-medium mb-4">What stays</h3>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <p>Routing, Layout und visuelle Komponenten bleiben als Grundlage erhalten.</p>
            <p>Alle datengetriebenen Ansichten laufen jetzt bewusst leer statt auf Seed-, Demo- oder Fallback-Daten.</p>
            <p>Damit können wir das neue Supabase-Modell sauber neu aufsetzen, ohne Altlasten mitzuschleppen.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
