import { useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityEvent,
  TraqrAppSettings,
  GithubSignalProfile,
  GraphData,
  LinkedInEnrichmentRun,
  PersonIdentity,
  SeedScanRun,
  SeedScanSummary,
  SeedScanStatus,
  SeedFollowAlert,
  SeedFollowPromotionDraft,
  TriageRun,
  TrackedPerson,
  UserVcWatchlistItem,
  VcSource,
  VcSourceDraft,
  ViewerAccessState,
  WatchlistData,
  WatchlistPerson,
  WeeklyPick,
} from "@/data/traqr";
import {
  addLocalTrackedPerson,
  addLocalVc,
  clearSignalCaches,
  fetchActivityEvents,
  fetchAppSettings,
  fetchGithubSignalProfiles,
  fetchGraphData,
  fetchPersonIdentities,
  fetchSeedFollowAlerts,
  fetchTrackedPeople,
  fetchVcSources,
  fetchWeeklyPicks,
  removeLocalTrackedPerson,
  removeLocalVc,
  resetLocalWorkspace,
  shouldRetryBackendSnapshot,
} from "@/lib/localData";
import { demoPayload, getDemoLinkedInRun, getDemoTriageRun } from "@/lib/demoData";
import { isTraqrDemoMode } from "@/lib/demoMode";
import {
  getAuthState,
  sendMagicLink,
  signInAsLocalTestUser,
  signOutLocal,
  subscribeAuth,
  type AuthSession,
} from "@/lib/localSession";

type LocalSession = AuthSession["user"];

const EMPTY_WATCHLIST: WatchlistData = {
  selectedVcs: [],
  people: [],
};

function useStaticMutation<TInput = void, TOutput = void>(handler: (input: TInput) => Promise<TOutput>) {
  return useMutation({
    mutationFn: handler,
  });
}

function traqrQueryOptions() {
  if (isTraqrDemoMode()) {
    return {
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: false as const,
      refetchOnWindowFocus: false,
      refetchInterval: false as const,
    };
  }

  return {
    staleTime: 30_000,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchInterval: () => (shouldRetryBackendSnapshot() ? 5_000 : false),
  };
}

export function getBackendBaseUrl() {
  const configured = import.meta.env.VITE_TRAQR_BACKEND_URL?.trim();
  if (!configured) return "http://127.0.0.1:8767";
  if (configured === "http://127.0.0.1:8766" || configured === "http://localhost:8766") {
    return "http://127.0.0.1:8767";
  }
  return configured;
}

function mapVcsToWatchlistItems(vcs: VcSource[]): UserVcWatchlistItem[] {
  return vcs.map((vc) => ({
    id: `watchlist-${vc.id}`,
    userId: getAuthState().session?.user.id || "local-traqr-user",
    vcSourceId: vc.id,
    createdAt: vc.lastXSyncAt || new Date(0).toISOString(),
    vcSource: vc,
  }));
}

export function useSession() {
  const authState = useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
  return {
    session: authState.session,
    loading: authState.loading,
  };
}

export function useDemoMode() {
  return isTraqrDemoMode();
}

export function useAccessState() {
  const access: ViewerAccessState = {
    isAuthenticated: true,
    canAccessProduct: true,
    requiresPayment: false,
    status: "active",
    trialEndsAt: null,
    daysLeftInTrial: null,
  };

  return {
    session: null,
    loading: false,
    access,
    subscription: null,
    demoMode: isTraqrDemoMode(),
  };
}

export function useMagicLinkSignIn() {
  return useStaticMutation(async (input: { email: string }) => {
    if (!input.email.trim()) {
      throw new Error("Please enter an email address.");
    }
    await sendMagicLink(input.email.trim());
  });
}

export function useEnableDemoMode() {
  return useStaticMutation(async () => undefined);
}

export function useLoginAsAle() {
  return useStaticMutation(async () => {
    signInAsLocalTestUser("ale.bonanno2006@gmail.com");
  });
}

export function useSignOut() {
  return useStaticMutation(async () => {
    await signOutLocal();
  });
}

export function useManualSync() {
  return useStaticMutation(async () => {
    throw new Error("External sync is currently disabled. The app is running in local-only mode.");
  });
}

