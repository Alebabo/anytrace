import seedData from "@/data/localSeedData.json";
import type {
  ActivityEvent,
  AnytraceAppSettings,
  GithubSignalProfile,
  GraphData,
  GraphEdge,
  PersonIdentity,
  SeedFollowAlert,
  TrackedPerson,
  VcSource,
  WeeklyPick,
} from "@/data/anytrace";
import { isActiveSeedFollowAlert } from "@/lib/seedFollowAlerts";

type LocalSeedPayload = {
  version: string;
  vcSources: VcSource[];
  trackedPeople: TrackedPerson[];
  personIdentities: PersonIdentity[];
  activityEvents: ActivityEvent[];
  weeklyPicks: WeeklyPick[];
  seedFollowAlerts?: SeedFollowAlert[];
  githubSignalProfiles: GithubSignalProfile[];
  graphEdges: GraphEdge[];
  graphSource?: GraphData["graphSource"];
  appSettings?: AnytraceAppSettings;
};

type LocalOverlayState = {
  vcs: VcSource[];
  trackedPeople: TrackedPerson[];
  personIdentities: PersonIdentity[];
  hiddenVcIds: string[];
  hiddenTrackedPersonIds: string[];
};

const seed = seedData as LocalSeedPayload;
const STORAGE_VERSION_KEY = "anytrace.local.version";
const STORAGE_VCS_KEY = "anytrace.local.vcs";
const STORAGE_TRACKED_PEOPLE_KEY = "anytrace.local.tracked-people";
const STORAGE_IDENTITIES_KEY = "anytrace.local.identities";
const STORAGE_HIDDEN_VCS_KEY = "anytrace.local.hidden-vcs";
const STORAGE_HIDDEN_TRACKED_PEOPLE_KEY = "anytrace.local.hidden-tracked-people";
const LEGACY_REMOTE_AUTH_KEY = ["anytrace", "supa", "base", "session"].join(".");

let initialized = false;
let backendSnapshotPromise: Promise<LocalSeedPayload | null> | null = null;
let backendSnapshotCache: LocalSeedPayload | null = null;
let backendSnapshotState: "idle" | "ready" | "unavailable" = "idle";
let backendSnapshotLastError: string | null = null;

function backendBaseUrl() {
  const value = (import.meta.env.VITE_ANYTRACE_BACKEND_URL as string | undefined)?.trim();
  return value || "http://127.0.0.1:8766";
}

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function ensureInitialized() {
  if (initialized || !canUseStorage()) {
    initialized = true;
    return;
  }

  const currentVersion = window.localStorage.getItem(STORAGE_VERSION_KEY);
  if (currentVersion !== seed.version) {
    window.localStorage.removeItem(STORAGE_VCS_KEY);
    window.localStorage.removeItem(STORAGE_TRACKED_PEOPLE_KEY);
    window.localStorage.removeItem(STORAGE_IDENTITIES_KEY);
    window.localStorage.removeItem(STORAGE_HIDDEN_VCS_KEY);
    window.localStorage.removeItem(STORAGE_HIDDEN_TRACKED_PEOPLE_KEY);
    window.localStorage.removeItem(LEGACY_REMOTE_AUTH_KEY);
    window.localStorage.setItem(STORAGE_VERSION_KEY, seed.version);
  }

  initialized = true;
}

