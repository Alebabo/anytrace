import type { PersonIdentity, TrackedPerson, VcSource } from "@/data/anytrace";

function normalizeHandle(handle?: string | null) {
  return handle?.replace(/^@/, "").trim() || null;
}

function lastPathSegment(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

function parseLinkedinResource(linkedinUrl?: string | null) {
  if (!linkedinUrl) return null;

  try {
    const parsed = new URL(linkedinUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (parts.length < 2) return null;
    if (parts[0] === "company") {
      return { type: "company" as const, key: parts[1] };
    }
    if (parts[0] === "in") {
      return { type: "user" as const, key: parts[1] };
    }
  } catch {
    return null;
  }

  return null;
}

function unavatarLinkedin(linkedinUrl?: string | null, fallbackName?: string) {
  const resource = parseLinkedinResource(linkedinUrl);
  if (!resource) return null;

  const fallback = fallbackName ? "&fallback=false" : "";
  return `https://unavatar.io/linkedin/${resource.type}:${resource.key}?ttl=7d${fallback}`;
}

function unavatarX(handle?: string | null, fallbackName?: string) {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;
  const fallback = fallbackName ? "?fallback=false" : "";
  return `https://unavatar.io/x/${normalizedHandle}${fallback}`;
}

function unavatarTwitter(handle?: string | null, fallbackName?: string) {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;
  const fallback = fallbackName ? "?fallback=false" : "";
  return `https://unavatar.io/twitter/${normalizedHandle}${fallback}`;
}

function githubAvatar(username?: string | null, size = 160) {
  const normalizedUsername = normalizeHandle(username);
  if (!normalizedUsername) return null;
  return `https://github.com/${normalizedUsername}.png?size=${size}`;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function definedIdentities(identities: Array<PersonIdentity | null | undefined>) {
  return identities.filter((identity): identity is PersonIdentity => Boolean(identity));
}

export function avatarSourcesForPerson(
  person: TrackedPerson | null | undefined,
  identities: Array<PersonIdentity | null | undefined>,
) {
  if (!person) return [];

  const safeIdentities = definedIdentities(identities);
  const githubIdentity = safeIdentities.find((identity) => identity.platform === "github");
  const xIdentity = safeIdentities.find((identity) => identity.platform === "x");
  const linkedinIdentity = safeIdentities.find((identity) => identity.platform === "linkedin");

  const github = githubIdentity?.handle || lastPathSegment(githubIdentity?.profileUrl);
  const x = xIdentity?.handle || lastPathSegment(xIdentity?.profileUrl);
  const linkedin = linkedinIdentity?.profileUrl ?? null;

  return uniqueStrings([
    person.avatarUrl ?? null,
    unavatarLinkedin(linkedin, person.fullName),
    githubAvatar(github),
    unavatarX(x, person.fullName),
    unavatarTwitter(x, person.fullName),
  ]);
}

export function avatarSourcesForVc(vc: VcSource) {
  const xHandle = normalizeHandle(vc.xHandle) ?? lastPathSegment(vc.twitterUrl);

  return uniqueStrings([
    unavatarLinkedin(vc.linkedinUrl, vc.name),
    unavatarX(xHandle, vc.name),
    unavatarTwitter(xHandle, vc.name),
    githubAvatar(vc.githubUsername),
    vc.websiteUrl ? `https://unavatar.io/${vc.websiteUrl}` : null,
  ]);
}
