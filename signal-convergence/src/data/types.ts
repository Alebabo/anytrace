export type SignalPlatform = "twitter" | "linkedin" | "github";
export type SignalAction =
  | "followed"
  | "connected"
  | "starred"
  | "forked"
  | "mentioned"
  | "replied"
  | "endorsed";

export type InvestorTier = "angel" | "microvc" | "vc";

export interface Investor {
  id: string;
  name: string;
  title: string;
  firm?: string;
  tier: InvestorTier;
  avatarColor: string; // hsl tuple e.g. "243 84% 60%"
  linkedinUrl?: string;
  twitterHandle?: string;
  githubUsername?: string;
  group: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US", "DE", "UK" */
  country?: string;
  /** Optional list of industries the investor focuses on */
  industries?: string[];
}

export interface Signal {
  id: string;
  investorId: string;
  platform: SignalPlatform;
  action: SignalAction;
  /** Human readable target, e.g. "starred gpt-engineer/gpt-engineer" */
  target: string;
  /** Verifiable URL — clickable for hard evidence */
  url: string;
  /** ISO date */
  occurredAt: string;
}

export interface Founder {
  id: string;
  name: string;
  headline: string;
  location: string;
  company?: string;
  companyUrl?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  githubUsername?: string;
  initials: string;
  avatarColor: string;
}

export interface ConvergenceAlert {
  id: string;
  founder: Founder;
  signals: Signal[];
  /** Window in days the convergence was detected within */
  windowDays: number;
  /** ISO date when alert was triggered */
  triggeredAt: string;
  meta?: ConvergenceMeta;
}

export interface ConvergenceMeta {
  score: number;
  scoreBreakdown: {
    distinct_members: number;
    recency: number;
    member_quality: number;
  };
  rank: number;
  distinctMembers: number;
  firstSignalAt: string | null;
  lastSignalAt: string | null;
  signalTypeCounts: { [signalType: string]: number };
  windowStart: string | null;
  windowEnd: string | null;
}

export interface AlertRule {
  minDistinctMembers: number;
  windowDays: number;
  signalTypes: string[];
  weights: {
    distinct_members: number;
    recency: number;
    member_quality: number;
  };
  // Email digest config (M12-email)
  notify_email?: string | null;
  notify_enabled?: boolean;
  notify_daily_cap?: number;
  notify_min_score?: number;
  notify_min_confidence?: number;
  notify_classifications?: string[];
}

export interface NotifierStatus {
  currently_running: boolean;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: string | null;
  sent: boolean;
  skipped_reason: string | null;
  dossier_count: number;
  item_summaries: string[];
  provider_message_id: string | null;
}

export interface AlertRuleResponse {
  rule: AlertRule;
  allowed: {
    signalTypes: string[];
    minDistinctMembersRange: [number, number];
    windowDaysRange: [number, number];
  };
}

// ===== Dossier types (M9.5) =====

export type DossierClassification =
  | "founder"
  | "investor"
  | "operator"
  | "unclear"
  | "not_relevant";

export type DossierStatus =
  | "draft"
  | "ready_to_send"
  | "sent"
  | "rejected"
  | "failed";

export interface DossierKeySignal {
  claim: string;
  supporting_url: string;
}

export interface DossierIdentity {
  platform: string;
  handle: string;
  profile_url: string;
}

export interface DossierTargetPerson {
  canonical_id: string;
  display_name: string;
  role_tags: string[];
  identities: DossierIdentity[];
}

export interface DossierGitHubProfile {
  handle: string;
  profile_url: string;
  bio?: string;
  location?: string;
  company?: string;
  followers?: number;
  following?: number;
  public_repos?: number;
}

export interface DossierOwnedRepo {
  full_name: string;
  html_url: string;
  stars: number;
  language: string;
  description: string;
}

export interface DossierTwitterProfile {
  handle: string;
  profile_url: string;
  display_name?: string;
  followers_count?: number;
  following_count?: number;
  verified?: boolean;
}

export interface DossierTweet {
  id: string;
  text: string;
  created_at: string;
  url: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  view_count: number;
}

export interface DossierConvergenceEvidence {
  event_id: string;
  distinct_member_count: number;
  score: number;
  window_start: string;
  window_end: string;
  signal_type_counts: Record<string, number>;
  // Loose shape — backend returns raw rows; we render permissively.
  evidence_rows: Array<Record<string, unknown>>;
}

export interface DossierCrossPlatformFollower {
  platform: string;
  canonical_id: string;
  display_name: string;
}

export interface DossierKbMatch {
  is_known: boolean;
  investor_type?: string | null;
  country?: string | null;
  sector_tags: string[];
  role_tags: string[];
}

export interface DossierEvidenceBundle {
  target_person: DossierTargetPerson;
  github_profile: DossierGitHubProfile | null;
  owned_repos: DossierOwnedRepo[];
  twitter_profile: DossierTwitterProfile | null;
  recent_tweets: DossierTweet[];
  convergence_evidence: DossierConvergenceEvidence | null;
  cross_platform_followers: DossierCrossPlatformFollower[];
  kb_match: DossierKbMatch;
}

export interface Dossier {
  id: string;
  target_person_id: string;
  target_name: string;
  user_id: string;
  classification: DossierClassification;
  confidence: number;
  narrative: string;
  key_signals: DossierKeySignal[];
  recommended_action: string;
  cross_check_kb: {
    is_known_investor: boolean;
    investor_type: string | null;
    agreement_with_kb: "agree" | "disagree" | "kb_silent";
  };
  kb_cross_match_kind: "known_investor" | "unknown";
  status: DossierStatus;
  evidence_bundle: DossierEvidenceBundle | null;
  evidence_bundle_hash: string;
  generated_at: string;
  llm_model: string;
  triggering_event_ids: string[];
  feedback_count?: number;
  rejected_at?: string | null;
}

export interface DossierSummary {
  id: string;
  target_person_id: string;
  target_name: string;
  classification: DossierClassification;
  confidence: number;
  status: DossierStatus;
  generated_at: string;
}

// ===== Dossier feedback (M9.5.5) =====

export type FeedbackVerdict =
  | "correct"
  | "wrong_classification"
  | "wrong_target"
  | "spam"
  | "low_priority";

export type CorrectedClassification =
  | "founder"
  | "investor"
  | "operator"
  | "unclear"
  | "not_relevant";

export interface DossierFeedback {
  id: string;
  dossier_id: string;
  target_person_id: string;
  user_id: string;
  verdict: FeedbackVerdict;
  corrected_classification: string | null;
  notes: string | null;
  submitted_at: string;
  side_effect: "dossier_status_changed_to_rejected" | null;
}

export interface FeedbackSubmission {
  verdict: FeedbackVerdict;
  corrected_classification?: CorrectedClassification;
  notes?: string;
}

export interface FeedbackResult {
  id: string;
  dossier_id: string;
  verdict: FeedbackVerdict;
  submitted_at: string;
  side_effect: string | null;
  new_dossier_status: string | null;
}
