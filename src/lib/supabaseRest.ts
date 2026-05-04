import type {
  ActivityEvent,
  EventType,
  GithubSignalProfile,
  GraphData,
  GraphEdge,
  PersonIdentity,
  TrackedPerson,
  VcSource,
  VcTier,
  WeeklyPick,
  WeeklyPickReason,
} from "@/data/anytrace";
import { getSupabaseAccessToken, isUsingLocalDevSession } from "@/lib/supabaseAuth";

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type RawVcRow = {
  id: string;
  name: string | null;
  twitter_handle: string | null;
  linkedin_url: string | null;
  tier: number | null;
  added_at: string | null;
};

type RawCandidateRow = {
  id: string;
  name: string | null;
  twitter_handle: string | null;
  github_username: string | null;
  linkedin_url: string | null;
  added_at: string | null;
  is_active: boolean | null;
};

type RawTrackedGitPersonRow = {
  id: string;
  name: string | null;
  github_username: string | null;
  twitter_handle: string | null;
  linkedin_url: string | null;
  role_title: string | null;
  company: string | null;
  location: string | null;
  summary: string | null;
  added_at: string | null;
  is_active: boolean | null;
};

type RawTwitterSnapshotRow = {
  id: string;
  vc_id: string | null;
  followed_handle: string | null;
  first_seen_at: string | null;
  created_at: string | null;
};

type RawTrackedPersonTwitterSnapshotRow = {
  id: string;
  tracked_person_id: string | null;
  followed_handle: string | null;
  first_seen_at: string | null;
  created_at: string | null;
};

type RawGithubRepoSnapshotRow = {
  id: string;
  tracked_person_id: string | null;
  candidate_id: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
  open_issues: number | null;
  star_delta_7d: number | null;
  star_delta_30d: number | null;
  snapshot_date: string | null;
  created_at: string | null;
};

type RawGithubPersonEventRow = {
  id: string;
  tracked_person_id: string | null;
  candidate_id: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  event_type: string | null;
  title: string | null;
  detail: Record<string, unknown> | null;
  score_impact: number | null;
  occurred_at: string | null;
  created_at: string | null;
  source_url: string | null;
};

type RawGithubFollowRelationshipRow = {
  id: string;
  follower_tracked_person_id: string | null;
  followed_tracked_person_id: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  source_url: string | null;
};

type RawGithubViralRepoEventRow = {
  id: string;
  repo_owner: string | null;
  repo_name: string | null;
  repo_description: string | null;
  repo_url: string | null;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  owner_profile_url: string | null;
  language: string | null;
  event_type: string | null;
  title: string | null;
  detail: Record<string, unknown> | null;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
  open_issues: number | null;
  star_delta_7d: number | null;
  star_delta_30d: number | null;
  detected_at: string | null;
  created_at: string | null;
};

type RawPersonIdentityRow = {
  id: string;
  tracked_person_id: string | null;
  candidate_id: string | null;
  platform: "x" | "github" | "linkedin";
  handle: string | null;
  profile_url: string | null;
  is_primary: boolean | null;
  match_confidence: number | null;
  match_source: string | null;
};

type RawGithubObservedPersonRow = {
  id: string;
  source_tracked_person_id: string | null;
  relationship_type: "follower" | "following" | null;
  github_username: string | null;
  name: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog_url: string | null;
  twitter_handle: string | null;
  followers_count: number | null;
  following_count: number | null;
  public_repos_count: number | null;
  indicator_count: number | null;
  can_add_to_watchlist: boolean | null;
  added_to_watchlist: boolean | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
};

type RawScoreRow = {
  id: string;
  candidate_id: string | null;
  score_date: string | null;
  score_total: number | null;
  score_github: number | null;
  score_twitter: number | null;
  score_linkedin: number | null;
  breakdown: Record<string, unknown> | null;
};

type RawLinkedinSignalRow = {
  id: string;
  candidate_id: string | null;
  signal_type: string | null;
  old_value: string | null;
  new_value: string | null;
  vc_id: string | null;
  interaction_type: string | null;
  detected_at: string | null;
};

type SignalBundle = {
  vcs: RawVcRow[];
  candidates: RawCandidateRow[];
  trackedGitPeople: RawTrackedGitPersonRow[];
  githubObservedPeople: RawGithubObservedPersonRow[];
  twitterSnapshots: RawTwitterSnapshotRow[];
  trackedPersonTwitterSnapshots: RawTrackedPersonTwitterSnapshotRow[];
  githubRepoSnapshots: RawGithubRepoSnapshotRow[];
  githubPersonEvents: RawGithubPersonEventRow[];
  githubFollowRelationships: RawGithubFollowRelationshipRow[];
  githubViralRepoEvents: RawGithubViralRepoEventRow[];
  personIdentities: RawPersonIdentityRow[];
  linkedinSignals: RawLinkedinSignalRow[];
  scores: RawScoreRow[];
};

type DerivedSignals = {
  vcs: VcSource[];
  peopleById: Map<string, TrackedPerson>;
  identities: PersonIdentity[];
  activityEvents: ActivityEvent[];
  graphEdges: GraphEdge[];
  weeklyPicks: WeeklyPick[];
  graphPeople: TrackedPerson[];
  githubProfiles: GithubSignalProfile[];
  filteredConnectionCount: number;
};

type TwitterStatePayload = {
  ok?: boolean;
  backend?: string;
  snapshot_count?: number;
  snapshots?: RawTwitterSnapshotRow[];
  tracked_person_snapshot_count?: number;
  tracked_person_snapshots?: RawTrackedPersonTwitterSnapshotRow[];
};

const SIGNAL_CACHE_TTL_MS = 10_000;

let signalBundleCache:
  | {
      timestamp: number;
      value: SignalBundle;
    }
  | null = null;
let signalBundlePromise: Promise<SignalBundle> | null = null;
let derivedSignalsCache:
  | {
      timestamp: number;
      value: DerivedSignals;
    }
  | null = null;
let derivedSignalsPromise: Promise<DerivedSignals> | null = null;

export function clearSignalCaches() {
  signalBundleCache = null;
  signalBundlePromise = null;
  derivedSignalsCache = null;
  derivedSignalsPromise = null;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function getBackendBaseUrl() {
  return import.meta.env.VITE_ANYTRACE_BACKEND_URL?.trim() || "http://127.0.0.1:8766";
}

function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Frontend Supabase config missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return config;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeHandle(handle?: string | null) {
  if (!handle) return "";
  return handle.replace(/^@/, "").trim();
}

function inferFirm(name: string) {
  const match = name.match(/\(([^)]+)\)/);
  return match?.[1]?.trim() || name;
}

function mapTier(tier: number | null): VcTier {
  if (tier === 3) return "angel";
  if (tier === 2) return "microvc";
  return "vc";
}

function mapSizeLabel(tier: number | null) {
  if (tier === 1) return "Top tier";
  if (tier === 2) return "Mid tier";
  if (tier === 3) return "Angel";
  return "VC";
}

