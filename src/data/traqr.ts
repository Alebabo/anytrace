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
export type VcTier = "angel" | "microvc" | "vc" | "journalist";
export type VcAccountType = "firm" | "partner" | "analyst" | "scout" | "brand" | "journalist" | "other";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type WeeklyReasonKind =
  | "vc_follow_burst"
  | "repo_traction"
  | "big_tech_exit"
  | "important_github_followers";
export type SyncStatus = "idle" | "pending" | "ok" | "error";

export interface TraqrAppSettings {
  seedFollowAlertThreshold: number;
  seedScan?: SeedScanSummary | null;
}

export interface SeedScanSummary {
  latestRunAt?: string | null;
  latestSnapshotAt?: string | null;
  snapshotCount: number;
  scannedSeedCount?: number | null;
  observationCount: number;
  alertCount: number;
  latestAlertAt?: string | null;
}

export interface SeedScanStatus {
  status: "idle" | "queued" | "running" | "completed" | "error";
  startedAt?: string | null;
  completedAt?: string | null;
  limit?: number | null;
  count?: number;
  total?: number;
  remaining?: number;
  currentAccount?: string | null;
  currentHandle?: string | null;
  lastCompletedAccount?: string | null;
  failed?: number;
  skipped?: number;
  error?: string | null;
}

export interface SeedScanRun {
  ok?: boolean;
  status: SeedScanStatus["status"];
  message?: string;
  limit?: number;
  scanStatus?: SeedScanStatus;
  scanSummary?: SeedScanSummary;
}

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
  clusterId?: string | null;
  clusterName?: string | null;
  accountType?: VcAccountType | null;
  isPrimaryClusterAccount?: boolean;
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
  accountType?: VcAccountType;
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

export interface SeedFollowerAccount {
  id: string;
  name: string;
  xHandle?: string | null;
  accountType?: VcAccountType | string | null;
  tier?: number | string | null;
  profileUrl?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
}

export interface SeedFollowAlert {
  id: string;
  personId: string;
  displayName: string;
  xHandle?: string | null;
  primaryProfileUrl: string;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  linkedinHeadline?: string | null;
  linkedinRoleTitle?: string | null;
  linkedinCompany?: string | null;
  linkedinLocation?: string | null;
  linkedinEnrichedAt?: string | null;
  triggeredAt: string;
  alertThreshold?: number | null;
  triggeringSeedAccounts: SeedFollowerAccount[];
  seedFollowers: SeedFollowerAccount[];
  currentSeedFollowerCount: number;
  status: "new" | "seen" | "liked" | "archived" | string;
  promotedVcId?: string | null;
  promotedAt?: string | null;
}

export interface SeedFollowPromotionDraft {
  alertId: string;
  name: string;
  xHandle: string;
  linkedinUrl: string;
  clusterName: string;
  accountType: VcAccountType;
  tier: VcTier;
}

export type TriageCategory = "active_founder" | "potential_founder" | "company_no_raise_yet";
export type TriageDecision = "reach_out_now" | "research_more" | "watch" | "discard";
export type TriageStatus = "empty" | "completed" | "error";

export interface TriageEvidence {
  type: string;
  label: string;
  source?: string | null;
  observedAt?: string | null;
}

export interface TriageAgentLogEntry {
  stage: string;
  message: string;
  timestamp: string;
}

export interface TriageGithubRepo {
  repoLabel?: string | null;
  repoUrl?: string | null;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
  forks?: number | null;
  watchers?: number | null;
  starDelta7d?: number | null;
  starDelta30d?: number | null;
  snapshotDate?: string | null;
  pushedAt?: string | null;
}

export interface TriageGithubEvent {
  eventType?: string | null;
  title?: string | null;
  repoLabel?: string | null;
  scoreImpact?: number | null;
  sourceUrl?: string | null;
  occurredAt?: string | null;
}

export interface TriageGithubContext {
  handle?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  accountType?: string | null;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blogUrl?: string | null;
  followers?: number | null;
  publicRepos?: number | null;
  indicatorCount?: number | null;
  builderSignal?: string | null;
  topRepos?: TriageGithubRepo[];
  events?: TriageGithubEvent[];
}

export interface TriageCandidate {
  id: string;
  personId: string;
  displayName: string;
  xHandle?: string | null;
  xAvatarUrl?: string | null;
  avatarUrl?: string | null;
  primaryProfileUrl?: string | null;
  xBio?: string | null;
  xPublicFollowerCount?: number | null;
  xVerified?: boolean | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  linkedinHeadline?: string | null;
  linkedinRoleTitle?: string | null;
  linkedinCompany?: string | null;
  linkedinLocation?: string | null;
  githubContext?: TriageGithubContext | null;
  triggeredAt?: string | null;
  threshold: number;
  qualified: boolean;
  currentSeedFollowerCount: number;
  triggeringSeedAccounts?: SeedFollowerAccount[];
  seedFollowers?: SeedFollowerAccount[];
  evidence: TriageEvidence[];
}

export interface TriageResult {
  rank: number;
  candidateId: string;
  personId?: string | null;
  displayName: string;
  xHandle?: string | null;
  xAvatarUrl?: string | null;
  avatarUrl?: string | null;
  primaryProfileUrl?: string | null;
  xBio?: string | null;
  xPublicFollowerCount?: number | null;
  linkedinUrl?: string | null;
  linkedinHeadline?: string | null;
  linkedinRoleTitle?: string | null;
  linkedinCompany?: string | null;
  linkedinLocation?: string | null;
  githubUrl?: string | null;
  githubContext?: TriageGithubContext | null;
  category: TriageCategory;
  decision: TriageDecision;
  score: number;
  confidence: number;
  overview?: string | null;
  whyNow: string;
  missingContext: string[];
  riskFlags: string[];
  nextAction: string;
  evidence: TriageEvidence[];
  currentSeedFollowerCount: number;
}

export interface TriageRun {
  ok?: boolean;
  runId?: string;
  status: TriageStatus;
  provider?: string;
  model?: string | null;
  mode?: "live" | "mock";
  threshold: number;
  candidateCount?: number;
  candidateLimit?: number;
  scannedCandidateCount?: number;
  qualifiedCount?: number;
  rawCandidates: TriageCandidate[];
  results: TriageResult[];
  agentLog: TriageAgentLogEntry[];
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

export interface LinkedInEnrichmentRun {
  ok?: boolean;
  status: string;
  processed: number;
  enriched: number;
  skipped: number;
  message?: string;
  errors?: Array<Record<string, unknown>>;
  enrichedProfiles?: Array<Record<string, unknown>>;
  skippedProfiles?: Array<Record<string, unknown>>;
  agent_log?: TriageAgentLogEntry[];
  agentLog?: TriageAgentLogEntry[];
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
