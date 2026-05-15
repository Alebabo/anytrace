import demoSeedData from "@/data/demoSeedData.json";
import type {
  ActivityEvent,
  AnytraceAppSettings,
  GithubSignalProfile,
  GraphData,
  GraphEdge,
  LinkedInEnrichmentRun,
  PersonIdentity,
  SeedFollowAlert,
  TrackedPerson,
  TriageRun,
  VcSource,
  WeeklyPick,
} from "@/data/anytrace";

export type DemoSeedPayload = {
  version: string;
  vcSources: VcSource[];
  trackedPeople: TrackedPerson[];
  personIdentities: PersonIdentity[];
  activityEvents: ActivityEvent[];
  weeklyPicks: WeeklyPick[];
  seedFollowAlerts: SeedFollowAlert[];
  githubSignalProfiles: GithubSignalProfile[];
  graphEdges: GraphEdge[];
  graphSource: GraphData["graphSource"];
  appSettings: AnytraceAppSettings;
  triageRun: TriageRun;
};

export const demoPayload = demoSeedData as DemoSeedPayload;

export function getDemoTriageRun(): TriageRun {
  return {
    ...demoPayload.triageRun,
    rawCandidates: [...demoPayload.triageRun.rawCandidates],
    results: [...demoPayload.triageRun.results],
    agentLog: [...demoPayload.triageRun.agentLog],
  };
}

export function getDemoLinkedInRun(): LinkedInEnrichmentRun {
  const now = new Date().toISOString();
  return {
    ok: true,
    status: "completed",
    processed: demoPayload.triageRun.rawCandidates.length,
    enriched: demoPayload.triageRun.rawCandidates.length,
    skipped: 0,
    message: "Demo mode uses a pre-enriched static founder snapshot.",
    agentLog: [
      {
        stage: "demo",
        message: "Loaded pre-enriched LinkedIn and GitHub context from the public demo payload.",
        timestamp: now,
      },
    ],
  };
}