function readStorage<T>(key: string, fallback: T): T {
  ensureInitialized();
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  ensureInitialized();
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readOverlayState(): LocalOverlayState {
  return {
    vcs: readStorage(STORAGE_VCS_KEY, [] as VcSource[]),
    trackedPeople: readStorage(STORAGE_TRACKED_PEOPLE_KEY, [] as TrackedPerson[]),
    personIdentities: readStorage(STORAGE_IDENTITIES_KEY, [] as PersonIdentity[]),
    hiddenVcIds: readStorage(STORAGE_HIDDEN_VCS_KEY, [] as string[]),
    hiddenTrackedPersonIds: readStorage(STORAGE_HIDDEN_TRACKED_PEOPLE_KEY, [] as string[]),
  };
}

function writeOverlayState(state: LocalOverlayState) {
  writeStorage(STORAGE_VCS_KEY, state.vcs);
  writeStorage(STORAGE_TRACKED_PEOPLE_KEY, state.trackedPeople);
  writeStorage(STORAGE_IDENTITIES_KEY, state.personIdentities);
  writeStorage(STORAGE_HIDDEN_VCS_KEY, state.hiddenVcIds);
  writeStorage(STORAGE_HIDDEN_TRACKED_PEOPLE_KEY, state.hiddenTrackedPersonIds);
}

function mergedVcs(state: LocalOverlayState) {
  return mergedVcsFromBase(state, seed.vcSources);
}

function mergedVcsFromBase(state: LocalOverlayState, baseVcs: VcSource[]) {
  const hidden = new Set(state.hiddenVcIds);
  return [...baseVcs.filter((vc) => !hidden.has(vc.id)), ...state.vcs].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function mergedTrackedPeople(state: LocalOverlayState) {
  return mergedTrackedPeopleFromBase(state, seed.trackedPeople);
}

function mergedTrackedPeopleFromBase(state: LocalOverlayState, baseTrackedPeople: TrackedPerson[]) {
  const hidden = new Set(state.hiddenTrackedPersonIds);
  return [...baseTrackedPeople.filter((person) => !hidden.has(person.id)), ...state.trackedPeople].sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );
}

function mergedPersonIdentities(state: LocalOverlayState) {
  return mergedPersonIdentitiesFromBase(state, seed.personIdentities);
}

function mergedPersonIdentitiesFromBase(state: LocalOverlayState, baseIdentities: PersonIdentity[]) {
  const hidden = new Set(state.hiddenTrackedPersonIds);
  return [...baseIdentities.filter((identity) => !hidden.has(identity.personId)), ...state.personIdentities];
}

function mergedGraphPeople(state: LocalOverlayState) {
  return mergedTrackedPeople(state);
}

export function clearSignalCaches() {
  ensureInitialized();
  backendSnapshotPromise = null;
  backendSnapshotCache = null;
  backendSnapshotState = "idle";
  backendSnapshotLastError = null;
}

export function shouldRetryBackendSnapshot() {
  return backendSnapshotState !== "ready";
}

export function resetLocalWorkspace() {
  writeOverlayState({
    vcs: [],
    trackedPeople: [],
    personIdentities: [],
    hiddenVcIds: [],
    hiddenTrackedPersonIds: [],
  });
}

export async function addLocalVc(draft: {
  name: string;
  linkedinUrl?: string;
  xHandle?: string;
  tier?: VcSource["tier"];
  accountType?: VcSource["accountType"];
}) {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Seed source name is required.");
  }

  const state = readOverlayState();
  const handle = draft.xHandle?.trim().replace(/^@/, "") || null;
  const linkedinUrl = draft.linkedinUrl?.trim() || null;
  const tier = draft.tier || "vc";
  const accountType = draft.accountType || (tier === "journalist" ? "journalist" : "firm");
  const existing = mergedVcs(state).find(
    (vc) =>
      vc.name.toLowerCase() === name.toLowerCase() ||
      (!!handle && vc.xHandle?.toLowerCase() === handle.toLowerCase()) ||
      (!!linkedinUrl && vc.linkedinUrl?.toLowerCase() === linkedinUrl.toLowerCase()),
  );

  if (existing) {
    throw new Error("This seed source already exists in the local workspace.");
  }

  const vc: VcSource = {
    id: createId("local-vc"),
    slug: slugify(name),
    name,
    title: accountType === "journalist" || tier === "journalist" ? "Journalist" : "Investor",
    firm: name,
    sizeLabel: "Manual",
    sectorFocus: "",
    tier,
    region: "",
    country: "",
    city: "",
    xHandle: handle,
    twitterUrl: handle ? `https://x.com/${handle}` : null,
    xUserId: null,
    linkedinUrl,
    githubUsername: null,
    websiteUrl: null,
    clusterId: null,
    clusterName: name,
    accountType,
    isPrimaryClusterAccount: true,
    notes: "",
    isSeeded: false,
    createdByUserId: "local-anytrace-user",
    syncStatus: "idle",
    lastXSyncAt: null,
    lastGithubSyncAt: null,
    lastSyncError: null,
  };

  state.vcs = [...state.vcs, vc];
  writeOverlayState(state);
  return vc;
}

