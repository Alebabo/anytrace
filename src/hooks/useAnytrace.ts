import { useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityEvent,
  GithubSignalProfile,
  GraphData,
  PersonIdentity,
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
  clearSignalCaches,
  fetchActivityEvents,
  fetchGithubSignalProfiles,
  fetchGraphData,
  fetchPersonIdentities,
  fetchTrackedGitPeople,
  fetchVcSources,
  fetchWeeklyPicks,
  hasFrontendSupabaseConfig,
} from "@/lib/supabaseRest";
import {
  getAuthState,
  sendMagicLink,
  signInAsLocalTestUser,
  signOutSupabase,
  subscribeAuth,
  type AuthSession,
} from "@/lib/supabaseAuth";

type LocalSession = AuthSession["user"];

const EMPTY_WATCHLIST: WatchlistData = {
  selectedVcs: [],
  people: [],
};

const EMPTY_GRAPH: GraphData = {
  vcs: [],
  people: [],
  events: [],
  weeklyPicks: [],
  edges: [],
  graphSource: "empty",
  filteredConnectionCount: 0,
};

function useStaticMutation<TInput = void, TOutput = void>(handler: (input: TInput) => Promise<TOutput>) {
  return useMutation({
    mutationFn: handler,
  });
}

function getTwitterScrapeEndpoint() {
  const explicitUrl = import.meta.env.VITE_TWITTER_SCRAPE_URL?.trim();
  const baseUrl = getBackendBaseUrl();
  return explicitUrl || `${baseUrl}/run-twitter`;
}

function getGithubScanEndpoint() {
  const explicitUrl = import.meta.env.VITE_GITHUB_SCAN_URL?.trim();
  const baseUrl = getBackendBaseUrl();
  return explicitUrl || `${baseUrl}/run-github`;
}

function getActivitiesResetEndpoint() {
  return `${getBackendBaseUrl()}/reset-activities`;
}

function getIdentityMatchEndpoint() {
  return `${getBackendBaseUrl()}/run-identity-match`;
}

function getPipelineEndpoint() {
  return `${getBackendBaseUrl()}/run-pipeline`;
}

function getBackendBaseUrl() {
  return import.meta.env.VITE_ANYTRACE_BACKEND_URL?.trim() || "http://127.0.0.1:8766";
}

