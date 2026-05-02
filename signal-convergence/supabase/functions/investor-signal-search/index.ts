const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchBody {
  investorName: string;
  investorContext?: string;
  recency?: "day" | "week" | "month" | "year";
}

interface SignalCard {
  platform: "twitter" | "linkedin" | "github" | "web" | "podcast" | "news" | "other";
  action: string;
  target: string;
  url: string;
  occurredAt: string | null;
  evidence: string;
}

const SYSTEM = `You are a research analyst tracking what venture investors are publicly engaging with.
Given an investor's name (and optional context), find their most recent public signals: tweets, retweets, LinkedIn posts/comments, GitHub stars/forks/follows, podcasts, interviews, panels, blog posts, and any company they've publicly engaged with.
Only include items you can ground in a citation. Prefer the last 7-30 days.
Return STRICT JSON matching the provided schema. No prose outside JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-4 sentence prose summary of what this investor has been signaling lately.",
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["twitter", "linkedin", "github", "web", "podcast", "news", "other"],
          },
          action: {
            type: "string",
            description:
              "Short verb phrase: 'tweeted', 'replied to', 'starred repo', 'posted on LinkedIn', 'appeared on podcast', etc.",
          },
          target: {
            type: "string",
            description: "What they engaged with — e.g. founder name, repo, company, post title.",
          },
          url: { type: "string" },
          occurredAt: {
            type: ["string", "null"],
            description: "ISO date if known, otherwise null.",
          },
          evidence: {
            type: "string",
            description: "1-2 sentence quote or paraphrase explaining the signal.",
          },
        },
        required: ["platform", "action", "target", "url", "evidence"],
      },
    },
  },
  required: ["summary", "signals"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY_1");
    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "PERPLEXITY_API_KEY_1 not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as SearchBody;
    const investorName = (body.investorName || "").trim();
    if (!investorName) {
      return new Response(
        JSON.stringify({ error: "investorName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recency = body.recency ?? "month";
    const ctx = body.investorContext ? ` (${body.investorContext})` : "";
    const userPrompt = `Find recent public signals from venture investor "${investorName}"${ctx}.
Look across Twitter/X, LinkedIn, GitHub, podcasts, blog posts, and news.
List 5-12 concrete, cited signals from the last ${recency}. Include URLs.
Then write a 2-4 sentence summary of patterns (themes, sectors, founders they're tracking).`;

    const pplxRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        search_recency_filter: recency,
        response_format: {
          type: "json_schema",
          json_schema: { name: "investor_signals", schema: SCHEMA },
        },
      }),
    });

    if (!pplxRes.ok) {
      const text = await pplxRes.text();
      return new Response(
        JSON.stringify({ error: `Perplexity ${pplxRes.status}: ${text}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pplx = await pplxRes.json();
    const content: string = pplx?.choices?.[0]?.message?.content ?? "{}";
    const citations: string[] = pplx?.citations ?? [];

    let parsed: { summary: string; signals: SignalCard[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, signals: [] };
    }

    return new Response(
      JSON.stringify({
        investorName,
        recency,
        summary: parsed.summary ?? "",
        signals: parsed.signals ?? [],
        citations,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});