export function useRunTwitterScrape() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    if (isTraqrDemoMode()) {
      await queryClient.invalidateQueries({ queryKey: ["traqr", "seed-scan"] });
      return {
        ok: true,
        status: "completed" as const,
        message: "Demo mode uses a preloaded static seed-follow snapshot.",
        scanStatus: {
          status: "completed" as const,
          startedAt: demoPayload.appSettings.seedScan?.latestRunAt ?? null,
          completedAt: demoPayload.appSettings.seedScan?.latestRunAt ?? null,
          limit: null,
          count: demoPayload.seedFollowAlerts.length,
          total: demoPayload.seedFollowAlerts.length,
          remaining: 0,
          currentAccount: null,
          currentHandle: null,
          lastCompletedAccount: null,
          failed: 0,
          skipped: 0,
          error: null,
        },
        scanSummary: demoPayload.appSettings.seedScan ?? {
          snapshotCount: demoPayload.graphEdges.length,
          observationCount: demoPayload.graphEdges.length,
          alertCount: demoPayload.seedFollowAlerts.length,
        },
      } satisfies SeedScanRun;
    }

    const response = await fetch(`${getBackendBaseUrl()}/run-twitter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: "all" }),
    });
    const payload = (await response.json().catch(() => ({}))) as SeedScanRun & { error?: string };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Seed-follow scan could not be started. Start the local API with `python -m backend.main serve-api`.");
    }

    await queryClient.invalidateQueries({ queryKey: ["traqr", "seed-scan"] });
    return payload;
  });
}

export function useTwitterScrapeEndpoint() {
  if (isTraqrDemoMode()) return "Demo mode";
  return `${getBackendBaseUrl()}/run-twitter`;
}

export function useSeedScanStatus(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "seed-scan", "latest"],
    queryFn: async () => {
      if (isTraqrDemoMode()) {
        return {
          ok: true,
          scanStatus: {
            status: "completed" as const,
            startedAt: demoPayload.appSettings.seedScan?.latestRunAt ?? null,
            completedAt: demoPayload.appSettings.seedScan?.latestRunAt ?? null,
            limit: null,
            count: demoPayload.seedFollowAlerts.length,
            total: demoPayload.seedFollowAlerts.length,
            remaining: 0,
            currentAccount: null,
            currentHandle: null,
            lastCompletedAccount: null,
            failed: 0,
            skipped: 0,
            error: null,
          },
          scanSummary: demoPayload.appSettings.seedScan ?? {
            snapshotCount: demoPayload.graphEdges.length,
            observationCount: demoPayload.graphEdges.length,
            alertCount: demoPayload.seedFollowAlerts.length,
          },
        };
      }

      const response = await fetch(`${getBackendBaseUrl()}/seed-scan/latest`);
      return readJsonPayload<{
        ok?: boolean;
        scanStatus: SeedScanStatus;
        scanSummary: SeedScanSummary;
      }>(response, "Latest seed scan could not be loaded.");
    },
    enabled: _enabled,
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.data?.scanStatus?.status === "running" || query.state.data?.scanStatus?.status === "queued" ? 5_000 : false),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

async function readJsonPayload<T>(response: Response, fallbackError: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || fallbackError);
  }
  return payload as T;
}

export function useLatestTriageRun(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "triage", "latest"],
    queryFn: async () => {
      if (isTraqrDemoMode()) {
        return getDemoTriageRun();
      }

      const response = await fetch(`${getBackendBaseUrl()}/triage/latest`);
      return readJsonPayload<TriageRun>(response, "Latest traqr.ai triage run could not be loaded.");
    },
    enabled: _enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useRunTriage() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    if (isTraqrDemoMode()) {
      const payload = getDemoTriageRun();
      void queryClient.invalidateQueries({ queryKey: ["traqr", "triage"] });
      return payload;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${getBackendBaseUrl()}/triage/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeoutId));
    const payload = await readJsonPayload<TriageRun>(response, "traqr.ai triage could not be completed.");
    void queryClient.invalidateQueries({ queryKey: ["traqr", "triage"] });
    void queryClient.invalidateQueries({ queryKey: ["traqr"] });
    return payload;
  });
}

export function useRunLinkedInEnrichment() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input?: { limit?: number; missingOnly?: boolean }) => {
    if (isTraqrDemoMode()) {
      const payload = getDemoLinkedInRun();
      await queryClient.invalidateQueries({ queryKey: ["traqr"] });
      return payload;
    }

    const response = await fetch(`${getBackendBaseUrl()}/run-linkedin-enrichment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: input?.limit,
        missingOnly: input?.missingOnly ?? true,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as LinkedInEnrichmentRun & { error?: string };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || payload.message || "Native LinkedIn enrichment could not be started. Check LI_USERNAME and LI_PASSWORD.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
    return payload;
  });
}

