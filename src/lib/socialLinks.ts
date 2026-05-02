/**
 * Build a LinkedIn link for a person. If a direct profile URL is known we use it;
 * otherwise we fall back to a LinkedIn people-search URL using their name and
 * (optionally) company. This guarantees every person gets a clickable LinkedIn
 * affordance instead of silently hiding the icon.
 */
export function linkedinLinkFor(opts: {
  name: string;
  linkedinUrl?: string | null;
  company?: string | null;
  firm?: string | null;
  title?: string | null;
}): { href: string; isDirect: boolean } {
  if (opts.linkedinUrl) return { href: opts.linkedinUrl, isDirect: true };
  const keywords = [opts.name, opts.company ?? opts.firm ?? "", opts.title ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const href = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    keywords || opts.name,
  )}`;
  return { href, isDirect: false };
}