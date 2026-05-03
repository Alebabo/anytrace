import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
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

type LocalSession = {
  user: {
    id: string;
    email: string;
  };
};

const FRONTEND_ONLY_SESSION: LocalSession = {
  user: {
    id: "frontend-only-user",
    email: "frontend-only@anytrace.local",
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

export function useVcSources(_enabled = true) {
  return {
    data: [] as VcSource[],
    isLoading: false,
    isError: false,
    error: null,
  };
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
  return useMemo(
    () => ({
      data: EMPTY_GRAPH as GraphData,
      isLoading: false,
      isError: false,
      error: null,
    }),
    [],
  );
}