export async function removeLocalVc(vcSourceId: string) {
  const state = readOverlayState();
  const seedIds = new Set(seed.vcSources.map((vc) => vc.id));

  if (seedIds.has(vcSourceId)) {
    state.hiddenVcIds = [...new Set([...state.hiddenVcIds, vcSourceId])];
  } else {
    state.vcs = state.vcs.filter((vc) => vc.id !== vcSourceId);
  }

  writeOverlayState(state);
}

export async function addLocalTrackedPerson(draft: {
  fullName: string;
  githubHandle?: string;
  xHandle?: string;
  linkedinUrl?: string;
  roleTitle?: string;
  company?: string;
  location?: string;
  summary?: string;
}) {
  const fullName = draft.fullName.trim();
  if (!fullName) {
    throw new Error("Full name is required.");
  }

  const state = readOverlayState();
  const githubHandle = draft.githubHandle?.trim().replace(/^@/, "") || "";
  const xHandle = draft.xHandle?.trim().replace(/^@/, "") || "";
  const linkedinUrl = draft.linkedinUrl?.trim() || "";

  const existing = mergedTrackedPeople(state).find((person) => person.fullName.toLowerCase() === fullName.toLowerCase());
  if (existing) {
    throw new Error("This tracked person already exists in the local workspace.");
  }

  const personId = createId("local-person");
  const person: TrackedPerson = {
    id: personId,
    slug: slugify(fullName),
    fullName,
    roleTitle: draft.roleTitle?.trim() || "Tracked builder",
    company: draft.company?.trim() || "",
    location: draft.location?.trim() || "",
    summary: draft.summary?.trim() || "Manually added to the local workspace.",
    avatarUrl: null,
    topPickNote: "",
    isWatchlist: true,
  };

  const identities: PersonIdentity[] = [];
  if (githubHandle) {
    identities.push({
      id: `${personId}-github`,
      personId,
      platform: "github",
      handle: githubHandle,
      profileUrl: `https://github.com/${githubHandle}`,
      isPrimary: true,
    });
  }
  if (xHandle) {
    identities.push({
      id: `${personId}-x`,
      personId,
      platform: "x",
      handle: xHandle,
      profileUrl: `https://x.com/${xHandle}`,
      isPrimary: !githubHandle,
    });
  }
  if (linkedinUrl) {
    identities.push({
      id: `${personId}-linkedin`,
      personId,
      platform: "linkedin",
      handle: linkedinUrl,
      profileUrl: linkedinUrl,
      isPrimary: !githubHandle && !xHandle,
    });
  }

  state.trackedPeople = [...state.trackedPeople, person];
  state.personIdentities = [...state.personIdentities, ...identities];
  writeOverlayState(state);
  return person;
}

export async function removeLocalTrackedPerson(personId: string) {
  const state = readOverlayState();
  const seedIds = new Set(seed.trackedPeople.map((person) => person.id));

  if (seedIds.has(personId)) {
    state.hiddenTrackedPersonIds = [...new Set([...state.hiddenTrackedPersonIds, personId])];
  } else {
    state.trackedPeople = state.trackedPeople.filter((person) => person.id !== personId);
  }

  state.personIdentities = state.personIdentities.filter((identity) => identity.personId !== personId);
  writeOverlayState(state);
}

export async function fetchVcSources() {
  const state = readOverlayState();
  const backend = await fetchBackendSnapshot();
  return mergedVcsFromBase(state, backend?.vcSources ?? seed.vcSources);
}

export async function fetchTrackedPeople() {
  const state = readOverlayState();
  const backend = await fetchBackendSnapshot();
  return mergedTrackedPeopleFromBase(state, backend?.trackedPeople ?? seed.trackedPeople);
}

