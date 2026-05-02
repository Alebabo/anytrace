// Phase 1 fallback only - production data flows through src/lib/api.ts.
import type { ConvergenceAlert, Founder, Investor, Signal } from "./types";

const xProfile = (handle: string) => `https://x.com/${handle}`;
const linkedinSearch = (query: string) =>
  `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(query)}`;

const daysAgo = (n: number, h = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

export const investors: Investor[] = [
  { id: "inv-elad-gil", name: "Elad Gil", title: "Solo GP", tier: "angel", avatarColor: "12 80% 55%", group: "US", country: "US", twitterHandle: "eladgil", linkedinUrl: "#" },
  { id: "inv-naval", name: "Naval Ravikant", title: "Angel", tier: "angel", avatarColor: "240 60% 55%", group: "US", country: "US", twitterHandle: "naval" },
  { id: "inv-lenny", name: "Lenny Rachitsky", title: "Angel", tier: "angel", avatarColor: "330 70% 55%", group: "US", country: "US", twitterHandle: "lennysan" },
  { id: "inv-andrej", name: "Andrej Karpathy", title: "Angel - ex-OpenAI", tier: "angel", avatarColor: "200 75% 50%", group: "US", country: "US", twitterHandle: "karpathy", githubUsername: "karpathy" },
  { id: "inv-guillermo", name: "Guillermo Rauch", title: "CEO Vercel", tier: "angel", avatarColor: "0 0% 20%", group: "US", country: "US", twitterHandle: "rauchg", githubUsername: "rauchg" },
  { id: "inv-paul-graham", name: "Paul Graham", title: "YC", tier: "angel", avatarColor: "20 75% 50%", group: "US", country: "US", twitterHandle: "paulg" },
  { id: "inv-sahil", name: "Sahil Lavingia", title: "Gumroad", tier: "angel", avatarColor: "280 65% 55%", group: "US", country: "US", twitterHandle: "shl" },
  { id: "inv-pa-jens", name: "Jens Lapinski", title: "Project A", tier: "vc", avatarColor: "48 95% 55%", group: "DE", country: "DE", firm: "Project A", linkedinUrl: "#" },
  { id: "inv-pa-uwe", name: "Uwe Horstmann", title: "Project A", tier: "vc", avatarColor: "48 90% 50%", group: "DE", country: "DE", firm: "Project A", linkedinUrl: "#" },
  { id: "inv-yellow-jan", name: "Jan Beckers", title: "Yellow VC", tier: "vc", avatarColor: "55 100% 50%", group: "DE", country: "DE", firm: "Yellow", linkedinUrl: "#" },
  { id: "inv-yellow-mara", name: "Mara Steiner", title: "Yellow VC", tier: "vc", avatarColor: "50 95% 55%", group: "DE", country: "DE", firm: "Yellow", linkedinUrl: "#" },
  { id: "inv-index-martin", name: "Martin Mignot", title: "Index Ventures", tier: "vc", avatarColor: "210 70% 50%", group: "UK", country: "GB", firm: "Index", twitterHandle: "mmignot" },
  { id: "inv-a16z-sarah", name: "Sarah Wang", title: "a16z", tier: "vc", avatarColor: "180 65% 45%", group: "US", country: "US", firm: "a16z", twitterHandle: "sarahdingwang" },
  { id: "inv-sequoia-konstantine", name: "Konstantine Buhler", title: "Sequoia", tier: "vc", avatarColor: "150 60% 45%", group: "US", country: "US", firm: "Sequoia", twitterHandle: "konstantine" },
  { id: "inv-pointnine-christoph", name: "Christoph Janz", title: "Point Nine", tier: "microvc", avatarColor: "30 75% 55%", group: "DE", country: "DE", firm: "Point Nine", twitterHandle: "chrija" },
  { id: "inv-hedeyay", name: "Hedeyay", title: "Judge", tier: "vc", avatarColor: "140 55% 45%", group: "Judge", country: "AE", firm: "Main Jury", twitterHandle: "hedeyay", linkedinUrl: linkedinSearch("Hedeyay venture capital") },
  { id: "inv-victor-navgar", name: "Victor Navgar", title: "Judge", tier: "vc", avatarColor: "12 78% 54%", group: "Judge", country: "ES", firm: "Main Jury", twitterHandle: "victornavgar", linkedinUrl: linkedinSearch("Victor Navgar venture capital") },
];

const investorMap = new Map(investors.map((i) => [i.id, i]));
export const investorById = (id: string): Investor =>
  investorMap.get(id) ?? {
    id,
    name: "Unknown",
    title: "",
    tier: "vc",
    avatarColor: "0 0% 50%",
    group: "",
  };

export const founders: Founder[] = [
  {
    id: "f-mira-okafor",
    name: "Mira Okafor",
    headline: "Building autonomous coding agents - stealth",
    location: "Berlin, DE",
    company: "Loomtype",
    companyUrl: "https://loomtype.dev",
    initials: "MO",
    avatarColor: "12 70% 55%",
    twitterHandle: "miraokafor",
    githubUsername: "mokafor",
    linkedinUrl: linkedinSearch("Mira Okafor"),
  },
  {
    id: "f-jonas-weber",
    name: "Jonas Weber",
    headline: "ex-Stripe, prototyping payment infra for AI agents",
    location: "Munich, DE",
    company: "Ledgerly",
    companyUrl: "https://ledgerly.io",
    initials: "JW",
    avatarColor: "210 70% 50%",
    twitterHandle: "jonasw",
    githubUsername: "jonasw",
    linkedinUrl: linkedinSearch("Jonas Weber fintech"),
  },
  {
    id: "f-amelia-chen",
    name: "Amelia Chen",
    headline: "Voice AI for clinical workflows",
    location: "London, UK",
    company: "Auralis Health",
    companyUrl: "https://auralis.health",
    initials: "AC",
    avatarColor: "330 65% 55%",
    twitterHandle: "ameliac",
    linkedinUrl: linkedinSearch("Amelia Chen voice ai"),
  },
  {
    id: "f-rasmus-lind",
    name: "Rasmus Lind",
    headline: "Open-source vector DB for embedded devices",
    location: "Stockholm, SE",
    company: "Tinyvex",
    companyUrl: "https://tinyvex.dev",
    initials: "RL",
    avatarColor: "150 60% 45%",
    githubUsername: "rasmuslind",
    twitterHandle: "rasmuslind",
    linkedinUrl: linkedinSearch("Rasmus Lind vector database"),
  },
  {
    id: "f-priya-shah",
    name: "Priya Shah",
    headline: "Reinventing financial close for mid-market",
    location: "Berlin, DE",
    company: "Closebook",
    companyUrl: "https://closebook.co",
    initials: "PS",
    avatarColor: "280 60% 55%",
    linkedinUrl: linkedinSearch("Priya Shah closebook"),
    twitterHandle: "priyashah",
  },
  {
    id: "f-tomas-novak",
    name: "Tomas Novak",
    headline: "Spatial computing toolkit for designers",
    location: "Prague, CZ",
    company: "Layerframe",
    initials: "TN",
    avatarColor: "48 80% 50%",
    githubUsername: "tnovak",
    twitterHandle: "tnovak",
    linkedinUrl: linkedinSearch("Tomas Novak spatial computing"),
  },
  {
    id: "f-leah-grant",
    name: "Leah Grant",
    headline: "Compliance copilots for fintech ops",
    location: "Amsterdam, NL",
    company: "Northrule",
    companyUrl: "https://northrule.eu",
    initials: "LG",
    avatarColor: "190 65% 50%",
    linkedinUrl: linkedinSearch("Leah Grant compliance fintech"),
    twitterHandle: "leahgrant",
  },
  {
    id: "f-felix-bauer",
    name: "Felix Bauer",
    headline: "Robotics OS for warehouse automation",
    location: "Zurich, CH",
    company: "Cobalt Robotics",
    initials: "FB",
    avatarColor: "20 70% 50%",
    linkedinUrl: linkedinSearch("Felix Bauer robotics"),
    githubUsername: "fbauer",
    twitterHandle: "felixbauer",
  },
];

type SignalSeed = Omit<Signal, "id">;

const signalsByFounder: Record<string, SignalSeed[]> = {
  "f-mira-okafor": [
    { investorId: "inv-andrej", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(1) },
    { investorId: "inv-guillermo", platform: "github", action: "starred", target: "loomtype/agent-core", url: "https://github.com/loomtype/agent-core", occurredAt: daysAgo(2) },
    { investorId: "inv-elad-gil", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(3) },
    { investorId: "inv-pa-jens", platform: "linkedin", action: "connected", target: "Mira Okafor", url: "#", occurredAt: daysAgo(4) },
    { investorId: "inv-yellow-jan", platform: "linkedin", action: "connected", target: "Mira Okafor", url: "#", occurredAt: daysAgo(5) },
    { investorId: "inv-sequoia-konstantine", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(2) },
    { investorId: "inv-a16z-sarah", platform: "twitter", action: "replied", target: "@miraokafor agent thread", url: xProfile("miraokafor"), occurredAt: daysAgo(3) },
    { investorId: "inv-index-martin", platform: "linkedin", action: "connected", target: "Mira Okafor", url: "#", occurredAt: daysAgo(4) },
    { investorId: "inv-pointnine-christoph", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(5) },
    { investorId: "inv-naval", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(2) },
    { investorId: "inv-paul-graham", platform: "twitter", action: "replied", target: "@miraokafor demo", url: xProfile("miraokafor"), occurredAt: daysAgo(6) },
    { investorId: "inv-lenny", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(7) },
    { investorId: "inv-pa-uwe", platform: "github", action: "starred", target: "loomtype/agent-core", url: "https://github.com/loomtype/agent-core", occurredAt: daysAgo(3) },
    { investorId: "inv-yellow-mara", platform: "linkedin", action: "endorsed", target: "Mira Okafor", url: "#", occurredAt: daysAgo(6) },
    { investorId: "inv-hedeyay", platform: "linkedin", action: "connected", target: "Mira Okafor", url: linkedinSearch("Mira Okafor"), occurredAt: daysAgo(1, 11) },
    { investorId: "inv-hedeyay", platform: "twitter", action: "followed", target: "@miraokafor", url: xProfile("miraokafor"), occurredAt: daysAgo(1, 12) },
  ],
  "f-jonas-weber": [
    { investorId: "inv-pa-uwe", platform: "linkedin", action: "connected", target: "Jonas Weber", url: "#", occurredAt: daysAgo(2) },
    { investorId: "inv-yellow-mara", platform: "linkedin", action: "connected", target: "Jonas Weber", url: "#", occurredAt: daysAgo(3) },
    { investorId: "inv-index-martin", platform: "twitter", action: "followed", target: "@jonasw", url: xProfile("jonasw"), occurredAt: daysAgo(4) },
    { investorId: "inv-pointnine-christoph", platform: "linkedin", action: "endorsed", target: "Jonas Weber", url: "#", occurredAt: daysAgo(6) },
    { investorId: "inv-hedeyay", platform: "linkedin", action: "connected", target: "Jonas Weber", url: linkedinSearch("Jonas Weber"), occurredAt: daysAgo(1, 13) },
  ],
  "f-amelia-chen": [
    { investorId: "inv-sequoia-konstantine", platform: "twitter", action: "followed", target: "@ameliac", url: xProfile("ameliac"), occurredAt: daysAgo(2) },
    { investorId: "inv-a16z-sarah", platform: "twitter", action: "replied", target: "@ameliac launch thread", url: xProfile("ameliac"), occurredAt: daysAgo(3) },
    { investorId: "inv-yellow-jan", platform: "linkedin", action: "connected", target: "Amelia Chen", url: "#", occurredAt: daysAgo(7) },
    { investorId: "inv-hedeyay", platform: "linkedin", action: "connected", target: "Amelia Chen", url: linkedinSearch("Amelia Chen"), occurredAt: daysAgo(2, 10) },
  ],
  "f-rasmus-lind": [
    { investorId: "inv-andrej", platform: "github", action: "starred", target: "tinyvex/tinyvex", url: "https://github.com/tinyvex/tinyvex", occurredAt: daysAgo(1) },
    { investorId: "inv-guillermo", platform: "github", action: "starred", target: "tinyvex/tinyvex", url: "https://github.com/tinyvex/tinyvex", occurredAt: daysAgo(2) },
    { investorId: "inv-naval", platform: "twitter", action: "followed", target: "@rasmuslind", url: xProfile("rasmuslind"), occurredAt: daysAgo(3) },
    { investorId: "inv-pa-jens", platform: "linkedin", action: "connected", target: "Rasmus Lind", url: "#", occurredAt: daysAgo(5) },
    { investorId: "inv-victor-navgar", platform: "twitter", action: "followed", target: "@rasmuslind", url: xProfile("rasmuslind"), occurredAt: daysAgo(2, 15) },
  ],
  "f-priya-shah": [
    { investorId: "inv-pa-jens", platform: "linkedin", action: "connected", target: "Priya Shah", url: "#", occurredAt: daysAgo(3) },
    { investorId: "inv-pa-uwe", platform: "linkedin", action: "endorsed", target: "Priya Shah", url: "#", occurredAt: daysAgo(4) },
    { investorId: "inv-pointnine-christoph", platform: "linkedin", action: "connected", target: "Priya Shah", url: "#", occurredAt: daysAgo(6) },
  ],
  "f-tomas-novak": [
    { investorId: "inv-guillermo", platform: "twitter", action: "followed", target: "@tnovak", url: xProfile("tnovak"), occurredAt: daysAgo(2) },
    { investorId: "inv-sahil", platform: "twitter", action: "replied", target: "@tnovak demo", url: xProfile("tnovak"), occurredAt: daysAgo(4) },
    { investorId: "inv-yellow-mara", platform: "linkedin", action: "connected", target: "Tomas Novak", url: "#", occurredAt: daysAgo(8) },
    { investorId: "inv-victor-navgar", platform: "linkedin", action: "connected", target: "Tomas Novak", url: linkedinSearch("Tomas Novak"), occurredAt: daysAgo(2, 11) },
  ],
  "f-leah-grant": [
    { investorId: "inv-lenny", platform: "twitter", action: "followed", target: "@leahgrant", url: xProfile("leahgrant"), occurredAt: daysAgo(2) },
    { investorId: "inv-yellow-jan", platform: "linkedin", action: "connected", target: "Leah Grant", url: "#", occurredAt: daysAgo(5) },
    { investorId: "inv-pointnine-christoph", platform: "linkedin", action: "connected", target: "Leah Grant", url: "#", occurredAt: daysAgo(7) },
    { investorId: "inv-victor-navgar", platform: "linkedin", action: "connected", target: "Leah Grant", url: linkedinSearch("Leah Grant"), occurredAt: daysAgo(1, 10) },
    { investorId: "inv-victor-navgar", platform: "twitter", action: "followed", target: "@leahgrant", url: xProfile("leahgrant"), occurredAt: daysAgo(1, 14) },
  ],
  "f-felix-bauer": [
    { investorId: "inv-pa-uwe", platform: "linkedin", action: "connected", target: "Felix Bauer", url: "#", occurredAt: daysAgo(4) },
    { investorId: "inv-paul-graham", platform: "twitter", action: "followed", target: "@felixbauer", url: xProfile("felixbauer"), occurredAt: daysAgo(9) },
  ],
};

export const alerts: ConvergenceAlert[] = founders.map((founder, idx) => {
  const seeds = signalsByFounder[founder.id] ?? [];
  const signals: Signal[] = seeds.map((s, i) => ({ ...s, id: `${founder.id}-s${i}` }));
  const triggered = signals.reduce(
    (acc, s) => (s.occurredAt > acc ? s.occurredAt : acc),
    signals[0]?.occurredAt ?? daysAgo(1)
  );
  return {
    id: `alert-${idx}`,
    founder,
    signals,
    windowDays: 14,
    triggeredAt: triggered,
  };
});

export function formatRelative(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
