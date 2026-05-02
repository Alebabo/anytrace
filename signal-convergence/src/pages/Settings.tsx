import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

const STORAGE_KEY = "anytrace.settings.v1";

interface SettingsState {
  threshold: number;
  windowDays: number;
  sources: { tw: boolean; li: boolean; gh: boolean };
  email: string;
  instantAlert: boolean;
}

const DEFAULTS: SettingsState = {
  threshold: 2,
  windowDays: 14,
  sources: { tw: true, li: true, gh: true },
  email: "partner@fund.vc",
  instantAlert: true,
};

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export default function Settings() {
  const [state, setState] = useState<SettingsState>(DEFAULTS);
  const [initial, setInitial] = useState<SettingsState>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    setState(loaded);
    setInitial(loaded);
  }, []);

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setInitial(state);
      toast({
        title: "Settings saved",
        description: `Alerts trigger when ≥${state.threshold} investors converge within ${state.windowDays} days.`,
      });
    } catch (e) {
      toast({ title: "Could not save", description: "Storage unavailable.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setState(initial);
  };

  return (
    <div className="px-4 md:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-10">
        <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          Tune detection thresholds and notifications. Changes apply once you save.
        </p>
      </div>

      <Card className="border-border p-6 mb-4 rounded-3xl shadow-none">
        <h3 className="text-base font-medium tracking-tight mb-1">Convergence threshold</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Minimum number of distinct watchlist investors who must engage with a founder to trigger an alert.
        </p>
        <div className="flex items-center gap-4">
          <Slider
            value={[state.threshold]}
            onValueChange={(v) => setState((s) => ({ ...s, threshold: v[0] }))}
            min={2}
            max={6}
            step={1}
            className="flex-1"
          />
          <span className="font-serif text-3xl tabular-nums w-10 text-right leading-none">{state.threshold}</span>
        </div>
      </Card>

      <Card className="border-border p-6 mb-4 rounded-3xl shadow-none">
        <h3 className="text-base font-medium tracking-tight mb-3">Platform sources</h3>
        <p className="text-xs text-muted-foreground mb-4">Toggle the platforms we monitor for engagement signals.</p>
        <div className="space-y-3">
          {[
            { id: "tw" as const, label: "X / Twitter — follows, replies, mentions" },
            { id: "li" as const, label: "LinkedIn — connections, endorsements" },
            { id: "gh" as const, label: "GitHub — stars, forks, follows" },
          ].map((s) => (
            <div key={s.id} className="flex items-center justify-between py-1">
              <Label htmlFor={s.id} className="text-sm font-normal">
                {s.label}
              </Label>
              <Switch
                id={s.id}
                checked={state.sources[s.id]}
                onCheckedChange={(v) =>
                  setState((prev) => ({ ...prev, sources: { ...prev.sources, [s.id]: v } }))
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-border p-6 rounded-3xl shadow-none">
        <h3 className="text-base font-medium tracking-tight mb-3">Alert delivery</h3>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className="text-xs">
              Email digest
            </Label>
            <Input
              id="email"
              type="email"
              value={state.email}
              onChange={(e) => setState((s) => ({ ...s, email: e.target.value }))}
              className="h-10 rounded-full px-4"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="instant" className="text-sm font-normal">
              Instant alert when ≥ {state.threshold} angels converge
            </Label>
            <Switch
              id="instant"
              checked={state.instantAlert}
              onCheckedChange={(v) => setState((s) => ({ ...s, instantAlert: v }))}
            />
          </div>
        </div>
      </Card>

      <div className="mt-8 flex justify-end items-center gap-2">
        {dirty && (
          <span className="text-xs text-muted-foreground mr-auto">Unsaved changes</span>
        )}
        <Button variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
          Discard
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving} size="lg">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
