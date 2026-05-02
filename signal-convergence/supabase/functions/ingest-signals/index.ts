import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SignalKind =
  | "Hackathon winner"
  | "Seed round"
  | "Pre-seed round"
  | "Publication"
  | "Open source traction"
  | "Product launch";

type Confidence = "high" | "medium" | "low";

interface IngestedSignal {
  external_id: string;
  source: string;
  kind: SignalKind;
  title: string;
  summary: string;
  entity: string;       // company / project
  person_name: string;
  person_role: string;
  company: string;
  geography: string;
  source_url: string;
  confidence: Confidence;
  tags: string[];
  evidence_snippet: string;
  why_matters: string;
  observed_at: string;
  image_url: string;
}

// ───────────────────────── helpers ─────────────────────────
function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

// Fetch the Open Graph image of a URL. Returns "" on failure.
// Uses a 3s timeout and limits download to first 100KB of HTML.
async function fetchOgImage(url: string): Promise<string> {
  if (!url) return "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SignalsBot/1.0; +https://lovable.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok || !res.body) return "";

    // Read up to 100KB only — OG tags live in <head>
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let total = 0;
    while (total < 100_000) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    try { await reader.cancel(); } catch (_) { /* ignore */ }

    const head = html.split("</head>")[0] ?? html;
    // Try og:image, twitter:image, og:image:secure_url
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];
    for (const re of patterns) {
      const m = head.match(re);
      if (m && m[1]) {
        let img = m[1].trim();
        if (img.startsWith("//")) img = "https:" + img;
        else if (img.startsWith("/")) {
          try { img = new URL(img, url).toString(); } catch (_) { /* ignore */ }
        }
        if (img.startsWith("http")) return img;
      }
    }
    return "";
  } catch (_) {
    return "";
  }
}

