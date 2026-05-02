export type SignalKind =
  | "Hackathon winner"
  | "Seed round"
  | "Pre-seed round"
  | "Publication"
  | "Open source traction"
  | "Product launch";
export type SignalConfidence = "high" | "medium" | "low";

export interface FeedSignal {
  id: string;
  kind: SignalKind;
  title: string;
  entity: string;
  summary: string;
  source: string;
  sourceUrl: string;
  observedAt: string;
  confidence: SignalConfidence;
  geography: string;
  tags: string[];
  evidence: string;
  whyItMatters: string;
  personName: string;
  personRole: string;
  company: string;
  imageUrl: string;
}

// Mock data removed — Signals are now loaded from Supabase via the ingest-signals function.

export const SIGNAL_KINDS: SignalKind[] = [
  "Hackathon winner",
  "Seed round",
  "Pre-seed round",
  "Publication",
  "Open source traction",
  "Product launch",
];
export const GEOGRAPHIES = ["All", "Global", "DE", "UK", "SE", "CZ", "NL", "CH", "US"] as const;
export const DATE_RANGES = ["24h", "7d", "30d", "All time"] as const;
export const CONFIDENCE_LEVELS: ("all" | SignalConfidence)[] = ["all", "high", "medium", "low"];