function mapVcSource(row: RawVcRow): VcSource {
  const name = row.name?.trim() || "Unnamed VC";
  const xHandle = row.twitter_handle?.replace(/^@/, "").trim() || null;
  const linkedinUrl = row.linkedin_url?.trim() || null;

  return {
    id: row.id,
    slug: slugify(name),
    name,
    title: "Investor",
    firm: inferFirm(name),
    sizeLabel: mapSizeLabel(row.tier),
    sectorFocus: "",
    tier: mapTier(row.tier),
    region: "",
    country: "",
    city: "",
    xHandle,
    twitterUrl: xHandle ? `https://x.com/${xHandle}` : null,
    xUserId: null,
    linkedinUrl,
    githubUsername: null,
    websiteUrl: null,
    notes: "",
    isSeeded: false,
    createdByUserId: null,
    syncStatus: "idle",
    lastXSyncAt: row.added_at,
    lastGithubSyncAt: null,
    lastSyncError: null,
  };
}

function buildPersonSummary({
  twitterHandle,
  githubUsername,
  linkedinUrl,
}: {
  twitterHandle?: string | null;
  githubUsername?: string | null;
  linkedinUrl?: string | null;
}) {
  const details = [
    twitterHandle ? `X @${humanizeHandle(twitterHandle)}` : null,
    githubUsername ? `GitHub ${githubUsername}` : null,
    linkedinUrl ? "LinkedIn connected" : null,
  ].filter(Boolean);

  if (details.length === 0) {
    return "Tracked builder from the Anytrace signal graph.";
  }

  return `Tracked builder with ${details.join(", ")}.`;
}

function buildSnapshotSummary(handle: string, connectionCount: number) {
  return connectionCount > 1
    ? `Tracked X account followed by ${connectionCount} VCs in the current graph.`
    : "Tracked X account followed by one VC in the current graph.";
}

function mapTrackedGitPersonRow(row: RawTrackedGitPersonRow): TrackedPerson {
  const displayName = row.name?.trim() || row.github_username?.trim() || humanizeHandle(row.twitter_handle) || "Unnamed git person";

  return {
    id: row.id,
    slug: slugify(displayName),
    fullName: displayName,
    roleTitle: row.role_title?.trim() || "Tracked git person",
    company: row.company?.trim() || "",
    location: row.location?.trim() || "",
    summary:
      row.summary?.trim() ||
      buildPersonSummary({
        twitterHandle: row.twitter_handle,
        githubUsername: row.github_username,
        linkedinUrl: row.linkedin_url,
      }),
    avatarUrl: null,
    topPickNote: "",
    isWatchlist: true,
  };
}

function mapSnapshotTrackedPerson({
  personId,
  handle,
  connectionCount,
}: {
  personId: string;
  handle: string;
  connectionCount: number;
}): TrackedPerson {
  return {
    id: personId,
    slug: slugify(handle),
    fullName: handle,
    roleTitle: "Tracked X account",
    company: "",
    location: "",
    summary: buildSnapshotSummary(handle, connectionCount),
    avatarUrl: null,
    topPickNote: "",
    isWatchlist: true,
  };
}

function mapPersonIdentities(row: RawTrackedGitPersonRow): PersonIdentity[] {
  const identities: PersonIdentity[] = [];
  const xHandle = humanizeHandle(row.twitter_handle);
  const githubHandle = row.github_username?.trim() || "";
  const linkedinUrl = row.linkedin_url?.trim() || "";

  if (githubHandle) {
    identities.push({
      id: `${row.id}-github`,
      personId: row.id,
      platform: "github",
      handle: githubHandle,
      profileUrl: `https://github.com/${githubHandle}`,
      isPrimary: true,
    });
  }

  if (xHandle) {
    identities.push({
      id: `${row.id}-x`,
      personId: row.id,
      platform: "x",
      handle: xHandle,
      profileUrl: `https://x.com/${xHandle}`,
      isPrimary: !githubHandle,
    });
  }

  if (linkedinUrl) {
    identities.push({
      id: `${row.id}-linkedin`,
      personId: row.id,
      platform: "linkedin",
      handle: linkedinUrl,
      profileUrl: linkedinUrl,
      isPrimary: !githubHandle && !xHandle,
    });
  }

  return identities;
}

function mapStoredPersonIdentity(row: RawPersonIdentityRow, resolvedPersonId: string): PersonIdentity | null {
  const platform = row.platform;
  const handle = row.handle?.trim();
  const profileUrl = row.profile_url?.trim();

  if (!platform || !handle || !profileUrl) return null;

  return {
    id: row.id,
    personId: resolvedPersonId,
    platform,
    handle,
    profileUrl,
    isPrimary: row.is_primary !== false,
  };
}

function mapObservedGithubPerson(row: RawGithubObservedPersonRow, personId: string): TrackedPerson {
  const githubHandle = row.github_username?.trim() || "";
  const xHandle = humanizeHandle(row.twitter_handle);
  const displayName = row.name?.trim() || githubHandle || xHandle || "Observed GitHub person";

  return {
    id: personId,
    slug: slugify(githubHandle || xHandle || displayName),
    fullName: displayName,
    roleTitle: "Observed GitHub person",
    company: row.company?.trim() || "",
    location: row.location?.trim() || "",
    summary: row.bio?.trim() || "Observed from the GitHub network graph.",
    avatarUrl: row.avatar_url?.trim() || null,
    topPickNote: "",
    isWatchlist: row.added_to_watchlist === true,
  };
}

function startOfDayIso(value?: string | null) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return items.sort((left, right) => {
    const leftDate = new Date(getDate(left) || 0).getTime();
    const rightDate = new Date(getDate(right) || 0).getTime();
    return rightDate - leftDate;
  });
}

function isWithinDays(value?: string | null, days = 7) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

