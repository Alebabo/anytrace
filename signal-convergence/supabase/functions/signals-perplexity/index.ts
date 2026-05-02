// Simple Perplexity-powered signals fetcher.
// Asks sonar for fresh founder/maker signals (last week), parses the structured
// JSON response, replaces the signals table contents, and returns counts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Kind =
  | "Hackathon winner"
  | "Seed round"
  | "Pre-seed round"
  | "Publication"
  | "Open source traction"
  | "Product launch";

type Confidence = "high" | "medium" | "low";

interface PplxSignal {
  kind: Kind;
  title: string;
  summary: string;
  person_name: string;
  person_role: string;
  company: string;
  geography: string;
  source_name: string;
  source_url: string;
  confidence: Confidence;
  evidence: string;
  why_matters: string;
  observed_at: string;
  tags: string[];
  image_url: string;
  source_priority: number;
}

const ALLOWED_KINDS: Kind[] = [
  "Seed round",
  "Pre-seed round",
  "Hackathon winner",
];

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function clampConfidence(c: string): Confidence {
  return c === "high" || c === "low" ? c : "medium";
}
function clampKind(k: string): Kind | null {
  return (ALLOWED_KINDS as string[]).includes(k) ? (k as Kind) : null;
}
function safeIso(v: unknown): string {
  const d = typeof v === "string" ? new Date(v) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Major / trusted publications get higher priority.
const TIER_1 = [
  "yahoo.com", "finance.yahoo.com", "bloomberg.com", "reuters.com", "wsj.com",
  "ft.com", "techcrunch.com", "theinformation.com", "axios.com", "forbes.com",
  "businesswire.com", "prnewswire.com", "cnbc.com", "nytimes.com", "economist.com",
];
const TIER_2 = [
  "sifted.eu", "theverge.com", "venturebeat.com", "fortune.com", "wired.com",
  "techstars.com", "ycombinator.com", "ethglobal.com", "devpost.com", "mlh.io",
  "pitchbook.com", "crunchbase.com",
];
function sourcePriority(url: string): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (TIER_1.some((d) => host === d || host.endsWith("." + d) || host.includes(d))) return 3;
    if (TIER_2.some((d) => host === d || host.endsWith("." + d) || host.includes(d))) return 2;
    return 1;
  } catch {
    return 0;
  }
}
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function callPerplexity(): Promise<PplxSignal[]> {
  const key =
    Deno.env.get("PERPLEXITY_API_KEY_1") ?? Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) throw new Error("PERPLEXITY_API_KEY_1 not configured");

  const systemPrompt = `You are a startup-intelligence analyst for an early-stage VC.
Find fresh signals about identified individual founders who recently raised seed/pre-seed funding,
or named winners of recent hackathons. Only include real, named people (first + last name).
Skip company-only news without an identified person.
Each signal MUST cite a real, working source URL.`;

  const userPrompt = `Find 10-15 recent, notable signals from the LAST 30 DAYS in these three categories ONLY:
- "Seed round" — a named founder raised a seed round
- "Pre-seed round" — a named founder raised a pre-seed round
- "Hackathon winner" — a named winner of a recent hackathon (ETHGlobal, Devpost, MLH, EthDenver, AI hackathons, Y Combinator AI hackathon, etc.)

Aim for a balanced mix — at least 3 results in each category if possible.
STRONGLY PREFER major, reputable publications: Yahoo Finance, Bloomberg, Reuters, WSJ, FT,
TechCrunch, The Information, Axios Pro Rata, Forbes, CNBC, BusinessWire, PRNewswire, Sifted.
Avoid duplicates — each (person + company + event) should appear at most once, picking the
single strongest source.
Also include an image when available (article hero image, company logo, or founder photo URL).

Rules:
- kind MUST be exactly one of: "Seed round", "Pre-seed round", "Hackathon winner".
- person_name MUST be a real, named human (first + last name). Skip company-only news.
- source_url MUST be a real, working article or post URL.
- image_url SHOULD be a direct https URL to a representative image (article hero, company logo, or founder photo). Empty string if none is reliably known.
- observed_at = ISO date of the announcement.
- If you can't find 10, return what you can find — do NOT return an empty list.
- Return STRICT JSON matching the schema. No prose, no markdown.`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      search_recency_filter: "month",
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "founder_signals",
          schema: {
            type: "object",
            properties: {
              signals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    kind: { type: "string" },
                    title: { type: "string" },
                    summary: { type: "string" },
                    person_name: { type: "string" },
                    person_role: { type: "string" },
                    company: { type: "string" },
                    geography: { type: "string" },
                    source_name: { type: "string" },
                    source_url: { type: "string" },
                    confidence: { type: "string" },
                    evidence: { type: "string" },
                    why_matters: { type: "string" },
                    observed_at: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    image_url: { type: "string" },
                  },
                  required: ["kind", "title", "person_name", "company", "source_url", "evidence", "observed_at"],
                },
              },
            },
            required: ["signals"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Perplexity ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  console.log("[pplx] raw content:", content.slice(0, 2000));
  let parsed: { signals?: unknown[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    const stripped = content.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(stripped);
  }

  const raw = Array.isArray(parsed?.signals) ? parsed.signals : [];
  console.log("[pplx] raw signals count:", raw.length);
  const out = raw
    .map((r: any): PplxSignal | null => {
      if (!r?.person_name || String(r.person_name).split(/\s+/).length < 2) {
        console.log("[pplx] dropped (no person):", JSON.stringify(r).slice(0, 200));
        return null;
      }
      if (!r?.source_url || !String(r.source_url).startsWith("http")) {
        console.log("[pplx] dropped (no url):", r?.source_url);
        return null;
      }
      const kind = clampKind(String(r.kind ?? ""));
      if (!kind) {
        console.log("[pplx] dropped (off-topic kind):", r?.kind);
        return null;
      }
      return {
        kind,
        title: String(r.title ?? "").slice(0, 240) || `${r.person_name} signal`,
        summary: String(r.summary ?? "").slice(0, 400),
        person_name: String(r.person_name).trim(),
        person_role: String(r.person_role ?? "").trim(),
        company: String(r.company ?? "").trim(),
        geography: String(r.geography ?? "Global").trim() || "Global",
        source_name: String(r.source_name ?? "Perplexity").trim() || "Perplexity",
        source_url: String(r.source_url),
        confidence: clampConfidence(String(r.confidence ?? "medium")),
        evidence: String(r.evidence ?? "").slice(0, 500),
        why_matters: String(r.why_matters ?? "Worth a closer look.").slice(0, 400),
        observed_at: safeIso(r.observed_at),
        tags: Array.isArray(r.tags) ? r.tags.map((t: unknown) => String(t)).slice(0, 5) : [],
        image_url: typeof r.image_url === "string" && r.image_url.startsWith("http") ? r.image_url : "",
        source_priority: sourcePriority(String(r.source_url)),
      };
    })
    .filter((x): x is PplxSignal => x !== null);
  console.log("[pplx] kept after filter:", out.length);

  // Dedupe: keep the highest-priority entry per (person + company) and per source_url.
  const byKey = new Map<string, PplxSignal>();
  const seenUrls = new Set<string>();
  // Sort by priority desc, then most recent first, so the first insert wins.
  const sorted = [...out].sort((a, b) => {
    if (b.source_priority !== a.source_priority) return b.source_priority - a.source_priority;
    return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
  });
  for (const s of sorted) {
    const url = s.source_url.split("#")[0].split("?")[0];
    if (seenUrls.has(url)) continue;
    const key = `${normalizeKey(s.person_name)}|${normalizeKey(s.company)}|${s.kind}`;
    if (byKey.has(key)) continue;
    byKey.set(key, s);
    seenUrls.add(url);
  }
  const deduped = [...byKey.values()];
  console.log("[pplx] after dedupe:", deduped.length);
  return deduped;
}

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

  try {
    const signals = await callPerplexity();

    if (signals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total_fetched: 0, total_inserted: 0, replaced: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Replace mode: wipe existing rows, then insert fresh ones.
    const del = await supabase.from("signals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (del.error) throw new Error(`delete failed: ${del.error.message}`);

    const rows = signals.map((s) => ({
      external_id: `pplx-${hashString(s.source_url + s.person_name)}`,
      source: s.source_name,
      kind: s.kind,
      title: s.title,
      summary: s.summary,
      entity: s.company || s.person_name,
      geography: s.geography,
      source_url: s.source_url,
      confidence: s.confidence,
      tags: s.tags,
      evidence_snippet: s.evidence,
      why_matters: s.why_matters,
      observed_at: s.observed_at,
      person_name: s.person_name,
      person_role: s.person_role,
      company: s.company,
      image_url: s.image_url,
    }));

    const ins = await supabase
      .from("signals")
      .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: false })
      .select("id");

    if (ins.error) throw new Error(`insert failed: ${ins.error.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: signals.length,
        total_inserted: ins.data?.length ?? 0,
        replaced: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[signals-perplexity] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
