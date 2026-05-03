import { describe, expect, it } from "vitest";
import { buildWeeklyPicks } from "@/lib/weeklyPicks";
import { demoActivityEvents, demoTrackedPeople } from "@/data/demoAnytrace";

describe("buildWeeklyPicks", () => {
  it("ranks people by VC follow bursts first", () => {
    const picks = buildWeeklyPicks(demoTrackedPeople, demoActivityEvents);
    expect(picks[0]?.person.slug).toBe("anton-osika");
    expect(picks[0]?.vcFollowCount).toBeGreaterThanOrEqual(2);
  });

  it("includes important github follower reasons when present", () => {
    const picks = buildWeeklyPicks(demoTrackedPeople, demoActivityEvents);
    const rauch = picks.find((pick) => pick.person.slug === "guillermo-rauch");
    expect(rauch?.reasons.some((reason) => reason.reasonKind === "important_github_followers")).toBe(true);
  });
});
