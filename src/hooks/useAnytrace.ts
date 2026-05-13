import { useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityEvent,
  AnytraceAppSettings,
  GithubSignalProfile,
  GraphData,
  PersonIdentity,
  SeedFollowAlert,
  SeedFollowPromotionDraft,
  TrackedPerson,
  UserVcWatchlistItem,
  VcSource,
  VcSourceDraft,
  ViewerAccessState,
  WatchlistData,
  WatchlistPerson,
  WeeklyPick,
} from "@/data/anytrace";
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

function anytraceQueryOptions() {
  return {
    staleTime: 30_000,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchInterval: () => (shouldRetryBackendSnapshot() ? 5_000 : false),
  };
}

function getBackendBaseUrl() {
  return import.meta.env.VITE_ANYTRACE_BACKEND_URL?.trim() || "http://127.0.0.1:8766";
}

function mapVcsToWatchlistItems(vcs: VcSource[]): UserVcWatchlistItem[] {
  return vcs.map((vc) => ({
    id: `watchlist-${vc.id}`,
    userId: getAuthState().session?.user.id || "local-anytrace-user",
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
  return false;
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
    demoMode: false,
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
    const response = await fetch(`${getBackendBaseUrl()}/run-twitter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      count?: number;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Seed-follow scan could not be started. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useTwitterScrapeEndpoint() {
  return `${getBackendBaseUrl()}/run-twitter`;
}

export function useRunLinkedInMakeEnrichment() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input?: { limit?: number; missingOnly?: boolean }) => {
    const response = await fetch(`${getBackendBaseUrl()}/run-linkedin-make`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: input?.limit ?? 25,
        missingOnly: input?.missingOnly ?? true,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      sent?: number;
      status?: string;
      message?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "LinkedIn Make enrichment could not be started. Check MAKE_LINKEDIN_WEBHOOK_URL.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useLinkedInMakeEndpoint() {
  return `${getBackendBaseUrl()}/run-linkedin-make`;
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
  return useStaticMutation(async () => {
    throw new Error("The remote pipeline is disabled. This workspace is using local seed data only.");
  });
}

export function useResetActivities() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    resetLocalWorkspace();
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    return {
      ok: true,
      message: "Local workspace reset. Seed data was reloaded and custom local entries were deleted.",
    };
  });
}

export function useRefreshAnytraceData() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
  });
}

export function useAppSettings(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "app-settings"],
    queryFn: fetchAppSettings,
    enabled: _enabled,
    ...anytraceQueryOptions(),
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: Partial<AnytraceAppSettings>) => {
    const threshold = input.seedFollowAlertThreshold;
    if (!Number.isFinite(threshold)) {
      throw new Error("Please enter a valid threshold.");
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
      appSettings?: AnytraceAppSettings;
      backfillStats?: { alertsCreated?: number };
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Settings could not be saved. Is the local backend running?");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useVcSources(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "vcs"],
    queryFn: fetchVcSources,
    enabled: _enabled,
    ...anytraceQueryOptions(),
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
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return { ok: true, vc };
  });
}

export function useRemoveVcFromWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (target: { watchlistItemId?: string; vcSourceId: string }) => {
    await removeLocalVc(target.vcSourceId);
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
  });
}

export function useTrackedPeople(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "tracked-people"],
    queryFn: fetchTrackedPeople,
    enabled: _enabled,
    ...anytraceQueryOptions(),
  });
}

export function usePersonIdentities(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "person-identities"],
    queryFn: fetchPersonIdentities,
    enabled: _enabled,
    ...anytraceQueryOptions(),
  });
}

export function useActivityEvents(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "activity-events"],
    queryFn: fetchActivityEvents,
    enabled: _enabled,
    ...anytraceQueryOptions(),
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
    queryKey: ["anytrace", "weekly-picks"],
    queryFn: fetchWeeklyPicks,
    enabled: _enabled,
    ...anytraceQueryOptions(),
  });
}

export function useSeedFollowAlerts(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "seed-follow-alerts"],
    queryFn: fetchSeedFollowAlerts,
    enabled: _enabled,
    ...anytraceQueryOptions(),
  });
}

export function usePromoteSeedFollowAlert() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: SeedFollowPromotionDraft) => {
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
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useUpdateSeedFollowAlertStatus() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (input: { alertId: string; status: "new" | "seen" | "archived" }) => {
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
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useGithubSignalProfiles(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "github-signal-profiles"],
    queryFn: fetchGithubSignalProfiles,
    enabled: _enabled,
    ...anytraceQueryOptions(),
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
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    return { ok: true, trackedPerson };
  });
}

export function useRemoveGithubPersonFromWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (personId: string) => {
    await removeLocalTrackedPerson(personId);
    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
  });
}

export function useGraphData(_enabled = true) {
  return useQuery({
    queryKey: ["anytrace", "graph"],
    queryFn: fetchGraphData,
    enabled: _enabled,
    ...anytraceQueryOptions(),
  });
}
