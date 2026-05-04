export type IdentityPlatform = "x" | "github" | "linkedin";
export type ActivityPlatform = IdentityPlatform | "system";
export type EventType =
  | "vc_follow"
  | "repo_traction"
  | "viral_repo"
  | "star_milestone"
  | "big_tech_exit"
  | "launch"
  | "mention"
  | "important_github_follower"
  | "linkedin_interaction";
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

export interface GithubRepoSnapshot {
  id: string;
  personId: string;
  repoOwner: string;
  repoName: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  starDelta7d: number;
  starDelta30d: number;
  snapshotDate: string;
}

export interface GithubSignalProfile {
  personId: string;
  primaryRepoLabel: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  starDelta7d: number;
  starDelta30d: number;
  snapshotDate: string | null;
  weeklyEventCount: number;
  recentGithubEvents: number;
  githubAttentionScore: number;
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
  githubProfile?: GithubSignalProfile | null;
}

export interface WatchlistPerson extends TrackedPerson {
  identities: PersonIdentity[];
  signalsThisWeek: number;
  vcFollowersThisWeek: number;
  githubMomentum: number;
  bigTechExit: boolean;
  importantGithubFollowers: number;
  githubProfile?: GithubSignalProfile | null;
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
  graphSource: "snapshot" | "event";
  firstObservedAt?: string | null;
  isRecent?: boolean;
  followerCount?: number;
}

export interface WatchlistData {
  selectedVcs: UserVcWatchlistItem[];
  people: WatchlistPerson[];
}

export interface ObservedGithubPerson {
  id: string;
  sourceTrackedPersonId: string | null;
  relationshipType: "follower" | "following";
  githubUsername: string;
  name: string;
  profileUrl: string;
  avatarUrl?: string | null;
  bio: string;
  company: string;
  location: string;
  blogUrl?: string | null;
  twitterHandle?: string | null;
  followersCount: number;
  followingCount: number;
  publicReposCount: number;
  indicatorCount: number;
  indicators: Array<{ kind: string; value: string | number }>;
  canAddToWatchlist: boolean;
  addedToWatchlist: boolean;
}

export interface GraphData {
  vcs: VcSource[];
  people: TrackedPerson[];
  events: ActivityEvent[];
  weeklyPicks: WeeklyPick[];
  edges: GraphEdge[];
  graphSource: "snapshot" | "event" | "empty";
  filteredConnectionCount: number;
}
