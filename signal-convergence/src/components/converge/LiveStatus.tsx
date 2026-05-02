import { useHealth } from "@/hooks/useApi";
import { Loader2, Wifi, WifiOff } from "lucide-react";

export function LiveStatus() {
  const { data, isLoading, isError, dataUpdatedAt } = useHealth();
  const ago = dataUpdatedAt
    ? Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000))
    : 0;
  const tone: "live" | "loading" | "destructive" = isError
    ? "destructive"
    : data?.ok
    ? "live"
    : "loading";
  const label = isError ? "Offline" : data?.ok ? "Live" : "Connecting…";
  const Icon = isError ? WifiOff : isLoading ? Loader2 : Wifi;

  const toneClasses: Record<typeof tone, string> = {
    live: "border-success/40 bg-success/10 text-success",
    loading: "border-border bg-surface-sunken text-muted-foreground",
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  };

  return (
    <div
      className={`hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium tabular-nums transition-colors ${toneClasses[tone]}`}
      title={
        tone === "live"
          ? `Backend reachable. Last check ${ago}s ago.`
          : tone === "destructive"
          ? "Backend unreachable"
          : "Connecting to backend…"
      }
    >
      <span className="relative inline-flex items-center justify-center">
        <Icon
          className={`h-3 w-3 ${isLoading && tone !== "live" ? "animate-spin" : ""}`}
        />
        {tone === "live" && (
          <span className="absolute -inset-1 rounded-full bg-success/30 animate-ping" />
        )}
      </span>
      <span>{label}</span>
      {tone === "live" && (
        <span className="text-success/70">· {ago}s</span>
      )}
    </div>
  );
}