import type { SeedFollowAlert, SeedFollowPromotionDraft } from "@/data/traqr";

const JOURNALIST_ROLE_KEYWORDS = [
  "journalist",
  "reporter",
  "editor",
  "columnist",
  "correspondent",
  "news writer",
  "staff writer",
  "media",
  "press",
];

const JOURNALIST_OUTLET_KEYWORDS = [
  "axios",
  "bloomberg",
  "business insider",
  "cnbc",
  "financial times",
  "forbes",
  "fortune",
  "sifted",
  "tech.eu",
  "techcrunch",
  "the information",
  "the wall street journal",
  "wired",
  "wsj",
];

export function isPromotedSeedFollowAlert(alert: SeedFollowAlert) {
  return (alert.status || "").toLowerCase() === "promoted" || Boolean(alert.promotedVcId || alert.promotedAt);
}

export function isArchivedSeedFollowAlert(alert: SeedFollowAlert) {
  return (alert.status || "").toLowerCase() === "archived";
}

export function isLikedSeedFollowAlert(alert: SeedFollowAlert) {
  return (alert.status || "").toLowerCase() === "liked";
}

export function isActiveSeedFollowAlert(alert: SeedFollowAlert) {
  return !isPromotedSeedFollowAlert(alert);
}

export function isVisibleSeedFollowAlert(alert: SeedFollowAlert) {
  return isActiveSeedFollowAlert(alert) && !isArchivedSeedFollowAlert(alert);
}

function handleFromProfileUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(url.hostname.toLowerCase())) return "";
    return url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") || "";
  } catch {
    return "";
  }
}

export function looksLikeJournalistAlert(alert: SeedFollowAlert) {
  const haystack = [
    alert.displayName,
    alert.linkedinHeadline,
    alert.linkedinRoleTitle,
    alert.linkedinCompany,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) return false;

  return (
    JOURNALIST_ROLE_KEYWORDS.some((keyword) => haystack.includes(keyword)) ||
    JOURNALIST_OUTLET_KEYWORDS.some((keyword) => haystack.includes(keyword))
  );
}

export function buildSeedPromotionDraft(alert: SeedFollowAlert): SeedFollowPromotionDraft {
  const xHandle = (alert.xHandle || handleFromProfileUrl(alert.primaryProfileUrl)).replace(/^@/, "").trim();
  const name = (alert.displayName || xHandle || "Seed account").trim();
  const clusterName = (alert.linkedinCompany || name).trim();
  const isJournalist = looksLikeJournalistAlert(alert);

  return {
    alertId: alert.id,
    name,
    xHandle,
    linkedinUrl: (alert.linkedinUrl || "").trim(),
    clusterName,
    accountType: isJournalist ? "journalist" : "partner",
    tier: isJournalist ? "journalist" : "microvc",
  };
}