export function useLinkedInEnrichmentEndpoint() {
  if (isTraqrDemoMode()) return "Demo mode";
  return `${getBackendBaseUrl()}/run-linkedin-enrichment`;
}

export function useRunGithubScan() {
  return useStaticMutation(async () => {
    throw new Error("GitHub scanning is disabled in local-only mode.");
  });
}

export function useGithubScanEndpoint() {
  return "Local-only mode";
}

export function useRunIdentityMatch() {
  return useStaticMutation(async () => {
    throw new Error("Identity matching is disabled in local-only mode.");
  });
}

export function useRunFullPipeline() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    if (isTraqrDemoMode()) {
      const payload = getDemoTriageRun();
      await queryClient.invalidateQueries({ queryKey: ["traqr"] });
      return {
        ok: true,
        status: "completed",
        triage: payload,
      };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 180_000);
    const response = await fetch(`${getBackendBaseUrl()}/run-pipeline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeoutId));
    const payload = await readJsonPayload<{
      ok?: boolean;
      status: string;
      triage?: TriageRun;
    }>(response, "Full founder pipeline could not be completed.");
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
    return payload;
  });
}

export function useResetActivities() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    resetLocalWorkspace();
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    return {
      ok: true,
      message: "Local workspace reset. Seed data was reloaded and custom local entries were deleted.",
    };
  });
}

export function useRefreshTraqrData() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
  });
}

export function useAppSettings(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "app-settings"],
    queryFn: async () => {
      if (isTraqrDemoMode()) {
        return fetchAppSettings();
      }

      try {
        const response = await fetch(`${getBackendBaseUrl()}/settings`);
        const payload = await readJsonPayload<{ ok?: boolean; appSettings: TraqrAppSettings }>(
          response,
          "App settings could not be loaded.",
        );
        return payload.appSettings;
      } catch {
        return fetchAppSettings();
      }
    },
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: Partial<TraqrAppSettings>) => {
    const threshold = input.seedFollowAlertThreshold;
    if (!Number.isFinite(threshold)) {
      throw new Error("Please enter a valid threshold.");
    }

    if (isTraqrDemoMode()) {
      return {
        ok: true,
        appSettings: {
          ...demoPayload.appSettings,
          seedFollowAlertThreshold: threshold,
        },
        backfillStats: { alertsCreated: 0 },
      };
    }

    const response = await fetch(`${getBackendBaseUrl()}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seedFollowAlertThreshold: threshold,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      appSettings?: TraqrAppSettings;
      backfillStats?: { alertsCreated?: number };
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Settings could not be saved. Is the local backend running?");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
    return payload;
  });
}

export function useVcSources(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "vcs"],
    queryFn: fetchVcSources,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function useSelectedVcWatchlist(_enabled = true) {
  const vcsQuery = useVcSources(_enabled);

  return useMemo(
    () => ({
      data: mapVcsToWatchlistItems(vcsQuery.data ?? []),
      isLoading: vcsQuery.isLoading,
      isError: vcsQuery.isError,
      error: vcsQuery.error,
    }),
    [vcsQuery],
  );
}