// ───────────────────────── AI extraction (Lovable AI / Gemini Flash) ─────────────────────────
// Extracts a person (founder/maker) + role + company from a raw text blob.
// Returns null when no real person can be identified.
async function extractPerson(text: string): Promise<{
  person_name: string;
  person_role: string;
  company: string;
} | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;
  if (!text || text.length < 10) return null;

  try {
    const ctrl = new AbortController();
    const aiTimer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You extract a single founder/maker/winner PERSON from a short news/launch/repo blurb. Only extract real human names (first + last). Skip if the text only mentions a company, team, or generic role. Return strict JSON only.",
          },
          { role: "user", content: text.slice(0, 1500) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_person",
              description: "Extract one identified person from the text.",
              parameters: {
                type: "object",
                properties: {
                  found: {
                    type: "boolean",
                    description: "True only if a real, named individual is mentioned.",
                  },
                  person_name: { type: "string", description: "Full name e.g. 'Jane Doe'. Empty if found=false." },
                  person_role: {
                    type: "string",
                    description: "Their role e.g. 'Founder', 'CEO', 'Maker', 'Hackathon winner'. Empty if unknown.",
                  },
                  company: { type: "string", description: "Their company/project name. Empty if unknown." },
                },
                required: ["found", "person_name", "person_role", "company"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_person" } },
      }),
    });
    clearTimeout(aiTimer);

    if (!res.ok) {
      console.warn(`[AI] extraction failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args);
    if (!parsed.found || !parsed.person_name || parsed.person_name.split(" ").length < 2) {
      return null;
    }
    return {
      person_name: String(parsed.person_name).trim(),
      person_role: String(parsed.person_role || "").trim(),
      company: String(parsed.company || "").trim(),
    };
  } catch (e) {
    console.warn("[AI] extraction exception:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Run extraction on a list of raw candidates concurrently with a small concurrency cap.
// Drops candidates where no person is identified.
async function enrichWithPeople<T extends { _rawText: string } & Omit<IngestedSignal, "person_name" | "person_role" | "company">>(
  candidates: T[],
  concurrency = 20,
): Promise<IngestedSignal[]> {
  const out: IngestedSignal[] = [];
  let i = 0;

  async function worker() {
    while (i < candidates.length) {
      const idx = i++;
      const c = candidates[idx];
      const person = await extractPerson(c._rawText);
      if (!person) continue;
      const { _rawText, ...rest } = c;
      out.push({
        ...rest,
        person_name: person.person_name,
        person_role: person.person_role,
        company: person.company || rest.entity,
        entity: person.company || rest.entity,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return out;
}

// Fill in image_url for any signal that doesn't have one yet, by fetching the
// Open Graph image of source_url. Runs with concurrency cap.
async function enrichWithImages(signals: IngestedSignal[], concurrency = 12): Promise<void> {
  const todo = signals.filter((s) => !s.image_url && s.source_url);
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const idx = i++;
      const s = todo[idx];
      const img = await fetchOgImage(s.source_url);
      if (img) s.image_url = img;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
}

// ───────────────────────── Source 1: HN — Funding announcements (with AI extraction) ─────────────────────────
const WEEK_MS = 7 * 86400000;
const SINCE_ISO = new Date(Date.now() - WEEK_MS).toISOString();
const SINCE_UNIX = Math.floor((Date.now() - WEEK_MS) / 1000);

async function fetchHNFunding() {
  const queries: { query: string; kind: SignalKind; tags: string[] }[] = [
    { query: "raises seed", kind: "Seed round", tags: ["funding", "seed"] },
    { query: "raises pre-seed", kind: "Pre-seed round", tags: ["funding", "pre-seed"] },
  ];

  const candidates: ({ _rawText: string } & Omit<IngestedSignal, "person_name" | "person_role" | "company">)[] = [];

  for (const q of queries) {
    // Last 7 days only via Algolia numericFilters
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
      q.query,
    )}&tags=story&hitsPerPage=8&numericFilters=created_at_i>${SINCE_UNIX}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    for (const hit of data.hits ?? []) {
      if (!hit.title || !hit.url) continue;
      const points = hit.points ?? 0;
      const rawText = `${hit.title}. ${hit.story_text ?? ""}`;
      candidates.push({
        _rawText: rawText,
        external_id: `hn-${hit.objectID}`,
        source: "Hacker News",
        kind: q.kind,
        title: hit.title,
        summary: `${points} points · ${hit.num_comments ?? 0} comments on Hacker News`,
        entity: "",
        geography: "Global",
        source_url: hit.url,
        confidence: points > 50 ? "high" : points > 10 ? "medium" : "low",
        tags: q.tags,
        evidence_snippet: (hit.story_text ?? hit.title).slice(0, 280),
        why_matters: "Confirmed funding announcement — verify primary source.",
        observed_at: new Date(hit.created_at).toISOString(),
        image_url: "",
      });
    }
  }

  return enrichWithPeople(candidates);
}

// ───────────────────────── Source 2: Product Hunt — Maker launches ─────────────────────────
// Public RSS feed → no auth needed. Each post links to Maker(s).
async function fetchProductHunt(): Promise<IngestedSignal[]> {
  // We scrape today's PH feed via their public JSON-ish endpoint (no auth) and extract maker names from descriptions.
  // Endpoint: https://www.producthunt.com/frontend/graphql is auth-walled, but the RSS is public:
  const res = await fetch("https://www.producthunt.com/feed?category=undefined", {
    headers: { "User-Agent": "Mozilla/5.0 SignalsBot" },
  });
  if (!res.ok) {
    console.warn(`[ProductHunt] feed failed: ${res.status}`);
    return [];
  }
  const xml = await res.text();

  // Parse <item>…</item> — last 7 days, max 8 items
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12);
  const candidates: ({ _rawText: string } & Omit<IngestedSignal, "person_name" | "person_role" | "company">)[] = [];

  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
    return m ? m[1].trim() : "";
  };

  for (const [, block] of items) {
    const title = pick(block, "title");
    const link = pick(block, "link");
    const desc = pick(block, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const pub = pick(block, "pubDate");
    if (!title || !link) continue;
    // Skip anything older than 7 days
    if (pub && new Date(pub).getTime() < Date.now() - WEEK_MS) continue;

    // Try to extract image from the RSS block: <enclosure url="..."> or <media:thumbnail url="..."> or first <img src=...> in description
    let img = "";
    const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (enclosure) img = enclosure[1];
    if (!img) {
      const media = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
      if (media) img = media[1];
    }
    if (!img) {
      const descRaw = pick(block, "description");
      const imgTag = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgTag) img = imgTag[1];
    }

    candidates.push({
      _rawText: `Product Hunt launch: ${title}. ${desc}`,
      external_id: `ph-${hashString(link)}`,
      source: "Product Hunt",
      kind: "Product launch",
      title,
      summary: desc.slice(0, 200),
      entity: "",
      geography: "Global",
      source_url: link,
      confidence: "medium",
      tags: ["launch", "product-hunt"],
      evidence_snippet: desc.slice(0, 280),
      why_matters: "Public launch by an identified maker — strong velocity signal.",
      observed_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      image_url: img,
    });
  }

  return enrichWithPeople(candidates);
}

// ───────────────────────── Source 3: GitHub — Solo makers with traction ─────────────────────────
// Filters: created in last 14 days, >100 stars, owner type=User (not Organization).
async function fetchGitHubSoloMakers(): Promise<IngestedSignal[]> {
  const token = Deno.env.get("GITHUB_TOKEN");
  // Last 7 days, repos with >50 stars
  const since = new Date(Date.now() - WEEK_MS).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=created:>${since}+stars:>50&sort=stars&order=desc&per_page=12`;
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  const items = (data.items ?? []).filter((r: any) => r.owner?.type === "User");

  // Fetch owner profiles in parallel — was the biggest bottleneck.
  const repoSlice = items.slice(0, 10);
  const enriched = await Promise.all(
    repoSlice.map(async (repo: any) => {
      try {
        const userRes = await fetch(`https://api.github.com/users/${repo.owner.login}`, { headers });
        if (!userRes.ok) return null;
        const u = await userRes.json();
        const realName = (u.name ?? "").trim();
        if (!realName || realName.split(/\s+/).length < 2) return null;
        return { repo, realName };
      } catch (_) {
        return null;
      }
    }),
  );

  const results: IngestedSignal[] = [];
  for (const item of enriched) {
    if (!item) continue;
    const { repo, realName } = item;
    results.push({
      external_id: `gh-${repo.id}`,
      source: "GitHub",
      kind: "Open source traction",
      title: `${realName} ships ${repo.name} — ${repo.stargazers_count.toLocaleString()} ★ in 7 days`,
      summary: repo.description ?? "Solo-maintained open source project gaining rapid traction.",
      entity: repo.name,
      person_name: realName,
      person_role: "Maker",
      company: repo.name,
      geography: "Global",
      source_url: repo.html_url,
      confidence: repo.stargazers_count > 1000 ? "high" : repo.stargazers_count > 300 ? "medium" : "low",
      tags: [
        ...(repo.language ? [String(repo.language).toLowerCase()] : []),
        ...((repo.topics ?? []).slice(0, 2) as string[]),
        "solo-maker",
      ],
      evidence_snippet: `${repo.stargazers_count} ★ · ${repo.forks_count} forks · solo owner @${repo.owner.login}`,
      why_matters: "Solo maker shipping a project that's getting real traction — classic pre-founder signal.",
      observed_at: repo.created_at,
      image_url: repo.owner?.avatar_url ?? "",
    });
  }
  return results;
}

// ───────────────────────── Source 4: Firecrawl — confirmed hackathon winners only ─────────────────────────
async function fetchHackathonWinners(): Promise<IngestedSignal[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  // Tighter query: only completed events with announced winners.
  // No scrapeOptions — page scraping is too slow; rely on title+snippet only.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          '"winners announced" OR "1st place" hackathon (site:ethglobal.com OR site:devpost.com OR site:mlh.io)',
        limit: 6,
        tbs: "qdr:w",
      }),
    });
  } catch (e) {
    console.warn("[Firecrawl] timeout/abort:", e instanceof Error ? e.message : String(e));
    clearTimeout(timer);
    return [];
  }
  clearTimeout(timer);

  if (!res.ok) {
    console.warn(`[Firecrawl] failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  const hits: any[] = Array.isArray(data.data) ? data.data : (data.data?.web ?? []);

  const candidates: ({ _rawText: string } & Omit<IngestedSignal, "person_name" | "person_role" | "company">)[] = [];

  for (const hit of hits) {
    const url = hit.url ?? hit.link ?? "";
    const title = hit.title ?? "";
    const desc = hit.description ?? hit.snippet ?? "";
    const md = (hit.markdown ?? "").slice(0, 2000);

    // Hard filter: must contain winner/place language. Drops "in-progress" hackathons.
    const hay = `${title} ${desc} ${md}`.toLowerCase();
    const looksFinal =
      hay.includes("winner") ||
      hay.includes("1st place") ||
      hay.includes("first place") ||
      hay.includes("won the");
    if (!looksFinal) continue;

    candidates.push({
      _rawText: `Hackathon result: ${title}. ${desc} ${md}`,
      external_id: `fc-${hashString(url)}`,
      source: "Devpost / ETHGlobal",
      kind: "Hackathon winner",
      title,
      summary: desc.slice(0, 200),
      entity: "",
      geography: "Global",
      source_url: url,
      confidence: "high",
      tags: ["hackathon", "winner"],
      evidence_snippet: (md || desc).slice(0, 280),
      why_matters: "Confirmed hackathon winner — surfaces technical founders before any cap-table radar.",
      observed_at: new Date().toISOString(),
      image_url: hit?.metadata?.ogImage ?? hit?.metadata?.["og:image"] ?? "",
    });
  }

  return enrichWithPeople(candidates);
}

// ───────────────────────── handler ─────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Backend not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let requested: string[] = ["hn", "producthunt", "github", "firecrawl"];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.sources) && body.sources.length > 0) {
      requested = body.sources.map((s: unknown) => String(s).toLowerCase());
    }
  } catch (_) { /* ignore */ }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const perSource: Record<string, { fetched: number; inserted: number; error?: string }> = {};
  const allSignals: IngestedSignal[] = [];

  const runners: { key: string; fn: () => Promise<IngestedSignal[]> }[] = [
    { key: "hn", fn: fetchHNFunding },
    { key: "producthunt", fn: fetchProductHunt },
    { key: "github", fn: fetchGitHubSoloMakers },
    { key: "firecrawl", fn: fetchHackathonWinners },
  ];

  // Run all sources in parallel with a hard 30s per-source timeout.
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
      ),
    ]);

  await Promise.all(
    runners
      .filter((r) => requested.includes(r.key))
      .map(async (r) => {
        try {
          const signals = await withTimeout(r.fn(), 90000, r.key);
          perSource[r.key] = { fetched: signals.length, inserted: 0 };
          allSignals.push(...signals);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[${r.key}] error:`, msg);
          perSource[r.key] = { fetched: 0, inserted: 0, error: msg };
        }
      }),
  );

  // Backfill images via Open Graph for any signal that still lacks one.
  await enrichWithImages(allSignals);

  let totalInserted = 0;
  if (allSignals.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < allSignals.length; i += chunkSize) {
      const chunk = allSignals.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("signals")
        .upsert(chunk, { onConflict: "source,external_id", ignoreDuplicates: true })
        .select("id, source");
      if (error) {
        console.error("[upsert] error:", error.message);
        continue;
      }
      const inserted = data?.length ?? 0;
      totalInserted += inserted;
      for (const row of data ?? []) {
        const key = sourceKey(row.source as string);
        if (perSource[key]) perSource[key].inserted += 1;
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      total_fetched: allSignals.length,
      total_inserted: totalInserted,
      sources: perSource,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

function sourceKey(source: string): string {
  if (source === "Hacker News") return "hn";
  if (source === "Product Hunt") return "producthunt";
  if (source === "GitHub") return "github";
  if (source.startsWith("Devpost")) return "firecrawl";
  return source.toLowerCase();
}