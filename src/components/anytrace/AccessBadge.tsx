import { Layers3 } from "lucide-react";

export function AccessBadge() {
  return (
    <div className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border bg-surface-sunken text-[11px] text-muted-foreground">
      <Layers3 className="h-3 w-3 text-foreground" />
      Frontend only
    </div>
  );
}