export function useAddVcToWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (draft: VcSourceDraft) => {
    if (isTraqrDemoMode()) {
      const vc = await addLocalVc({
        name: draft.name,
        linkedinUrl: draft.linkedinUrl,
        xHandle: draft.xHandle || draft.twitterUrl,
        tier: draft.tier,
        accountType: draft.accountType,
      });
      await queryClient.invalidateQueries({ queryKey: ["traqr"] });
      return { ok: true, vc };
    }

    let vc: unknown = null;
    let backendUnavailable = false;

    try {
      const response = await fetch(`${getBackendBaseUrl()}/watchlist/add-vc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draft.name,
          xHandle: draft.xHandle || draft.twitterUrl,
          linkedinUrl: draft.linkedinUrl,
          tier: draft.tier,
          accountType: draft.accountType,
          clusterName: draft.firm || draft.name,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        vc?: unknown;
      };

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "Seed source could not be added. Is the local backend running?");
      }
      vc = payload.vc;
    } catch (error) {
      if (error instanceof TypeError) {
        backendUnavailable = true;
      } else {
        throw error;
      }
    }

    if (backendUnavailable) {
      vc = await addLocalVc({
        name: draft.name,
        linkedinUrl: draft.linkedinUrl,
        xHandle: draft.xHandle || draft.twitterUrl,
        tier: draft.tier,
        accountType: draft.accountType,
      });
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
    return { ok: true, vc };
  });
}

export function useRemoveVcFromWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (target: { watchlistItemId?: string; vcSourceId: string }) => {
    await removeLocalVc(target.vcSourceId);
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
  });
}

export function useTrackedPeople(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "tracked-people"],
    queryFn: fetchTrackedPeople,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function usePersonIdentities(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "person-identities"],
    queryFn: fetchPersonIdentities,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function useActivityEvents(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "activity-events"],
    queryFn: fetchActivityEvents,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function useVcXFollowObservations(_enabled = true) {
  return {
    data: [] as {
      id: string;
      vcSourceId: string;
      personId: string | null;
      followedHandle: string;
      followedName: string;
      followedXUserId: string;
      firstSeenAt: string;
      lastSeenAt: string;
    }[],
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function useWeeklyPicks(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "weekly-picks"],
    queryFn: fetchWeeklyPicks,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function useSeedFollowAlerts(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "seed-follow-alerts"],
    queryFn: async () => {
      if (isTraqrDemoMode()) {
        return fetchSeedFollowAlerts();
      }

      try {
        const response = await fetch(`${getBackendBaseUrl()}/seed-follow-alerts`);
        const payload = await readJsonPayload<{ ok?: boolean; alerts: SeedFollowAlert[] }>(
          response,
          "Seed-follow alerts could not be loaded.",
        );
        return payload.alerts;
      } catch {
        return fetchSeedFollowAlerts();
      }
    },
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function usePromoteSeedFollowAlert() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: SeedFollowPromotionDraft) => {
    if (isTraqrDemoMode()) {
      await queryClient.invalidateQueries({ queryKey: ["traqr"] });
      return { ok: true, alertId: input.alertId };
    }

    const response = await fetch(`${getBackendBaseUrl()}/seed-follow-alerts/promote-to-seed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Seed account could not be added. Is the local backend running?");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
    return payload;
  });
}

