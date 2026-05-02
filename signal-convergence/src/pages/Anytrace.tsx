import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import anytraceLogo from "@/assets/anytrace-logo.png";
import { ExternalLink } from "lucide-react";

export default function Anytrace() {
  return (
    <div className="px-4 md:px-8 py-10 max-w-4xl mx-auto">
      <div className="mb-10">
        <img
          src={anytraceLogo}
          alt="Anytrace logo"
          className="h-20 w-auto object-contain mb-6 [filter:invert(1)_brightness(0.15)] dark:[filter:none]"
        />
        <h2 className="font-serif text-5xl leading-[1.05]">
          Anytrace
        </h2>
        <p className="text-sm text-muted-foreground mt-4 max-w-2xl leading-relaxed">
          Anytrace helps venture investors spot founders early by turning public
          activity across LinkedIn, X, and GitHub into evidence-backed convergence
          signals from trusted operators, angels, and founders.
        </p>
      </div>

      <EmailInput />

      <a
        href="https://dynamic-investment.lovable.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-4 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
      >
        Anytrace.inc
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}

function EmailInput() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.alertRule();
        if (cancelled) return;
        setEmail(r.rule.notify_email ?? "");
      } catch (err) {
        console.error("alertRule fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const validate = (val: string): string | null => {
    if (val === "") return null;
    if (!val.includes("@") || !val.includes(".")) return "Enter a valid email address";
    return null;
  };

  const onSave = async () => {
    const trimmed = email.trim();
    const err = validate(trimmed);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await api.updateAlertRule({ notify_email: trimmed === "" ? null : trimmed });
      toast.success("Email saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save email");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2 max-w-xl">
      <Input
        type="email"
        placeholder="vc@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading || saving}
        className="flex-1"
      />
      <Button onClick={onSave} disabled={loading || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