async function supabaseSelect<T>(table: string, selectClause: string, orderClause?: string): Promise<T[]> {
  const config = requireSupabaseConfig();
  const accessToken = getSupabaseAccessToken();
  const bearerToken = accessToken && !isUsingLocalDevSession() ? accessToken : config.anonKey;

  const endpoint = new URL(`/rest/v1/${table}`, config.url);
  endpoint.searchParams.set("select", selectClause);
  if (orderClause) {
    endpoint.searchParams.set("order", orderClause);
  }

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed for ${table}: ${response.status} ${detail}`);
  }

  return (await response.json()) as T[];
}

async function supabaseSelectOptional<T>(table: string, selectClause: string, orderClause?: string): Promise<T[]> {
  try {
    return await supabaseSelect<T>(table, selectClause, orderClause);
  } catch (error) {
    console.warn(`Optional Supabase request skipped for ${table}.`, error);
    return [];
  }
}

async function fetchGithubRepoSnapshots(): Promise<RawGithubRepoSnapshotRow[]> {
  const rows = await supabaseSelectOptional<RawGithubRepoSnapshotRow>(
    "github_repo_snapshots",
    "id,tracked_person_id,candidate_id,repo_owner,repo_name,stars,forks,watchers,open_issues,star_delta_7d,star_delta_30d,snapshot_date,created_at",
    "snapshot_date.desc,created_at.desc",
  );

  if (rows.length > 0) {
    return rows;
  }

  const legacyRows = await supabaseSelectOptional<
    Omit<RawGithubRepoSnapshotRow, "tracked_person_id" | "repo_owner" | "watchers" | "open_issues" | "star_delta_30d"> & {
      repo_name: string | null;
    }
  >(
    "github_repo_snapshots",
    "id,candidate_id,repo_name,stars,forks,star_delta_7d,snapshot_date,created_at",
    "snapshot_date.desc,created_at.desc",
  );

  return legacyRows.map((row) => {
    const repoParts = (row.repo_name || "").split("/");
    return {
      ...row,
      tracked_person_id: null,
      repo_owner: repoParts.length > 1 ? repoParts[0] : null,
      repo_name: repoParts.length > 1 ? repoParts[1] : row.repo_name,
      watchers: null,
      open_issues: null,
      star_delta_30d: null,
    };
  });
}

async function fetchTwitterSnapshotsFromBackend(): Promise<{
  snapshots: RawTwitterSnapshotRow[];
  trackedPersonSnapshots: RawTrackedPersonTwitterSnapshotRow[];
} | null> {
  const endpoint = `${getBackendBaseUrl()}/twitter-state`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as TwitterStatePayload;
    if (!payload.ok || !Array.isArray(payload.snapshots)) {
      return null;
    }
    return {
      snapshots: payload.snapshots,
      trackedPersonSnapshots: Array.isArray(payload.tracked_person_snapshots)
        ? payload.tracked_person_snapshots
        : [],
    };
  } catch {
    return null;
  }
}

async function loadSignalBundleUncached(): Promise<SignalBundle> {
  const twitterStatePromise = fetchTwitterSnapshotsFromBackend().then(async (payload) => {
    if (payload) {
      return payload;
    }

    const [snapshots, trackedPersonSnapshots] = await Promise.all([
      supabaseSelectOptional<RawTwitterSnapshotRow>(
        "twitter_following_snapshots",
        "id,vc_id,followed_handle,first_seen_at,created_at",
        "first_seen_at.desc,created_at.desc",
      ),
      supabaseSelectOptional<RawTrackedPersonTwitterSnapshotRow>(
        "tracked_person_twitter_following_snapshots",
        "id,tracked_person_id,followed_handle,first_seen_at,created_at",
        "first_seen_at.desc,created_at.desc",
      ),
    ]);

    return {
      snapshots,
      trackedPersonSnapshots,
    };
  });

  const [
    vcs,
    candidates,
    trackedGitPeople,
    githubObservedPeople,
    twitterState,
    githubRepoSnapshots,
    githubPersonEvents,
    githubFollowRelationships,
    githubViralRepoEvents,
    personIdentities,
    linkedinSignals,
    scores,
  ] = await Promise.all([
    supabaseSelect<RawVcRow>("vcs", "id,name,twitter_handle,linkedin_url,tier,added_at", "tier.asc,name.asc"),
    supabaseSelectOptional<RawCandidateRow>(
      "candidates",
      "id,name,twitter_handle,github_username,linkedin_url,added_at,is_active",
      "added_at.asc",
    ),
    supabaseSelectOptional<RawTrackedGitPersonRow>(
      "tracked_git_people",
      "id,name,github_username,twitter_handle,linkedin_url,role_title,company,location,summary,added_at,is_active",
      "added_at.asc",
    ),
    supabaseSelectOptional<RawGithubObservedPersonRow>(
      "github_observed_people",
      "id,source_tracked_person_id,relationship_type,github_username,name,profile_url,avatar_url,bio,company,location,blog_url,twitter_handle,followers_count,following_count,public_repos_count,indicator_count,can_add_to_watchlist,added_to_watchlist,first_seen_at,last_seen_at,created_at",
      "indicator_count.desc,last_seen_at.desc,created_at.desc",
    ),
    twitterStatePromise,
    fetchGithubRepoSnapshots(),
    supabaseSelectOptional<RawGithubPersonEventRow>(
      "github_person_events",
      "id,tracked_person_id,candidate_id,repo_owner,repo_name,event_type,title,detail,score_impact,occurred_at,created_at,source_url",
      "occurred_at.desc,created_at.desc",
    ),
    supabaseSelectOptional<RawGithubFollowRelationshipRow>(
      "github_follow_relationships",
      "id,follower_tracked_person_id,followed_tracked_person_id,first_seen_at,last_seen_at,created_at,source_url",
      "last_seen_at.desc,created_at.desc",
    ),
    supabaseSelectOptional<RawGithubViralRepoEventRow>(
      "github_viral_repo_events",
      "id,repo_owner,repo_name,repo_description,repo_url,owner_display_name,owner_avatar_url,owner_profile_url,language,event_type,title,detail,stars,forks,watchers,open_issues,star_delta_7d,star_delta_30d,detected_at,created_at",
      "detected_at.desc,created_at.desc",
    ),
    supabaseSelectOptional<RawPersonIdentityRow>(
      "person_identities",
      "id,tracked_person_id,candidate_id,platform,handle,profile_url,is_primary,match_confidence,match_source",
      "match_confidence.desc",
    ),
    supabaseSelectOptional<RawLinkedinSignalRow>(
      "linkedin_signals",
      "id,candidate_id,signal_type,old_value,new_value,vc_id,interaction_type,detected_at",
      "detected_at.desc",
    ),
    supabaseSelectOptional<RawScoreRow>(
      "scores",
      "id,candidate_id,score_date,score_total,score_github,score_twitter,score_linkedin,breakdown",
      "score_date.desc,score_total.desc",
    ),
  ]);

  const twitterSnapshots = twitterState.snapshots;
  const trackedPersonTwitterSnapshots = twitterState.trackedPersonSnapshots;

  return {
    vcs,
    candidates,
    trackedGitPeople,
    githubObservedPeople,
    twitterSnapshots,
    trackedPersonTwitterSnapshots,
    githubRepoSnapshots,
    githubPersonEvents,
    githubFollowRelationships,
    githubViralRepoEvents,
    personIdentities,
    linkedinSignals,
    scores,
  };
}

async function loadSignalBundle(): Promise<SignalBundle> {
  const now = Date.now();
  if (signalBundleCache && now - signalBundleCache.timestamp < SIGNAL_CACHE_TTL_MS) {
    return signalBundleCache.value;
  }
  if (signalBundlePromise) {
    return signalBundlePromise;
  }

  signalBundlePromise = loadSignalBundleUncached()
    .then((bundle) => {
      signalBundleCache = { timestamp: Date.now(), value: bundle };
      return bundle;
    })
    .finally(() => {
      signalBundlePromise = null;
    });

  return signalBundlePromise;
}

function mapGithubEventType(value?: string | null): EventType {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("viral")) return "viral_repo";
  if (normalized.includes("repo")) return "repo_traction";
  if (normalized.includes("follower")) return "important_github_follower";
  if (normalized.includes("launch")) return "launch";
  if (normalized.includes("exit")) return "big_tech_exit";
  return "mention";
}

function mapViralGithubPerson({
  ownerLogin,
  ownerDisplayName,
  repoDescription,
  ownerAvatarUrl,
}: {
  ownerLogin: string;
  ownerDisplayName?: string | null;
  repoDescription?: string | null;
  ownerAvatarUrl?: string | null;
}): TrackedPerson {
  const displayName = ownerDisplayName?.trim() || ownerLogin;
  return {
    id: `viral-github-${ownerLogin.toLowerCase()}`,
    slug: slugify(ownerLogin),
    fullName: displayName,
    roleTitle: "Viral GitHub repo owner",
    company: "",
    location: "",
    summary: repoDescription?.trim() || "Observed through viral GitHub repository discovery.",
    avatarUrl: ownerAvatarUrl?.trim() || null,
    topPickNote: "",
    isWatchlist: false,
  };
}

function deriveSignals(bundle: SignalBundle): DerivedSignals {
  const vcs = bundle.vcs.map(mapVcSource);
  const vcsById = new Map(vcs.map((vc) => [vc.id, vc]));
  const vcIdsByXHandle = new Map(
    vcs
      .map((vc) => [humanizeHandle(vc.xHandle).toLowerCase(), vc.id] as const)
      .filter(([handle]) => !!handle),
  );
  const activeTrackedRows = bundle.trackedGitPeople.filter((row) => row.is_active !== false);
  const activeCandidateRows = bundle.candidates.filter((row) => row.is_active !== false);
  const trackedById = new Map(activeTrackedRows.map((row) => [row.id, row]));
  const trackedByGithub = new Map(
    activeTrackedRows
      .map((row) => [row.github_username?.trim().toLowerCase() || "", row] as const)
      .filter(([key]) => !!key),
  );
  const trackedByTwitter = new Map(
    activeTrackedRows
      .map((row) => [humanizeHandle(row.twitter_handle).toLowerCase(), row] as const)
      .filter(([key]) => !!key),
  );
  const trackedByLinkedin = new Map(
    activeTrackedRows
      .map((row) => [row.linkedin_url?.trim().toLowerCase() || "", row] as const)
      .filter(([key]) => !!key),
  );
  const candidateById = new Map(activeCandidateRows.map((row) => [row.id, row]));
  const personIdByGithubHandle = new Map<string, string>();
  const personIdByXHandle = new Map<string, string>();
  const personIdByLinkedinHandle = new Map<string, string>();

  const registerPersonIdentityAlias = (personId: string, platform: "x" | "github" | "linkedin", rawHandle?: string | null) => {
    const handle = rawHandle?.trim();
    if (!handle) return;

    if (platform === "x") {
      const key = humanizeHandle(handle).toLowerCase();
      if (!personIdByXHandle.has(key)) {
        personIdByXHandle.set(key, personId);
      }
      return;
    }

    if (platform === "github") {
      const key = handle.toLowerCase();
      if (!personIdByGithubHandle.has(key)) {
        personIdByGithubHandle.set(key, personId);
      }
      return;
    }

    const key = handle.toLowerCase();
    if (!personIdByLinkedinHandle.has(key)) {
      personIdByLinkedinHandle.set(key, personId);
    }
  };

  const resolveCanonicalPersonIdByIdentity = ({
    githubHandle,
    xHandle,
    linkedinHandle,
  }: {
    githubHandle?: string | null;
    xHandle?: string | null;
    linkedinHandle?: string | null;
  }) => {
    const normalizedGithub = githubHandle?.trim().toLowerCase() || "";
    const normalizedX = humanizeHandle(xHandle).toLowerCase();
    const normalizedLinkedin = linkedinHandle?.trim().toLowerCase() || "";

    return (
      (normalizedGithub ? personIdByGithubHandle.get(normalizedGithub) : null) ||
      (normalizedX ? personIdByXHandle.get(normalizedX) : null) ||
      (normalizedLinkedin ? personIdByLinkedinHandle.get(normalizedLinkedin) : null) ||
      null
    );
  };

  const resolveTrackedPersonIdFromCandidate = (candidateId?: string | null) => {
    if (!candidateId) return null;
    const candidate = candidateById.get(candidateId);
    if (!candidate) return null;

    const githubMatch = candidate.github_username?.trim()
      ? trackedByGithub.get(candidate.github_username.trim().toLowerCase())
      : null;
    if (githubMatch) return githubMatch.id;

    const twitterMatch = humanizeHandle(candidate.twitter_handle);
    if (twitterMatch) {
      return trackedByTwitter.get(twitterMatch.toLowerCase())?.id || null;
    }

    const linkedinMatch = candidate.linkedin_url?.trim().toLowerCase();
    if (linkedinMatch) {
      return trackedByLinkedin.get(linkedinMatch)?.id || null;
    }

    return null;
  };

  const peopleById = new Map<string, TrackedPerson>();
  activeTrackedRows.forEach((row) => {
    peopleById.set(row.id, mapTrackedGitPersonRow(row));
    registerPersonIdentityAlias(row.id, "github", row.github_username);
    registerPersonIdentityAlias(row.id, "x", row.twitter_handle);
    registerPersonIdentityAlias(row.id, "linkedin", row.linkedin_url);
  });

  const identities: PersonIdentity[] = [];
  const directTrackedIdentities = activeTrackedRows.flatMap(mapPersonIdentities);
  directTrackedIdentities.forEach((identity) => identities.push(identity));

  bundle.personIdentities.forEach((row) => {
    const resolvedPersonId =
      row.tracked_person_id ||
      resolveTrackedPersonIdFromCandidate(row.candidate_id) ||
      null;
    if (!resolvedPersonId || !peopleById.has(resolvedPersonId)) return;

    const mapped = mapStoredPersonIdentity(row, resolvedPersonId);
    if (!mapped) return;
    identities.push(mapped);
    registerPersonIdentityAlias(resolvedPersonId, mapped.platform, mapped.handle);
  });

  bundle.githubObservedPeople.forEach((row) => {
    const githubHandle = row.github_username?.trim() || "";
    const xHandle = humanizeHandle(row.twitter_handle);
    if (!githubHandle && !xHandle) return;

    const personId =
      resolveCanonicalPersonIdByIdentity({
        githubHandle,
        xHandle,
      }) || `observed-github-${githubHandle.toLowerCase() || xHandle.toLowerCase()}`;

    if (!peopleById.has(personId)) {
      peopleById.set(personId, mapObservedGithubPerson(row, personId));
    }

    if (githubHandle) {
      registerPersonIdentityAlias(personId, "github", githubHandle);
      const githubIdentityId = `${personId}-github-observed`;
      if (!identities.some((identity) => identity.id === githubIdentityId || (identity.personId === personId && identity.platform === "github" && identity.handle.toLowerCase() === githubHandle.toLowerCase()))) {
        identities.push({
          id: githubIdentityId,
          personId,
          platform: "github",
          handle: githubHandle,
          profileUrl: row.profile_url?.trim() || `https://github.com/${githubHandle}`,
          isPrimary: !xHandle,
        });
      }
    }

    if (xHandle) {
      registerPersonIdentityAlias(personId, "x", xHandle);
      const xIdentityId = `${personId}-x-observed`;
      if (!identities.some((identity) => identity.id === xIdentityId || (identity.personId === personId && identity.platform === "x" && identity.handle.toLowerCase() === xHandle.toLowerCase()))) {
        identities.push({
          id: xIdentityId,
          personId,
          platform: "x",
          handle: xHandle,
          profileUrl: `https://x.com/${xHandle}`,
          isPrimary: !githubHandle,
        });
      }
    }
  });
  const knownIdentityIds = new Set(identities.map((identity) => identity.id));
  const knownXHandles = new Set(
    identities.filter((identity) => identity.platform === "x").map((identity) => identity.handle.toLowerCase()),
  );

  const uniqueVcFollows = new Map<string, Set<string>>();
  const handleConnectionCount = new Map<string, number>();
  bundle.twitterSnapshots.forEach((row) => {
    const handle = humanizeHandle(row.followed_handle).toLowerCase();
    if (!row.vc_id || !handle) return;
    const set = uniqueVcFollows.get(handle) ?? new Set<string>();
    set.add(row.vc_id);
    uniqueVcFollows.set(handle, set);
  });
  uniqueVcFollows.forEach((set, handle) => {
    handleConnectionCount.set(handle, set.size);
  });

  const githubProfilesByPerson = new Map<string, GithubSignalProfile>();
  const githubEventsByPerson = new Map<string, ActivityEvent[]>();
  const latestGithubSnapshotByPerson = new Map<string, RawGithubRepoSnapshotRow>();
  const graphEdges: GraphEdge[] = [];
  const activityEvents: ActivityEvent[] = [];
  const graphPersonIds = new Set<string>();
  let filteredConnectionCount = 0;

  const githubEventsInput = bundle.githubPersonEvents
    .map((row) => {
      const trackedPersonId = row.tracked_person_id || resolveTrackedPersonIdFromCandidate(row.candidate_id);
      if (!trackedPersonId || !peopleById.has(trackedPersonId)) return null;

      const person = peopleById.get(trackedPersonId)!;
      const repoOwner = row.repo_owner?.trim() || "";
      const repoName = row.repo_name?.trim() || "";
      const occurredAt = startOfDayIso(row.occurred_at) || startOfDayIso(row.created_at) || new Date().toISOString();
      const eventType = mapGithubEventType(row.event_type);
      const title = row.title?.trim() || `${person.fullName} showed fresh GitHub activity`;

      return {
        raw: row,
        personId: trackedPersonId,
        event: {
          id: `github-${row.id}`,
          personId: trackedPersonId,
          vcSourceId: null,
          platform: "github" as const,
          eventType,
          headline: title,
          description: title,
          sourceUrl:
            row.source_url?.trim() ||
            (repoOwner && repoName ? `https://github.com/${repoOwner}/${repoName}` : `https://github.com/${person.fullName}`),
          occurredAt,
          metadata: {
            ...(row.detail || {}),
            repoOwner,
            repoName,
            scoreImpact: Number(row.score_impact ?? 0),
          },
          eventFingerprint: row.id,
        } satisfies ActivityEvent,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);

  const directGithubEvents = githubEventsInput.filter(({ event }) => event.eventType !== "important_github_follower");
  const aggregatedGithubFollowerEvents = new Map<
    string,
    Array<(typeof githubEventsInput)[number]>
  >();

  githubEventsInput.forEach((entry) => {
    if (entry.event.eventType !== "important_github_follower") {
      return;
    }
    const list = aggregatedGithubFollowerEvents.get(entry.personId) ?? [];
    list.push(entry);
    aggregatedGithubFollowerEvents.set(entry.personId, list);
  });

  directGithubEvents.forEach(({ personId, event }) => {
    const list = githubEventsByPerson.get(personId) ?? [];
    list.push(event);
    githubEventsByPerson.set(personId, list);
  });

  aggregatedGithubFollowerEvents.forEach((entries, personId) => {
    if (entries.length < 2) {
      return;
    }
    const person = peopleById.get(personId);
    if (!person) return;

    const sortedEntries = [...entries].sort((left, right) => {
      return new Date(right.event.occurredAt).getTime() - new Date(left.event.occurredAt).getTime();
    });
    const occurredAt = sortedEntries[0]?.event.occurredAt || new Date().toISOString();
    const actorLabels = entries
      .map((entry) => String(entry.event.metadata.actorLabel || "").trim())
      .filter(Boolean);
    const aggregatedEvent: ActivityEvent = {
      id: `github-important-followers-${personId}`,
      personId,
      vcSourceId: null,
      platform: "github",
      eventType: "important_github_follower",
      headline: `${person.fullName} picked up ${entries.length} large GitHub followers`,
      description: `${person.fullName} is now followed by ${entries.length} large GitHub accounts.`,
      sourceUrl: sortedEntries.find((entry) => entry.event.sourceUrl)?.event.sourceUrl || "",
      occurredAt,
      metadata: {
        actorLabels,
        targetLabel: person.fullName,
        follower_count: entries.length,
        relationshipKind: "github_follower_group",
        scoreImpact: entries.reduce((sum, entry) => sum + Number(entry.event.metadata.scoreImpact ?? 0), 0),
      },
      eventFingerprint: `github-important-followers-${personId}`,
    };
    const list = githubEventsByPerson.get(personId) ?? [];
    list.push(aggregatedEvent);
    githubEventsByPerson.set(personId, list);
  });

  bundle.githubRepoSnapshots.forEach((row) => {
    const trackedPersonId = row.tracked_person_id || resolveTrackedPersonIdFromCandidate(row.candidate_id);
    if (!trackedPersonId || !peopleById.has(trackedPersonId)) return;

    const existingLatest = latestGithubSnapshotByPerson.get(trackedPersonId);
    const currentTime = new Date(row.snapshot_date || row.created_at || 0).getTime();
    const latestTime = existingLatest ? new Date(existingLatest.snapshot_date || existingLatest.created_at || 0).getTime() : 0;
    if (!existingLatest || currentTime > latestTime) {
      latestGithubSnapshotByPerson.set(trackedPersonId, row);
    }

    const existing = githubProfilesByPerson.get(trackedPersonId);
    const nextSnapshotTime = new Date(row.snapshot_date || row.created_at || 0).getTime();
    const existingSnapshotTime = existing?.snapshotDate ? new Date(existing.snapshotDate).getTime() : 0;
    const repoOwner = row.repo_owner?.trim() || "";
    const repoName = row.repo_name?.trim() || "";
    const repoLabel = repoOwner ? `${repoOwner}/${repoName}` : repoName;
    const eventList = githubEventsByPerson.get(trackedPersonId) ?? [];
    const recentEventImpact = eventList.reduce(
      (sum, event) => sum + Number(event.metadata.scoreImpact ?? 0),
      0,
    );
    const profile: GithubSignalProfile = {
      personId: trackedPersonId,
      primaryRepoLabel: repoLabel || "GitHub repo",
      stars: Number(row.stars ?? 0),
      forks: Number(row.forks ?? 0),
      watchers: Number(row.watchers ?? 0),
      openIssues: Number(row.open_issues ?? 0),
      starDelta7d: Number(row.star_delta_7d ?? 0),
      starDelta30d: Number(row.star_delta_30d ?? 0),
      snapshotDate: row.snapshot_date || row.created_at,
      weeklyEventCount: eventList.length,
      recentGithubEvents: eventList.length,
      githubAttentionScore:
        Math.max(Number(row.star_delta_7d ?? 0), 0) * 4 +
        Math.round(Math.max(Number(row.star_delta_30d ?? 0), 0) / 3) +
        recentEventImpact,
    };

    if (
      !existing ||
      nextSnapshotTime > existingSnapshotTime ||
      (nextSnapshotTime === existingSnapshotTime && profile.githubAttentionScore > existing.githubAttentionScore)
    ) {
      githubProfilesByPerson.set(trackedPersonId, profile);
    }
  });

  const githubRelationshipEventsByFollowed = new Map<
    string,
    Array<{
      row: RawGithubFollowRelationshipRow;
      follower: TrackedPerson;
      followed: TrackedPerson;
      occurredAt: string;
      sourceUrl: string;
    }>
  >();

  bundle.githubFollowRelationships.forEach((row) => {
    if (!row.follower_tracked_person_id || !row.followed_tracked_person_id) return;
    if (!peopleById.has(row.follower_tracked_person_id) || !peopleById.has(row.followed_tracked_person_id)) return;

    const follower = peopleById.get(row.follower_tracked_person_id)!;
    const followed = peopleById.get(row.followed_tracked_person_id)!;
    const occurredAt =
      startOfDayIso(row.last_seen_at) ||
      startOfDayIso(row.first_seen_at) ||
      startOfDayIso(row.created_at) ||
      new Date().toISOString();
    const sourceUrl =
      row.source_url?.trim() ||
      `https://github.com/${identities.find((identity) => identity.personId === followed.id && identity.platform === "github")?.handle || ""}`;

    graphEdges.push({
      id: `github-follow-${row.id}`,
      sourceId: follower.id,
      targetId: followed.id,
      platform: "github",
      eventCount: 1,
      isTopPick: false,
      graphSource: "event",
    });

    graphPersonIds.add(follower.id);
    graphPersonIds.add(followed.id);

    const list = githubRelationshipEventsByFollowed.get(followed.id) ?? [];
    list.push({ row, follower, followed, occurredAt, sourceUrl });
    githubRelationshipEventsByFollowed.set(followed.id, list);
  });

  githubRelationshipEventsByFollowed.forEach((entries, followedId) => {
    const uniqueFollowerEntries = entries.filter(
      (entry, index, list) => list.findIndex((candidate) => candidate.follower.id === entry.follower.id) === index,
    );

    uniqueFollowerEntries.forEach((entry) => {
      activityEvents.push({
        id: `github-follow-${entry.row.id}`,
        personId: followedId,
        vcSourceId: null,
        platform: "github",
        eventType: "important_github_follower",
        headline: `${entry.follower.fullName} followed ${entry.followed.fullName} on GitHub`,
        description: `${entry.follower.fullName} is now following ${entry.followed.fullName} on GitHub.`,
        sourceUrl: entry.sourceUrl,
        occurredAt: entry.occurredAt,
        metadata: {
          actorLabel: entry.follower.fullName,
          targetLabel: entry.followed.fullName,
          relationshipKind: "github_follow",
          follower_count: 1,
        },
        eventFingerprint: `github-follow-${entry.row.id}`,
      });
    });
  });

  bundle.githubViralRepoEvents.forEach((row) => {
    const ownerLogin = row.repo_owner?.trim() || "";
    const repoName = row.repo_name?.trim() || "";
    if (!ownerLogin || !repoName) return;
    const viralDetail = row.detail || {};
    const twitterHandle =
      typeof viralDetail.twitterHandle === "string" ? humanizeHandle(viralDetail.twitterHandle) : "";
    const importantXFollowerIds = asStringArray(viralDetail.importantXFollowerIds);
    const importantXFollowerHandles = asStringArray(viralDetail.importantXFollowerHandles).map((handle) =>
      humanizeHandle(handle),
    );
    const importantXFollowerCount = Number(viralDetail.importantXFollowerCount ?? 0);

    const personId =
      resolveCanonicalPersonIdByIdentity({
        githubHandle: ownerLogin,
        xHandle: twitterHandle,
      }) || `viral-github-${ownerLogin.toLowerCase()}`;
    if (!peopleById.has(personId)) {
      peopleById.set(
        personId,
        mapViralGithubPerson({
          ownerLogin,
          ownerDisplayName: row.owner_display_name,
          repoDescription: row.repo_description,
          ownerAvatarUrl: row.owner_avatar_url,
        }),
      );
    }

    const identityId = `${personId}-github`;
    if (!knownIdentityIds.has(identityId)) {
      identities.push({
        id: identityId,
        personId,
        platform: "github",
        handle: ownerLogin,
        profileUrl: row.owner_profile_url?.trim() || `https://github.com/${ownerLogin}`,
        isPrimary: true,
      });
      knownIdentityIds.add(identityId);
    }
    registerPersonIdentityAlias(personId, "github", ownerLogin);

    if (twitterHandle) {
      const xIdentityId = `${personId}-x`;
      if (!knownIdentityIds.has(xIdentityId)) {
        identities.push({
          id: xIdentityId,
          personId,
          platform: "x",
          handle: twitterHandle,
          profileUrl: `https://x.com/${twitterHandle}`,
          isPrimary: false,
        });
        knownIdentityIds.add(xIdentityId);
        knownXHandles.add(twitterHandle.toLowerCase());
      }
      registerPersonIdentityAlias(personId, "x", twitterHandle);
    }

    const repoLabel = `${ownerLogin}/${repoName}`;
    activityEvents.push({
      id: `github-viral-${row.id}`,
      personId,
      vcSourceId: null,
      platform: "github",
      eventType: "viral_repo",
      headline: row.title?.trim() || `${repoLabel} is breaking out on GitHub`,
      description:
        importantXFollowerCount > 0
          ? `${repoLabel} entered the viral GitHub feed and is already followed by ${importantXFollowerCount} tracked VC${importantXFollowerCount === 1 ? "" : "s"} on X.`
          : row.repo_description?.trim() || `${repoLabel} entered the viral GitHub discovery feed.`,
      sourceUrl: row.repo_url?.trim() || `https://github.com/${repoLabel}`,
      occurredAt: startOfDayIso(row.detected_at) || startOfDayIso(row.created_at) || new Date().toISOString(),
      metadata: {
        ...viralDetail,
        repoLabel,
        repoOwner: ownerLogin,
        repoName,
        stars: Number(row.stars ?? 0),
        forks: Number(row.forks ?? 0),
        watchers: Number(row.watchers ?? 0),
        openIssues: Number(row.open_issues ?? 0),
        weekly_star_delta: Number(row.star_delta_7d ?? 0),
        monthly_star_delta: Number(row.star_delta_30d ?? 0),
        language: row.language?.trim() || "",
      },
      eventFingerprint: `github-viral-${row.id}`,
    });

    const resolvedVcIds = [
      ...new Set(
        [
          ...importantXFollowerIds,
          ...importantXFollowerHandles
            .map((handle) => vcIdsByXHandle.get(handle.toLowerCase()) || null)
            .filter((vcId): vcId is string => !!vcId),
        ].filter((vcId): vcId is string => !!vcId),
      ),
    ];

    resolvedVcIds.forEach((vcId) => {
      graphEdges.push({
        id: `viral-x-${row.id}-${vcId}`,
        sourceId: vcId,
        targetId: personId,
        platform: "x",
        eventCount: 1,
        isTopPick: false,
        graphSource: "event",
        firstObservedAt: row.detected_at || row.created_at,
        isRecent: isWithinDays(row.detected_at || row.created_at, 7),
        followerCount: resolvedVcIds.length,
      });
    });

    graphPersonIds.add(personId);
  });

  bundle.twitterSnapshots.forEach((row) => {
    const handle = humanizeHandle(row.followed_handle);
    const normalizedHandle = handle.toLowerCase();
    if (!row.vc_id || !handle) {
      filteredConnectionCount += 1;
      return;
    }

    const vc = vcsById.get(row.vc_id);
    if (!vc) {
      filteredConnectionCount += 1;
      return;
    }

    const trackedGitPerson = trackedByTwitter.get(normalizedHandle) || null;
    const personId =
      resolveCanonicalPersonIdByIdentity({
        xHandle: handle,
      }) ||
      trackedGitPerson?.id ||
      `snapshot-${normalizedHandle}`;
    if (!peopleById.has(personId)) {
      peopleById.set(
        personId,
        mapSnapshotTrackedPerson({
          personId,
          handle,
          connectionCount: handleConnectionCount.get(normalizedHandle) ?? 1,
        }),
      );
      registerPersonIdentityAlias(personId, "x", handle);
    }

    if (!knownXHandles.has(normalizedHandle)) {
      const identityId = `${personId}-x`;
      if (!knownIdentityIds.has(identityId)) {
        identities.push({
          id: identityId,
          personId,
          platform: "x",
          handle,
          profileUrl: `https://x.com/${handle}`,
          isPrimary: true,
        });
        knownIdentityIds.add(identityId);
        knownXHandles.add(normalizedHandle);
      }
    }
    registerPersonIdentityAlias(personId, "x", handle);

    graphPersonIds.add(personId);

    const person = peopleById.get(personId)!;
    const occurredAt =
      startOfDayIso(row.first_seen_at) ||
      startOfDayIso(row.created_at) ||
      new Date().toISOString();
    const xFollowerCount = handleConnectionCount.get(normalizedHandle) ?? 1;
    const isRecentXFollow = isWithinDays(row.first_seen_at, 7);

    graphEdges.push({
      id: row.id,
      sourceId: row.vc_id,
      targetId: personId,
      platform: "x",
      eventCount: 1,
      isTopPick: false,
      graphSource: "snapshot",
      firstObservedAt: row.first_seen_at || row.created_at,
      isRecent: isRecentXFollow,
      followerCount: xFollowerCount,
    });

    if (isRecentXFollow) {
      activityEvents.push({
        id: `x-${row.id}`,
        personId,
        vcSourceId: row.vc_id,
        platform: "x",
        eventType: "vc_follow",
        headline: `${vc.name} followed ${person.fullName} on X`,
        description: `${vc.name} is currently connected to ${person.fullName} through the tracked X follow graph.`,
        sourceUrl: `https://x.com/${handle}`,
        occurredAt,
        metadata: {
          actorLabel: vc.name,
          targetLabel: handle,
          followedHandle: handle,
          firstSeenAt: row.first_seen_at,
          createdAt: row.created_at,
        },
        eventFingerprint: row.id,
      });
    }
  });

  bundle.trackedPersonTwitterSnapshots.forEach((row) => {
    const handle = humanizeHandle(row.followed_handle);
    const normalizedHandle = handle.toLowerCase();
    if (!row.tracked_person_id || !handle) {
      filteredConnectionCount += 1;
      return;
    }

    const sourcePerson = peopleById.get(row.tracked_person_id);
    if (!sourcePerson) {
      filteredConnectionCount += 1;
      return;
    }

    const trackedGitPerson = trackedByTwitter.get(normalizedHandle) || null;
    const personId =
      resolveCanonicalPersonIdByIdentity({
        xHandle: handle,
      }) ||
      trackedGitPerson?.id ||
      `snapshot-${normalizedHandle}`;

    if (!peopleById.has(personId)) {
      peopleById.set(
        personId,
        mapSnapshotTrackedPerson({
          personId,
          handle,
          connectionCount: handleConnectionCount.get(normalizedHandle) ?? 1,
        }),
      );
      registerPersonIdentityAlias(personId, "x", handle);
    }

    if (!knownXHandles.has(normalizedHandle)) {
      const identityId = `${personId}-x`;
      if (!knownIdentityIds.has(identityId)) {
        identities.push({
          id: identityId,
          personId,
          platform: "x",
          handle,
          profileUrl: `https://x.com/${handle}`,
          isPrimary: true,
        });
        knownIdentityIds.add(identityId);
        knownXHandles.add(normalizedHandle);
      }
    }
    registerPersonIdentityAlias(personId, "x", handle);

    graphPersonIds.add(row.tracked_person_id);
    graphPersonIds.add(personId);

    const occurredAt =
      startOfDayIso(row.first_seen_at) ||
      startOfDayIso(row.created_at) ||
      new Date().toISOString();

    graphEdges.push({
      id: `tracked-x-${row.id}`,
      sourceId: row.tracked_person_id,
      targetId: personId,
      platform: "x",
      eventCount: 1,
      isTopPick: false,
      graphSource: "event",
      firstObservedAt: row.first_seen_at || row.created_at,
      isRecent: isWithinDays(row.first_seen_at, 7),
      followerCount: 1,
    });

    activityEvents.push({
      id: `tracked-x-${row.id}`,
      personId,
      vcSourceId: null,
      platform: "x",
      eventType: "mention",
      headline: `${sourcePerson.fullName} follows ${peopleById.get(personId)?.fullName || handle} on X`,
      description: `${sourcePerson.fullName} is connected to ${peopleById.get(personId)?.fullName || handle} through tracked GitHub-person X scanning.`,
      sourceUrl: `https://x.com/${handle}`,
      occurredAt,
      metadata: {
        actorLabel: sourcePerson.fullName,
        targetLabel: handle,
        followedHandle: handle,
        firstSeenAt: row.first_seen_at,
        createdAt: row.created_at,
        sourceTrackedPersonId: row.tracked_person_id,
      },
      eventFingerprint: `tracked-x-${row.id}`,
    });
  });

  githubProfilesByPerson.forEach((profile, personId) => {
    if (profile.githubAttentionScore > 0 || profile.starDelta7d > 0 || profile.recentGithubEvents > 0) {
      graphPersonIds.add(personId);
    }
  });

  const recentVcFollowCountByPerson = new Map<string, number>();
  graphEdges.forEach((edge) => {
    if (edge.platform !== "x" || edge.isRecent !== true) {
      return;
    }
    recentVcFollowCountByPerson.set(edge.targetId, (recentVcFollowCountByPerson.get(edge.targetId) ?? 0) + 1);
  });

  const scoreRowsSorted = sortByDateDesc([...bundle.scores], (row) => row.score_date);
  const latestScoreDate = scoreRowsSorted[0]?.score_date || null;
  const explicitScoredPicks = latestScoreDate
    ? scoreRowsSorted
        .filter((row) => row.score_date === latestScoreDate && row.candidate_id)
        .map((row) => {
          const personId = resolveTrackedPersonIdFromCandidate(row.candidate_id);
          if (!personId) return null;
          const person = peopleById.get(personId);
          if (!person) return null;

          const githubProfile = githubProfilesByPerson.get(personId) ?? null;
          const reasons: WeeklyPickReason[] = [];

          if (Number(row.score_twitter ?? 0) > 0) {
            reasons.push({
              id: `${row.id}-twitter`,
              reasonKind: "vc_follow_burst",
              title: "VC follow burst",
              detail: `${row.score_twitter} Twitter attention points from VC follows.`,
              metricValue: Number(row.score_twitter ?? 0),
              displayOrder: reasons.length,
              sourceEventId: null,
            });
          }

          if (Number(row.score_github ?? 0) > 0) {
            reasons.push({
              id: `${row.id}-github`,
              reasonKind: "repo_traction",
              title: "GitHub traction",
              detail: `${row.score_github} GitHub attention points from repository momentum.`,
              metricValue: Number(row.score_github ?? 0),
              displayOrder: reasons.length,
              sourceEventId: null,
            });
          }

          return {
            id: row.id,
            weekStart: row.score_date || new Date().toISOString().slice(0, 10),
            rank: 0,
            score: Number(row.score_total ?? 0),
            primaryReason: reasons[0]?.title || "Attention candidate",
            summary: `${person.fullName} is drawing fresh attention across X and GitHub.`,
            vcFollowCount: Number(row.score_twitter ?? 0),
            githubAttentionScore: Number(row.score_github ?? 0),
            bigTechExit: Number(row.score_linkedin ?? 0) > 0,
            person,
            reasons,
            githubProfile,
          } satisfies WeeklyPick;
        })
        .filter((pick): pick is WeeklyPick => !!pick)
    : [];

  const derivedPicks = activeTrackedRows
    .map((row) => {
      const person = peopleById.get(row.id)!;
      const githubProfile = githubProfilesByPerson.get(row.id) ?? null;
      const vcFollowCount = recentVcFollowCountByPerson.get(row.id) ?? 0;
      const githubScore = githubProfile?.githubAttentionScore ?? 0;
      const totalScore = vcFollowCount * 12 + githubScore;
      if (totalScore <= 0) return null;

      const reasons: WeeklyPickReason[] = [];
      if (vcFollowCount > 0) {
        reasons.push({
          id: `${row.id}-twitter`,
          reasonKind: "vc_follow_burst",
          title: "VC follow burst",
          detail: `${vcFollowCount} tracked VC follow${vcFollowCount === 1 ? "" : "s"} on X.`,
          metricValue: vcFollowCount,
          displayOrder: reasons.length,
          sourceEventId: null,
        });
      }
      if (githubProfile && githubProfile.githubAttentionScore > 0) {
        reasons.push({
          id: `${row.id}-github`,
          reasonKind: "repo_traction",
          title: "GitHub traction",
          detail: `${githubProfile.primaryRepoLabel} gained ${githubProfile.starDelta7d} stars over the last 7 days.`,
          metricValue: githubProfile.githubAttentionScore,
          displayOrder: reasons.length,
          sourceEventId: null,
        });
      }

      return {
        id: `derived-${row.id}`,
        weekStart: new Date().toISOString().slice(0, 10),
        rank: 0,
        score: totalScore,
        primaryReason: reasons[0]?.title || "Attention candidate",
        summary:
          vcFollowCount > 0 && githubProfile
            ? `${person.fullName} is drawing attention from both tracked VCs and GitHub momentum.`
            : githubProfile
              ? `${person.fullName} is accelerating on GitHub through ${githubProfile.primaryRepoLabel}.`
              : `${person.fullName} is drawing fresh VC attention on X.`,
        vcFollowCount,
        githubAttentionScore: githubScore,
        bigTechExit: false,
        person,
        reasons,
        githubProfile,
      } satisfies WeeklyPick;
    })
    .filter((pick): pick is WeeklyPick => !!pick);

  const weeklyPicks = (explicitScoredPicks.length > 0 ? explicitScoredPicks : derivedPicks)
    .sort((left, right) => right.score - left.score)
    .map((pick, index) => ({ ...pick, rank: index + 1 }));

  const topPickIds = new Set(weeklyPicks.slice(0, 12).map((pick) => pick.person.id));
  const graphPeople = [...graphPersonIds]
    .map((personId) => peopleById.get(personId))
    .filter((person): person is TrackedPerson => !!person)
    .sort((left, right) => {
      const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
      if (topDiff !== 0) return topDiff;
      return left.fullName.localeCompare(right.fullName);
    });

  const topPickEdgeTargets = new Set(topPickIds);
  const graphEdgesWithTopPicks = graphEdges.map((edge) => ({
    ...edge,
    isTopPick: topPickEdgeTargets.has(edge.targetId),
  }));

  const allEventsSorted = sortByDateDesc(activityEvents, (event) => event.occurredAt);

  return {
    vcs,
    peopleById,
    identities,
    activityEvents: allEventsSorted,
    graphEdges: graphEdgesWithTopPicks,
    weeklyPicks,
    graphPeople,
    githubProfiles: [...githubProfilesByPerson.values()].sort(
      (left, right) => right.githubAttentionScore - left.githubAttentionScore,
    ),
    filteredConnectionCount,
  };
}

async function loadDerivedSignals(): Promise<DerivedSignals> {
  const now = Date.now();
  if (derivedSignalsCache && now - derivedSignalsCache.timestamp < SIGNAL_CACHE_TTL_MS) {
    return derivedSignalsCache.value;
  }
  if (derivedSignalsPromise) {
    return derivedSignalsPromise;
  }

  derivedSignalsPromise = loadSignalBundle()
    .then((bundle) => {
      const derived = deriveSignals(bundle);
      derivedSignalsCache = { timestamp: Date.now(), value: derived };
      return derived;
    })
    .finally(() => {
      derivedSignalsPromise = null;
    });

  return derivedSignalsPromise;
}

export function hasFrontendSupabaseConfig() {
  return !!getSupabaseConfig();
}

export async function fetchVcSources() {
  const bundle = await loadSignalBundle();
  return bundle.vcs.map(mapVcSource);
}

export async function fetchTrackedGitPeople(): Promise<TrackedPerson[]> {
  const bundle = await loadSignalBundle();
  return bundle.trackedGitPeople
    .filter((row) => row.is_active !== false)
    .map(mapTrackedGitPersonRow);
}

export async function fetchPersonIdentities(): Promise<PersonIdentity[]> {
  const derived = await loadDerivedSignals();
  return derived.identities;
}

export async function fetchGithubSignalProfiles(): Promise<GithubSignalProfile[]> {
  const derived = await loadDerivedSignals();
  return derived.githubProfiles;
}

export async function fetchActivityEvents(): Promise<ActivityEvent[]> {
  const derived = await loadDerivedSignals();
  return derived.activityEvents;
}

export async function fetchWeeklyPicks(): Promise<WeeklyPick[]> {
  const derived = await loadDerivedSignals();
  return derived.weeklyPicks;
}

export async function fetchGraphData(): Promise<GraphData> {
  const derived = await loadDerivedSignals();

  return {
    vcs: derived.vcs,
    people: derived.graphPeople,
    events: derived.activityEvents,
    weeklyPicks: derived.weeklyPicks,
    edges: derived.graphEdges,
    graphSource: derived.graphEdges.length > 0 || derived.graphPeople.length > 0 ? "snapshot" : "empty",
    filteredConnectionCount: derived.filteredConnectionCount,
  };
}