export function useUpdateSeedFollowAlertStatus() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: { alertId: string; status: "new" | "seen" | "liked" | "archived" }) => {
    if (isTraqrDemoMode()) {
      await queryClient.invalidateQueries({ queryKey: ["traqr"] });
      return { ok: true, ...input };
    }

    const response = await fetch(`${getBackendBaseUrl()}/seed-follow-alerts/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Alert status could not be updated. Is the local backend running?");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    await queryClient.refetchQueries({ queryKey: ["traqr"], type: "active" });
    return payload;
  });
}

export function useGithubSignalProfiles(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "github-signal-profiles"],
    queryFn: fetchGithubSignalProfiles,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}

export function useWatchlist(_enabled = true) {
  const vcsQuery = useVcSources(_enabled);
  const trackedPeopleQuery = useTrackedPeople(_enabled);
  const identitiesQuery = usePersonIdentities(_enabled);
  const githubProfilesQuery = useGithubSignalProfiles(_enabled);
  const weeklyPicksQuery = useWeeklyPicks(_enabled);

  return useMemo(() => {
    const trackedPeople = trackedPeopleQuery.data ?? [];
    const identities = identitiesQuery.data ?? [];
    const githubProfiles = githubProfilesQuery.data ?? [];
    const weeklyPicks = weeklyPicksQuery.data ?? [];
    const identitiesByPerson = new Map<string, PersonIdentity[]>();
    const weeklyPickByPerson = new Map(weeklyPicks.map((pick) => [pick.person.id, pick]));
    const githubProfileByPerson = new Map(githubProfiles.map((profile) => [profile.personId, profile]));

    for (const identity of identities) {
      const list = identitiesByPerson.get(identity.personId) ?? [];
      list.push(identity);
      identitiesByPerson.set(identity.personId, list);
    }

    const selectedPeople = trackedPeople
      .filter((person) => person.isWatchlist)
      .map((person) => {
        const personIdentities = identitiesByPerson.get(person.id) ?? [];
        const weeklyPick = weeklyPickByPerson.get(person.id) ?? null;
        const githubProfile = githubProfileByPerson.get(person.id) ?? null;

        return {
          ...person,
          identities: personIdentities,
          signalsThisWeek: weeklyPick?.score ?? 0,
          vcFollowersThisWeek: weeklyPick?.vcFollowCount ?? 0,
          githubMomentum: githubProfile?.starDelta7d ?? 0,
          bigTechExit: weeklyPick?.bigTechExit ?? false,
          importantGithubFollowers: githubProfile?.recentGithubEvents ?? 0,
          githubProfile,
        } satisfies WatchlistPerson;
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    return {
      data: {
        ...EMPTY_WATCHLIST,
        selectedVcs: mapVcsToWatchlistItems(vcsQuery.data ?? []),
        people: selectedPeople,
      } as WatchlistData,
      isLoading:
        vcsQuery.isLoading ||
        trackedPeopleQuery.isLoading ||
        identitiesQuery.isLoading ||
        githubProfilesQuery.isLoading ||
        weeklyPicksQuery.isLoading,
      isError:
        vcsQuery.isError ||
        trackedPeopleQuery.isError ||
        identitiesQuery.isError ||
        githubProfilesQuery.isError ||
        weeklyPicksQuery.isError,
      error:
        vcsQuery.error ||
        trackedPeopleQuery.error ||
        identitiesQuery.error ||
        githubProfilesQuery.error ||
        weeklyPicksQuery.error,
    };
  }, [vcsQuery, trackedPeopleQuery, identitiesQuery, githubProfilesQuery, weeklyPicksQuery]);
}

export function useAddGithubPersonToWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: {
    existing?: {
      person: TrackedPerson;
      identities: PersonIdentity[];
    };
    draft?: {
      fullName: string;
      githubHandle: string;
      xHandle?: string;
      linkedinHandle?: string;
      roleTitle?: string;
      company?: string;
      location?: string;
      summary?: string;
    };
  }) => {
    const draft = input.draft;
    const existing = input.existing;

    if (!draft && !existing) {
      throw new Error("Tracked person payload missing.");
    }

    const trackedPerson = await addLocalTrackedPerson({
      fullName: draft?.fullName || existing?.person.fullName || "",
      githubHandle: draft?.githubHandle || existing?.identities.find((identity) => identity.platform === "github")?.handle,
      xHandle: draft?.xHandle || existing?.identities.find((identity) => identity.platform === "x")?.handle,
      linkedinUrl: draft?.linkedinHandle || existing?.identities.find((identity) => identity.platform === "linkedin")?.profileUrl,
      roleTitle: draft?.roleTitle || existing?.person.roleTitle,
      company: draft?.company || existing?.person.company,
      location: draft?.location || existing?.person.location,
      summary: draft?.summary || existing?.person.summary,
    });

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
    return { ok: true, trackedPerson };
  });
}

export function useRemoveGithubPersonFromWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (personId: string) => {
    await removeLocalTrackedPerson(personId);
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["traqr"] });
  });
}

export function useGraphData(_enabled = true) {
  return useQuery({
    queryKey: ["traqr", "graph"],
    queryFn: fetchGraphData,
    enabled: _enabled,
    ...traqrQueryOptions(),
  });
}
