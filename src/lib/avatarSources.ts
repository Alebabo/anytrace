import type { PersonIdentity, TrackedPerson, VcSource } from "@/data/anytrace";

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
  if (!handle) return null;
  const fallback = fallbackName ? "?fallback=false" : "";
  return `https://unavatar.io/x/${handle}${fallback}`;
}

function githubAvatar(username?: string | null, size = 160) {
  if (!username) return null;
  return `https://github.com/${username}.png?size=${size}`;
}

export function avatarSourcesForPerson(person: TrackedPerson, identities: PersonIdentity[]) {
  const github = identities.find((identity) => identity.platform === "github")?.handle;
  const x = identities.find((identity) => identity.platform === "x")?.handle;
  const linkedin = identities.find((identity) => identity.platform === "linkedin")?.profileUrl;

  return [
    person.avatarUrl ?? null,
    githubAvatar(github),
    unavatarX(x, person.fullName),
    unavatarLinkedin(linkedin, person.fullName),
  ].filter((value): value is string => !!value);
}

export function avatarSourcesForVc(vc: VcSource) {
  const xHandle = vc.xHandle ?? vc.twitterUrl?.split("/").filter(Boolean).at(-1) ?? null;

  return [
    unavatarLinkedin(vc.linkedinUrl, vc.name),
    vc.githubUsername ? githubAvatar(vc.githubUsername) : null,
    unavatarX(xHandle, vc.name),
  ].filter((value): value is string => !!value);
}
