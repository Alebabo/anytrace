import { describe, expect, it } from "vitest";
import { founderTopPicks, summarizeSwarmPayload } from "@/lib/agentSwarm";
import type { TriageResult } from "@/data/traqr";

function result(overrides: Partial<TriageResult>): TriageResult {
  return {
    rank: 1,
    candidateId: "candidate",
    displayName: "Candidate",
    category: "potential_founder",
    decision: "research_more",
    score: 80,
    confidence: 70,
    whyNow: "why",
    missingContext: [],
    riskFlags: [],
    nextAction: "research",
    evidence: [],
    currentSeedFollowerCount: 3,
    ...overrides,
  };
}

describe("agent swarm helpers", () => {
  it("keeps only actionable founder top picks", () => {
    const picks = founderTopPicks({
      results: [
        result({ candidateId: "one", category: "potential_founder", decision: "reach_out_now" }),
        result({ candidateId: "two", category: "active_founder", decision: "watch" }),
        result({ candidateId: "three", category: "company_no_raise_yet", decision: "research_more" }),
      ],
    });

    expect(picks.map((pick) => pick.candidateId)).toEqual(["one", "three"]);
  });

  it("summarizes missing Crunchbase config without inventing data", () => {
    expect(
      summarizeSwarmPayload("crunchbase", {
        ok: false,
        error: "CRUNCHBASE_API_KEY is not configured",
      }),
    ).toContain("CRUNCHBASE_API_KEY");
  });
});
