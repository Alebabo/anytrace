import type { ConvergenceAlert, Founder, Investor, Signal } from "@/data/types";

const xProfile = (handle: string) => `https://x.com/${handle}`;
const linkedinSearch = (query: string) =>
  `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(query)}`;

const daysAgo = (n: number, h = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

const judgeInvestors: Investor[] = [
  {
    id: "inv-hedeyay",
    name: "Hedeyay",
    title: "Judge",
    tier: "vc",
    avatarColor: "140 55% 45%",
    group: "Judge",
    country: "AE",
    firm: "Main Jury",
    twitterHandle: "hedeyay",
    linkedinUrl: linkedinSearch("Hedeyay venture capital"),
  },
  {
    id: "inv-victor-navgar",
    name: "Victor Navgar",
    title: "Judge",
    tier: "vc",
    avatarColor: "12 78% 54%",
    group: "Judge",
    country: "ES",
    firm: "Main Jury",
    twitterHandle: "victornavgar",
    linkedinUrl: linkedinSearch("Victor Navgar venture capital"),
  },
];

const founderPatches: Record<string, Partial<Founder>> = {
  "f-mira-okafor": {
    linkedinUrl: linkedinSearch("Mira Okafor"),
    twitterHandle: "miraokafor",
  },
  "f-jonas-weber": {
    linkedinUrl: linkedinSearch("Jonas Weber fintech"),
    twitterHandle: "jonasw",
  },
  "f-amelia-chen": {
    linkedinUrl: linkedinSearch("Amelia Chen voice ai"),
    twitterHandle: "ameliac",
  },
  "f-rasmus-lind": {
    linkedinUrl: linkedinSearch("Rasmus Lind vector database"),
    twitterHandle: "rasmuslind",
  },
  "f-priya-shah": {
    linkedinUrl: linkedinSearch("Priya Shah closebook"),
    twitterHandle: "priyashah",
  },
  "f-tomas-novak": {
    linkedinUrl: linkedinSearch("Tomas Novak spatial computing"),
    twitterHandle: "tnovak",
  },
  "f-leah-grant": {
    linkedinUrl: linkedinSearch("Leah Grant compliance fintech"),
    twitterHandle: "leahgrant",
  },
  "f-felix-bauer": {
    linkedinUrl: linkedinSearch("Felix Bauer robotics"),
    twitterHandle: "felixbauer",
  },
};

type OverlaySignalSeed = Omit<Signal, "id">;

const alertSignalOverlay: Record<string, OverlaySignalSeed[]> = {
  "f-mira-okafor": [
    {
      investorId: "inv-hedeyay",
      platform: "linkedin",
      action: "connected",
      target: "Mira Okafor",
      url: linkedinSearch("Mira Okafor"),
      occurredAt: daysAgo(1, 11),
    },
    {
      investorId: "inv-hedeyay",
      platform: "twitter",
      action: "followed",
      target: "@miraokafor",
      url: xProfile("miraokafor"),
      occurredAt: daysAgo(1, 12),
    },
  ],
  "f-jonas-weber": [
    {
      investorId: "inv-hedeyay",
      platform: "linkedin",
      action: "connected",
      target: "Jonas Weber",
      url: linkedinSearch("Jonas Weber"),
      occurredAt: daysAgo(1, 13),
    },
  ],
  "f-amelia-chen": [
    {
      investorId: "inv-hedeyay",
      platform: "linkedin",
      action: "connected",
      target: "Amelia Chen",
      url: linkedinSearch("Amelia Chen"),
      occurredAt: daysAgo(2, 10),
    },
  ],
  "f-rasmus-lind": [
    {
      investorId: "inv-victor-navgar",
      platform: "twitter",
      action: "followed",
      target: "@rasmuslind",
      url: xProfile("rasmuslind"),
      occurredAt: daysAgo(2, 15),
    },
  ],
  "f-tomas-novak": [
    {
      investorId: "inv-victor-navgar",
      platform: "linkedin",
      action: "connected",
      target: "Tomas Novak",
      url: linkedinSearch("Tomas Novak"),
      occurredAt: daysAgo(2, 11),
    },
  ],
  "f-leah-grant": [
    {
      investorId: "inv-victor-navgar",
      platform: "linkedin",
      action: "connected",
      target: "Leah Grant",
      url: linkedinSearch("Leah Grant"),
      occurredAt: daysAgo(1, 10),
    },
    {
      investorId: "inv-victor-navgar",
      platform: "twitter",
      action: "followed",
      target: "@leahgrant",
      url: xProfile("leahgrant"),
      occurredAt: daysAgo(1, 14),
    },
  ],
};

const mergeById = <T extends { id: string }>(base: T[], overlay: T[]) => {
  const map = new Map(base.map((item) => [item.id, item]));
  overlay.forEach((item) => {
    map.set(item.id, item);
  });
  return Array.from(map.values());
};

export const overlayInvestors = (live: Investor[]): Investor[] =>
  mergeById(live, judgeInvestors);

export const overlayFounders = (live: Founder[]): Founder[] =>
  live.map((founder) =>
    founderPatches[founder.id] ? { ...founder, ...founderPatches[founder.id] } : founder,
  );

const overlaySignalsForFounder = (founderId: string, live: Signal[]): Signal[] => {
  const extra = (alertSignalOverlay[founderId] ?? []).map((signal, index) => ({
    ...signal,
    id: `${founderId}-judge-${index}`,
  }));
  const seen = new Set(live.map((signal) => signal.id));
  return [...live, ...extra.filter((signal) => !seen.has(signal.id))];
};

export const overlayAlerts = (live: ConvergenceAlert[]): ConvergenceAlert[] =>
  live.map((alert) => {
    const founder = founderPatches[alert.founder.id]
      ? { ...alert.founder, ...founderPatches[alert.founder.id] }
      : alert.founder;
    const signals = overlaySignalsForFounder(alert.founder.id, alert.signals);
    const triggeredAt = signals.reduce(
      (latest, signal) => (signal.occurredAt > latest ? signal.occurredAt : latest),
      alert.triggeredAt,
    );
    return {
      ...alert,
      founder,
      signals,
      triggeredAt,
    };
  });

export const overlayFounderDetail = (
  live: Founder & { alerts: ConvergenceAlert[] },
): Founder & { alerts: ConvergenceAlert[] } => ({
  ...live,
  ...(founderPatches[live.id] ?? {}),
  alerts: overlayAlerts(live.alerts),
});

export const overlayPerson = (live: Investor | Founder): Investor | Founder => {
  if ("tier" in live) {
    return overlayInvestors([live])[0] ?? live;
  }
  return founderPatches[live.id] ? { ...live, ...founderPatches[live.id] } : live;
};
