export type IdentityPlatform = "x" | "github" | "linkedin";
export type ActivityPlatform = IdentityPlatform | "system";
export type EventType =
  | "vc_follow"
  | "repo_traction"
  | "big_tech_exit"
  | "launch"
  | "mention"
  | "important_github_follower";
export type VcTier = "angel" | "microvc" | "vc";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type WeeklyReasonKind =
  | "vc_follow_burst"
  | "repo_traction"
  | "big_tech_exit"
  | "important_github_followers";
export type SyncStatus = "idle" | "pending" | "ok" | "error";

export interface ViewerAccessState {
  isAuthenticated: boolean;
  canAccessProduct: boolean;
  requiresPayment: boolean;
  status: SubscriptionStatus | "signed_out";
  trialEndsAt: string | null;
  daysLeftInTrial: number | null;
}

export interface VcSource {
  id: string;
  slug: string;
  name: string;
  title: string;
  firm: string;
  sizeLabel?: string;
  sectorFocus?: string;
  tier: VcTier;
  region: string;
  country: string;
  city: string;
  xHandle?: string | null;
  twitterUrl?: string | null;
  xUserId?: string | null;
  linkedinUrl?: string | null;
  githubUsername?: string | null;
  websiteUrl?: string | null;
  notes: string;
  isSeeded: boolean;
  createdByUserId?: string | null;
  syncStatus?: SyncStatus | null;
  lastXSyncAt?: string | null;
  lastGithubSyncAt?: string | null;
  lastSyncError?: string | null;
}

export interface UserVcWatchlistItem {
  id: string;
  userId: string;
  vcSourceId: string;
  createdAt: string;
  vcSource: VcSource;
}

export interface VcSourceDraft {
  name: string;
  country: string;
  sizeLabel: string;
  sectorFocus: string;
  twitterUrl: string;
  linkedinUrl: string;
  title?: string;
  firm?: string;
  tier?: VcTier;
  city?: string;
  region?: string;
  xHandle?: string;
  githubUsername?: string;
  websiteUrl?: string;
  notes?: string;
}

export interface TrackedPerson {
  id: string;
  slug: string;
  fullName: string;
  roleTitle: string;
  company: string;
  location: string;
  summary: string;
  avatarUrl?: string | null;
  topPickNote: string;
  isWatchlist: boolean;
}

export interface PersonIdentity {
  id: string;
  personId: string;
  platform: IdentityPlatform;
  handle: string;
  profileUrl: string;
  isPrimary: boolean;
}

export interface ActivityEvent {
  id: string;
  personId: string;
  vcSourceId?: string | null;
  platform: ActivityPlatform;
  eventType: EventType;
  headline: string;
  description: string;
  sourceUrl: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
  eventFingerprint?: string | null;
}

export interface WeeklyPickReason {
  id: string;
  reasonKind: WeeklyReasonKind;
  title: string;
  detail: string;
  metricValue?: number | null;
  displayOrder: number;
  sourceEventId?: string | null;
}

export interface WeeklyPick {
  id: string;
  weekStart: string;
  rank: number;
  score: number;
  primaryReason: string;
  summary: string;
  vcFollowCount: number;
  githubAttentionScore: number;
  bigTechExit: boolean;
  person: TrackedPerson;
  reasons: WeeklyPickReason[];
}

export interface WatchlistPerson extends TrackedPerson {
  identities: PersonIdentity[];
  signalsThisWeek: number;
  vcFollowersThisWeek: number;
  githubMomentum: number;
  bigTechExit: boolean;
  importantGithubFollowers: number;
}

export interface GraphNode {
  id: string;
  kind: "vc" | "person";
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  platform: ActivityPlatform;
  eventCount: number;
  isTopPick: boolean;
  graphSource: "direct" | "fallback";
}

export interface WatchlistData {
  selectedVcs: UserVcWatchlistItem[];
  people: WatchlistPerson[];
}

export interface GraphData {
  vcs: VcSource[];
  people: TrackedPerson[];
  events: ActivityEvent[];
  weeklyPicks: WeeklyPick[];
  edges: GraphEdge[];
  hasSelectedVcs: boolean;
  graphSource: "direct" | "fallback" | "empty";
  orphanedEventCount: number;
}
