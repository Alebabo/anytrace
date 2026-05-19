import type { TriageResult } from "@/data/traqr";

export type SwarmNodeId = "x" | "linkedin" | "github" | "crunchbase" | "featherless";
export type SwarmNodeState = "idle" | "active" | "complete" | "error";

export interface SwarmStepResult {
  id: SwarmNodeId;
  ok: boolean;
  status?: string;
  error?: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface SwarmTriagePayload extends Record<string, unknown> {
  topPicks?: TriageResult[];
  results?: TriageResult[];
  hiddenCount?: number;
}

export function founderTopPicks(payload?: SwarmTriagePayload | null): TriageResult[] {
  const rows = payload?.topPicks ?? payload?.results ?? [];
  return rows.filter((result) => {
    const founderCategory =
      result.category === "potential_founder" ||
      result.category === "active_founder" ||
      result.category === "company_no_raise_yet";
    const actionable = result.decision === "reach_out_now" || result.decision === "research_more";
    return founderCategory && actionable;
  });
}

export function summarizeSwarmPayload(id: SwarmNodeId, payload: Record<string, unknown>): string {
  if (id === "x") {
    const processed = Number(payload.processed ?? 0);
    const matched = Number(payload.matchedCandidateCount ?? 0);
    const snapshots = Number(payload.newSnapshotCount ?? 0);
    return `${processed} seed sources scanned, ${snapshots} follows inspected, ${matched} known candidate matches.`;
  }
  if (id === "linkedin") {
    const enriched = Number(payload.enriched ?? 0);
    const skipped = Number(payload.skipped ?? 0);
    if (payload.status === "no_linkedin_urls") {
      return `${skipped} candidates checked, but no known LinkedIn URLs were available.`;
    }
    return `${enriched} LinkedIn profiles enriched, ${skipped} skipped.`;
  }
  if (id === "github") {
    const tracked = Number(payload.trackedCount ?? 0);
    const viral = Number(payload.viralRepoCount ?? 0);
    if (tracked === 0 && viral > 0) {
      return `No candidate-linked GitHub handles found; ${viral} live repo momentum events found.`;
    }
    return `${tracked} builder profiles refreshed, ${viral} repo momentum events found.`;
  }
  if (id === "crunchbase") {
    if (payload.ok === false) return String(payload.error || "Crunchbase configuration missing.");
    const enriched = Number(payload.enriched ?? 0);
    return `${enriched} Crunchbase company records attached.`;
  }

  const topPicks = founderTopPicks(payload as SwarmTriagePayload);
  return `${topPicks.length} founder top picks returned by Featherless.`;
}
