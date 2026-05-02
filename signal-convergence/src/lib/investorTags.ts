import type { Investor } from "@/data/types";
import { resolveCountryCode } from "@/lib/country";

/**
 * Best-effort country code from investor data.
 * Backend sends the country (full name or code) in the `group` field for investors,
 * and may also send a dedicated `country` field. Either is accepted.
 */
export function investorCountryCode(inv: Pick<Investor, "country" | "group">): string | undefined {
  // If neither field resolves to a known country, fall back to "Europe" (EU).
  return (
    resolveCountryCode(inv.country) ??
    resolveCountryCode(inv.group) ??
    "EU"
  );
}

/**
 * Top industries an investor focuses on. Uses explicit `industries` if provided,
 * otherwise infers from title/firm keywords. Returns at most `max` tags.
 */
export function investorIndustries(
  inv: Pick<Investor, "industries" | "title" | "firm">,
  max = 3,
): string[] {
  if (inv.industries?.length) return inv.industries.slice(0, max);

  const haystack = `${inv.title ?? ""} ${inv.firm ?? ""}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["AI", /\b(ai|ml|llm|genai|machine learning|artificial intelligence)\b/],
    ["Developer Tools", /\b(devtool|developer|infra|infrastructure|open source|oss|platform)\b/],
    ["Fintech", /\b(fintech|payments|banking|finance|crypto|web3|defi)\b/],
    ["SaaS", /\b(saas|b2b|enterprise|productivity)\b/],
    ["Health", /\b(health|bio|medical|clinical|wellness)\b/],
    ["Consumer", /\b(consumer|social|creator|marketplace|commerce|retail)\b/],
    ["Climate", /\b(climate|energy|sustainab|carbon)\b/],
    ["Security", /\b(security|cyber|privacy)\b/],
    ["Robotics", /\b(robot|hardware|iot|spatial)\b/],
  ];
  const out: string[] = [];
  for (const [label, re] of rules) {
    if (re.test(haystack)) out.push(label);
    if (out.length >= max) break;
  }
  return out;
}