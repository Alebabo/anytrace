import { describe, expect, it } from "vitest";
import type { SeedFollowAlert } from "@/data/traqr";
import {
  buildSeedPromotionDraft,
  isActiveSeedFollowAlert,
  isLikedSeedFollowAlert,
  isVisibleSeedFollowAlert,
} from "@/lib/seedFollowAlerts";

function makeAlert(overrides: Partial<SeedFollowAlert> = {}): SeedFollowAlert {
  return {
    id: "alert-1",
    personId: "x-promotedpartner",
    displayName: "Promoted Partner",
    xHandle: "PromotedPartner",
    primaryProfileUrl: "https://x.com/PromotedPartner",
    triggeredAt: "2026-05-01T12:00:00Z",
    alertThreshold: 2,
    triggeringSeedAccounts: [],
    seedFollowers: [],
    currentSeedFollowerCount: 3,
    status: "new",
    ...overrides,
  };
}

describe("seed follow alert helpers", () => {
  it("builds promotion defaults from an alert", () => {
    const draft = buildSeedPromotionDraft(
      makeAlert({
        xHandle: "@PromotedPartner",
        linkedinUrl: " https://www.linkedin.com/in/promotedpartner ",
        linkedinCompany: "Promoted Capital",
      }),
    );

    expect(draft).toEqual({
      alertId: "alert-1",
      name: "Promoted Partner",
      xHandle: "PromotedPartner",
      linkedinUrl: "https://www.linkedin.com/in/promotedpartner",
      clusterName: "Promoted Capital",
      accountType: "partner",
      tier: "microvc",
    });
  });

  it("falls back to the profile URL handle", () => {
    const draft = buildSeedPromotionDraft(makeAlert({ xHandle: null, primaryProfileUrl: "https://x.com/urlhandle" }));

    expect(draft.xHandle).toBe("urlhandle");
  });

  it("defaults journalist-looking alerts to journalist seed sources", () => {
    const draft = buildSeedPromotionDraft(
      makeAlert({
        linkedinHeadline: "Senior reporter covering AI startups",
        linkedinCompany: "TechCrunch",
      }),
    );

    expect(draft.accountType).toBe("journalist");
    expect(draft.tier).toBe("journalist");
    expect(draft.clusterName).toBe("TechCrunch");
  });

  it("filters promoted alerts from active lists", () => {
    expect(isActiveSeedFollowAlert(makeAlert())).toBe(true);
    expect(isActiveSeedFollowAlert(makeAlert({ status: "promoted" }))).toBe(false);
    expect(isActiveSeedFollowAlert(makeAlert({ promotedVcId: "vc-1" }))).toBe(false);
  });

  it("hides archived alerts from pick-style views", () => {
    expect(isVisibleSeedFollowAlert(makeAlert())).toBe(true);
    expect(isVisibleSeedFollowAlert(makeAlert({ status: "archived" }))).toBe(false);
    expect(isActiveSeedFollowAlert(makeAlert({ status: "archived" }))).toBe(true);
  });

  it("keeps liked alerts visible while marking their state", () => {
    const liked = makeAlert({ status: "liked" });

    expect(isLikedSeedFollowAlert(liked)).toBe(true);
    expect(isVisibleSeedFollowAlert(liked)).toBe(true);
  });
});