export async function fetchPersonIdentities() {
  const state = readOverlayState();
  const backend = await fetchBackendSnapshot();
  return mergedPersonIdentitiesFromBase(state, backend?.personIdentities ?? seed.personIdentities);
}

export async function fetchActivityEvents() {
  const backend = await fetchBackendSnapshot();
  return [...(backend?.activityEvents ?? seed.activityEvents)];
}

export async function fetchWeeklyPicks() {
  const backend = await fetchBackendSnapshot();
  return [...(backend?.weeklyPicks ?? seed.weeklyPicks)];
}

export async function fetchSeedFollowAlerts() {
  const backend = await fetchBackendSnapshot();
  return [...(backend?.seedFollowAlerts ?? seed.seedFollowAlerts ?? [])].filter(isActiveSeedFollowAlert);
}

export async function fetchAppSettings(): Promise<AnytraceAppSettings> {
  const backend = await fetchBackendSnapshot();
  return {
    seedFollowAlertThreshold: backend?.appSettings?.seedFollowAlertThreshold ?? seed.appSettings?.seedFollowAlertThreshold ?? 2,
  };
}

export async function fetchGithubSignalProfiles() {
  const backend = await fetchBackendSnapshot();
  return [...(backend?.githubSignalProfiles ?? seed.githubSignalProfiles)];
}

export async function fetchGraphData(): Promise<GraphData> {
  const state = readOverlayState();
  const backend = await fetchBackendSnapshot();
  const base = backend ?? seed;
  const vcs = mergedVcsFromBase(state, base.vcSources);
  const people = mergedTrackedPeopleFromBase(state, base.trackedPeople);

  return {
    vcs,
    people,
    events: [...base.activityEvents],
    weeklyPicks: [...base.weeklyPicks],
    edges: [...base.graphEdges],
    graphSource: base.graphSource ?? (base.graphEdges.length > 0 ? "snapshot" : "empty"),
    filteredConnectionCount: 0,
  };
}

async function fetchBackendSnapshot() {
  if (backendSnapshotCache) {
    backendSnapshotState = "ready";
    return backendSnapshotCache;
  }

  if (!backendSnapshotPromise) {
    backendSnapshotPromise = (async () => {
      try {
        const response = await fetch(`${backendBaseUrl()}/frontend-data`);
        if (!response.ok) {
          backendSnapshotState = "unavailable";
          backendSnapshotLastError = `Backend responded with ${response.status}.`;
          console.warn("[anytrace] frontend-data request failed", {
            status: response.status,
            statusText: response.statusText,
          });
          return null;
        }

        const payload = (await response.json()) as (LocalSeedPayload & { ok?: boolean; graphSource?: GraphData["graphSource"] });
        if (payload.ok === false) {
          backendSnapshotState = "unavailable";
          backendSnapshotLastError = "Backend returned ok=false.";
          console.warn("[anytrace] frontend-data payload returned ok=false");
          return null;
        }

        backendSnapshotCache = {
          version: seed.version,
          vcSources: payload.vcSources ?? [],
          trackedPeople: payload.trackedPeople ?? [],
          personIdentities: payload.personIdentities ?? [],
          activityEvents: payload.activityEvents ?? [],
          weeklyPicks: payload.weeklyPicks ?? [],
          seedFollowAlerts: payload.seedFollowAlerts ?? [],
          githubSignalProfiles: payload.githubSignalProfiles ?? [],
          graphEdges: payload.graphEdges ?? [],
          graphSource: payload.graphSource ?? ((payload.graphEdges?.length ?? 0) > 0 ? "snapshot" : "empty"),
          appSettings: {
            seedFollowAlertThreshold: payload.appSettings?.seedFollowAlertThreshold ?? 2,
          },
        };
        backendSnapshotState = "ready";
        backendSnapshotLastError = null;
        return backendSnapshotCache;
      } catch (error) {
        backendSnapshotState = "unavailable";
        backendSnapshotLastError = error instanceof Error ? error.message : "Unknown backend fetch error.";
        console.warn("[anytrace] frontend-data request threw", error);
        return null;
      } finally {
        backendSnapshotPromise = null;
      }
    })();
  }

  return backendSnapshotPromise;
}
