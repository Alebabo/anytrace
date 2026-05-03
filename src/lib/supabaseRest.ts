import type { GraphData, VcSource, VcTier } from "@/data/anytrace";

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

function getSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
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

async function supabaseSelect<T>(table: string, selectClause: string, orderClause?: string): Promise<T[]> {
  const config = requireSupabaseConfig();

  const endpoint = new URL(`/rest/v1/${table}`, config.url);
  endpoint.searchParams.set("select", selectClause);
  if (orderClause) {
    endpoint.searchParams.set("order", orderClause);
  }

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed for ${table}: ${response.status} ${detail}`);
  }

  return (await response.json()) as T[];
}

export function hasFrontendSupabaseConfig() {
  return !!getSupabaseConfig();
}

export async function fetchVcSources() {
  const rows = await supabaseSelect<RawVcRow>(
    "vcs",
    "id,name,twitter_handle,linkedin_url,tier,added_at",
    "tier.asc,name.asc",
  );

  return rows.map(mapVcSource);
}

export async function fetchGraphData(): Promise<GraphData> {
  const vcs = await fetchVcSources();

  return {
    vcs,
    people: [],
    events: [],
    weeklyPicks: [],
    edges: [],
    graphSource: vcs.length > 0 ? "snapshot" : "empty",
    filteredConnectionCount: 0,
  };
}
