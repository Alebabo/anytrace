import { Lock, Sparkles } from "lucide-react";
import { useAccessState } from "@/hooks/useAnytrace";

export function AccessBadge() {
  const { access, demoMode } = useAccessState();

  if (demoMode) {
    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border bg-surface-sunken text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3 text-foreground" />
        Demo mode
      </div>
    );
  }

  if (!access.isAuthenticated) {
    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border bg-surface-sunken text-[11px] text-muted-foreground">
        Signed out
      </div>
    );
  }

  if (access.requiresPayment) {
    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-destructive/30 bg-destructive/10 text-[11px] text-destructive">
        <Lock className="h-3 w-3" />
        Billing required
      </div>
    );
  }

  return (
    <div className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border bg-surface-sunken text-[11px] text-muted-foreground">
      <Sparkles className="h-3 w-3 text-foreground" />
      {access.status === "active"
        ? "Active"
        : `Trial${access.daysLeftInTrial != null ? ` · ${access.daysLeftInTrial}d left` : ""}`}
    </div>
  );
}