function getMissingFrontendConfigError(enabled: boolean) {
  return enabled && !hasFrontendSupabaseConfig()
    ? new Error("Frontend Supabase config missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
    : null;
}

function withFrontendConfigState<TData>(
  query: {
    data: TData | undefined;
    isError: boolean;
    error: unknown;
  },
  enabled: boolean,
  fallbackData: TData,
) {
  const configError = getMissingFrontendConfigError(enabled);

  return {
    ...query,
    data: (query.data ?? fallbackData) as TData,
    isError: query.isError || !!configError,
    error: query.error ?? configError,
  };
}

function mapVcsToWatchlistItems(vcs: VcSource[]): UserVcWatchlistItem[] {
  return vcs.map((vc) => ({
    id: `watchlist-${vc.id}`,
    userId: getAuthState().session?.user.id || "anonymous",
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
  return useStaticMutation(async () => {
    throw new Error("Demo mode and seeded data were removed.");
  });
}

export function useLoginAsAle() {
  return useStaticMutation(async () => {
    signInAsLocalTestUser("ale.bonanno2006@gmail.com");
  });
}

export function useSignOut() {
  return useStaticMutation(async () => {
    await signOutSupabase();
  });
}

export function useManualSync() {
  return useStaticMutation(async () => {
    throw new Error("Manual sync was removed with the backend.");
  });
}

export function useRunTwitterScrape() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    const endpoint = getTwitterScrapeEndpoint();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      count?: number;
      results?: Array<{
        vc_name: string;
        baseline_run: boolean;
        new_snapshot_count: number;
        matched_candidate_count: number;
        stopped_early: boolean;
        output_file: string;
      }>;
    };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Twitter scrape could not be started. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useTwitterScrapeEndpoint() {
  return getTwitterScrapeEndpoint();
}

export function useRunGithubScan() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    const endpoint = getGithubScanEndpoint();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      count?: number;
      scanned_people?: number;
      scanned_repos?: number;
      viral_repo_count?: number;
      results?: Array<{
        person_name?: string;
        repo?: string;
        status?: string;
        stars?: number;
        star_delta_7d?: number;
      }>;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "GitHub scan could not be started. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useGithubScanEndpoint() {
  return getGithubScanEndpoint();
}

export function useRunIdentityMatch() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    const response = await fetch(getIdentityMatchEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      count?: number;
      results?: Array<{
        tracked_person_id?: string;
        candidate_id?: string;
        confidence?: number;
        status?: string;
      }>;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Identity match could not be started. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useRunFullPipeline() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    const response = await fetch(getPipelineEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      status?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Full pipeline could not be started. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    await queryClient.refetchQueries({ queryKey: ["anytrace"], type: "active" });
    return payload;
  });
}

export function useResetActivities() {
  const queryClient = useQueryClient();

  return useStaticMutation(async () => {
    const response = await fetch(getActivitiesResetEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Activities could not be reset. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    return payload;
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

export function useVcSources(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "vcs"],
    queryFn: fetchVcSources,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, [] as VcSource[]);
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
    const response = await fetch(`${getBackendBaseUrl()}/watchlist/add-vc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: draft.name,
        xHandle: draft.xHandle || draft.twitterUrl,
        linkedinUrl: draft.linkedinUrl,
        tier: draft.tier === "vc" ? 1 : draft.tier === "microvc" ? 2 : 3,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "VC could not be added. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    return payload;
  });
}

export function useRemoveVcFromWatchlist() {
  return useStaticMutation(async (_target: { watchlistItemId?: string; vcSourceId: string }) => undefined);
}

export function useTrackedPeople(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "tracked-people"],
    queryFn: fetchTrackedGitPeople,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, [] as TrackedPerson[]);
}

export function usePersonIdentities(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "person-identities"],
    queryFn: fetchPersonIdentities,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, [] as PersonIdentity[]);
}

export function useActivityEvents(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "activity-events"],
    queryFn: fetchActivityEvents,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, [] as ActivityEvent[]);
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
  const query = useQuery({
    queryKey: ["anytrace", "weekly-picks"],
    queryFn: fetchWeeklyPicks,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, [] as WeeklyPick[]);
}

export function useGithubSignalProfiles(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "github-signal-profiles"],
    queryFn: fetchGithubSignalProfiles,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, [] as GithubSignalProfile[]);
}

export function useWatchlist(_enabled = true) {
  const vcsQuery = useVcSources(_enabled);
  const trackedPeopleQuery = useTrackedPeople(_enabled);
  const identitiesQuery = usePersonIdentities(_enabled);
  const githubProfilesQuery = useGithubSignalProfiles(_enabled);
  const weeklyPicksQuery = useWeeklyPicks(_enabled);

  return useMemo(
    () => {
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
        .sort((left, right) => {
          const watchlistDiff = Number(right.isWatchlist) - Number(left.isWatchlist);
          if (watchlistDiff !== 0) return watchlistDiff;
          const signalDiff = right.githubMomentum - left.githubMomentum;
          if (signalDiff !== 0) return signalDiff;
          return left.fullName.localeCompare(right.fullName);
        });

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
    },
    [vcsQuery, trackedPeopleQuery, identitiesQuery, githubProfilesQuery, weeklyPicksQuery],
  );
}

export function useAddGithubPersonToWatchlist() {
  const queryClient = useQueryClient();

  return useStaticMutation(async (_input: {
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
    const draft = _input.draft;
    const existing = _input.existing;
    const payload = draft
      ? {
          fullName: draft.fullName,
          githubHandle: draft.githubHandle,
          xHandle: draft.xHandle,
          linkedinUrl: draft.linkedinHandle,
          roleTitle: draft.roleTitle,
          company: draft.company,
          location: draft.location,
          summary: draft.summary,
        }
      : existing
        ? {
            fullName: existing.person.fullName,
            githubHandle: existing.identities.find((identity) => identity.platform === "github")?.handle,
            xHandle: existing.identities.find((identity) => identity.platform === "x")?.handle,
            linkedinUrl: existing.identities.find((identity) => identity.platform === "linkedin")?.profileUrl,
            roleTitle: existing.person.roleTitle,
            company: existing.person.company,
            location: existing.person.location,
            summary: existing.person.summary,
          }
        : null;

    if (!payload) {
      throw new Error("Tracked person payload missing.");
    }

    const response = await fetch(`${getBackendBaseUrl()}/watchlist/add-tracked-person`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "Tracked person could not be added. Start the local API with `python -m backend.main serve-api`.");
    }

    clearSignalCaches();
    await queryClient.invalidateQueries({ queryKey: ["anytrace"] });
    return result;
  });
}

export function useRemoveGithubPersonFromWatchlist() {
  return useStaticMutation(async (_personId: string) => undefined);
}

export function useGraphData(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "graph"],
    queryFn: fetchGraphData,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return withFrontendConfigState(query, _enabled, EMPTY_GRAPH);
}
