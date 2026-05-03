import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ActivityEvent,
  GraphData,
  PersonIdentity,
  TrackedPerson,
  UserVcWatchlistItem,
  VcSource,
  VcSourceDraft,
  ViewerAccessState,
  WatchlistData,
  WeeklyPick,
} from "@/data/anytrace";
import { fetchGraphData, fetchVcSources, hasFrontendSupabaseConfig } from "@/lib/supabaseRest";

type LocalSession = {
  user: {
    id: string;
    email: string;
  };
};

const FRONTEND_ONLY_SESSION: LocalSession = {
  user: {
    id: "local-user",
    email: "local@anytrace.app",
  },
};

const FRONTEND_ONLY_ACCESS: ViewerAccessState = {
  isAuthenticated: true,
  canAccessProduct: true,
  requiresPayment: false,
  status: "active",
  trialEndsAt: null,
  daysLeftInTrial: null,
};

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

export function useSession() {
  return {
    session: FRONTEND_ONLY_SESSION,
    loading: false,
  };
}

export function useDemoMode() {
  return false;
}

export function useAccessState() {
  return {
    session: FRONTEND_ONLY_SESSION,
    loading: false,
    access: FRONTEND_ONLY_ACCESS,
    subscription: null,
    demoMode: false,
  };
}

export function useMagicLinkSignIn() {
  return useStaticMutation(async () => {
    throw new Error("Authentication was removed. This frontend is currently backend-free.");
  });
}

export function useEnableDemoMode() {
  return useStaticMutation(async () => {
    throw new Error("Demo mode and seeded data were removed.");
  });
}

export function useLoginAsAle() {
  return useStaticMutation(async () => {
    throw new Error("Supabase test login was removed.");
  });
}

export function useSignOut() {
  return useStaticMutation(async () => undefined);
}

export function useManualSync() {
  return useStaticMutation(async () => {
    throw new Error("Manual sync was removed with the backend.");
  });
}

export function useRunTwitterScrape() {
  return useStaticMutation(async () => {
    const response = await fetch("/api/run-twitter", {
      method: "POST",
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
      throw new Error(payload.error || "Twitter scrape could not be started.");
    }

    return payload;
  });
}

export function useVcSources(_enabled = true) {
  const query = useQuery({
    queryKey: ["anytrace", "vcs"],
    queryFn: fetchVcSources,
    enabled: _enabled,
    staleTime: 60_000,
  });

  return useMemo(
    () => ({
      ...query,
      data: (query.data ?? []) as VcSource[],
      isError: query.isError || (_enabled && !hasFrontendSupabaseConfig()),
      error:
        query.error ??
        (_enabled && !hasFrontendSupabaseConfig()
          ? new Error("Frontend Supabase config missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
          : null),
    }),
    [query, _enabled],
  );
}

export function useSelectedVcWatchlist(_enabled = true) {
  return {
    data: [] as UserVcWatchlistItem[],
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function useAddVcToWatchlist() {
  return useStaticMutation(async (_draft: VcSourceDraft) => {
    throw new Error("VC persistence was removed with the backend.");
  });
}

export function useRemoveVcFromWatchlist() {
  return useStaticMutation(async (_target: { watchlistItemId?: string; vcSourceId: string }) => undefined);
}

export function useTrackedPeople(_enabled = true) {
  return {
    data: [] as TrackedPerson[],
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function usePersonIdentities(_enabled = true) {
  return {
    data: [] as PersonIdentity[],
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function useActivityEvents(_enabled = true) {
  return {
    data: [] as ActivityEvent[],
    isLoading: false,
    isError: false,
    error: null,
  };
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
  return {
    data: [] as WeeklyPick[],
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function useWatchlist(_enabled = true) {
  return {
    data: EMPTY_WATCHLIST,
    isLoading: false,
    isError: false,
    error: null,
  };
}

export function useAddGithubPersonToWatchlist() {
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
    throw new Error("Watchlist persistence was removed with the backend.");
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

  return useMemo(
    () => ({
      ...query,
      data: (query.data ?? EMPTY_GRAPH) as GraphData,
      isError: query.isError || (_enabled && !hasFrontendSupabaseConfig()),
      error:
        query.error ??
        (_enabled && !hasFrontendSupabaseConfig()
          ? new Error("Frontend Supabase config missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
          : null),
    }),
    [query, _enabled],
  );
}
