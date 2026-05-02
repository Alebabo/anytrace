import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  demoActivityEvents,
  demoPersonIdentities,
  demoSelectedVcWatchlist,
  demoTrackedPeople,
  demoVcSources,
  demoWeeklyPicks,
} from "@/data/demoAnytrace";
import type {
  ActivityEvent,
  GraphEdge,
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
import { buildWeeklyPicks } from "@/lib/weeklyPicks";

type SubRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type WatchlistRow = Database["public"]["Tables"]["user_vc_watchlist_items"]["Row"];
type VcRow = Database["public"]["Tables"]["vc_sources"]["Row"];
type PersonRow = Database["public"]["Tables"]["tracked_people"]["Row"];
type IdentityRow = Database["public"]["Tables"]["person_identities"]["Row"];
type EventRow = Database["public"]["Tables"]["activity_events"]["Row"];

const DEMO_MODE_KEY = "anytrace-demo-mode";
const DEMO_MODE_EVENT = "anytrace-demo-mode-change";
const DEMO_VC_CATALOG_KEY = "anytrace-demo-vc-catalog";
const DEMO_VC_SELECTED_IDS_KEY = "anytrace-demo-selected-vc-ids";

function readDemoMode() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_MODE_KEY) === "true";
}

function emitDemoModeEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_MODE_EVENT));
}

function writeDemoMode(next: boolean) {
  if (typeof window === "undefined") return;
  if (next) {
    window.localStorage.setItem(DEMO_MODE_KEY, "true");
  } else {
    window.localStorage.removeItem(DEMO_MODE_KEY);
  }
  emitDemoModeEvent();
}

function slugifyVc(name: string, firm: string) {
  return `${name}-${firm}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  emitDemoModeEvent();
}

function readDemoVcCatalog() {
  return readJson(DEMO_VC_CATALOG_KEY, demoVcSources);
}

function writeDemoVcCatalog(vcs: VcSource[]) {
  writeJson(DEMO_VC_CATALOG_KEY, vcs);
}

function readDemoSelectedVcIds() {
  return readJson(
    DEMO_VC_SELECTED_IDS_KEY,
    demoSelectedVcWatchlist.map((item) => item.vcSourceId),
  );
}

function writeDemoSelectedVcIds(ids: string[]) {
  writeJson(DEMO_VC_SELECTED_IDS_KEY, ids);
}

function mapVc(row: VcRow): VcSource {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.title,
    firm: row.firm,
    tier: row.tier,
    region: row.region,
    country: row.country,
    city: row.city,
    xHandle: row.x_handle,
    xUserId: row.x_user_id,
    linkedinUrl: row.linkedin_url,
    githubUsername: row.github_username,
    websiteUrl: row.website_url,
    notes: row.notes,
    isSeeded: row.is_seeded,
    createdByUserId: row.created_by_user_id,
    syncStatus: row.sync_status,
    lastXSyncAt: row.last_x_sync_at,
    lastGithubSyncAt: row.last_github_sync_at,
    lastSyncError: row.last_sync_error,
  };
}

function mapPerson(row: PersonRow): TrackedPerson {
  return {
    id: row.id,
    slug: row.slug,
    fullName: row.full_name,
    roleTitle: row.role_title,
    company: row.company,
    location: row.location,
    summary: row.summary,
    avatarUrl: row.avatar_url,
    topPickNote: row.top_pick_note,
    isWatchlist: row.is_watchlist,
  };
}

function mapIdentity(row: IdentityRow): PersonIdentity {
  return {
    id: row.id,
    personId: row.person_id,
    platform: row.platform,
    handle: row.handle,
    profileUrl: row.profile_url,
    isPrimary: row.is_primary,
  };
}

function mapEvent(row: EventRow): ActivityEvent {
  return {
    id: row.id,
    personId: row.person_id,
    vcSourceId: row.vc_source_id,
    platform: row.platform,
    eventType: row.event_type,
    headline: row.headline,
    description: row.description,
    sourceUrl: row.source_url,
    occurredAt: row.occurred_at,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    eventFingerprint: row.event_fingerprint,
  };
}

function computeAccessState(subscription: SubRow | null, session: Session | null): ViewerAccessState {
  if (!session) {
    return {
      isAuthenticated: false,
      canAccessProduct: false,
      requiresPayment: false,
      status: "signed_out",
      trialEndsAt: null,
      daysLeftInTrial: null,
    };
  }

  if (!subscription) {
    return {
      isAuthenticated: true,
      canAccessProduct: true,
      requiresPayment: false,
      status: "trialing",
      trialEndsAt: null,
      daysLeftInTrial: null,
    };
  }

  const now = Date.now();
  const trialEnds = new Date(subscription.trial_ends_at).getTime();
  const daysLeft = Number.isFinite(trialEnds)
    ? Math.max(0, Math.ceil((trialEnds - now) / 86_400_000))
    : null;
  const isActive = subscription.status === "active";
  const trialValid = subscription.status === "trialing" && Number.isFinite(trialEnds) && trialEnds > now;

  return {
    isAuthenticated: true,
    canAccessProduct: isActive || trialValid,
    requiresPayment: !isActive && !trialValid,
    status: subscription.status,
    trialEndsAt: subscription.trial_ends_at,
    daysLeftInTrial: daysLeft,
  };
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export function useDemoMode() {
  const [demoMode, setDemoMode] = useState(readDemoMode);

  useEffect(() => {
    const sync = () => setDemoMode(readDemoMode());
    window.addEventListener("storage", sync);
    window.addEventListener(DEMO_MODE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(DEMO_MODE_EVENT, sync);
    };
  }, []);

  return demoMode;
}

export function useAccessState() {
  const demoMode = useDemoMode();
  const { session, loading } = useSession();

  const subscriptionQuery = useQuery({
    queryKey: ["subscription", session?.user.id ?? "signed-out"],
    enabled: !!session?.user.id && !demoMode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", session!.user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const access = useMemo(
    () => computeAccessState(subscriptionQuery.data ?? null, session),
    [subscriptionQuery.data, session],
  );

  if (demoMode) {
    return {
      session: {
        user: { id: "demo-user", email: "demo@anytrace.local" },
      } as Session,
      loading: false,
      access: {
        isAuthenticated: true,
        canAccessProduct: true,
        requiresPayment: false,
        status: "active",
        trialEndsAt: null,
        daysLeftInTrial: null,
      } satisfies ViewerAccessState,
      subscription: null,
      demoMode: true,
    };
  }

  return {
    session,
    loading: loading || subscriptionQuery.isLoading,
    access,
    subscription: subscriptionQuery.data ?? null,
    demoMode: false,
  };
}

export function useMagicLinkSignIn() {
  return useMutation({
    mutationFn: async (email: string) => {
      const redirectTo =
        (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ||
        window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    },
  });
}

export function useEnableDemoMode() {
  return useMutation({
    mutationFn: async () => {
      writeDemoMode(true);
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      writeDemoMode(false);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useVcSources(enabled = true) {
  const demoMode = useDemoMode();
  return useQuery({
    queryKey: ["vc-sources", demoMode ? "demo" : "live"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (demoMode) return readDemoVcCatalog();
      const { data, error } = await supabase.from("vc_sources").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(mapVc);
    },
  });
}

export function useSelectedVcWatchlist(enabled = true) {
  const demoMode = useDemoMode();
  const { session } = useAccessState();
  return useQuery({
    queryKey: ["selected-vc-watchlist", session?.user.id ?? "signed-out", demoMode ? "demo" : "live"],
    enabled: enabled && (!!session?.user.id || demoMode),
    staleTime: 30_000,
    queryFn: async () => {
      if (demoMode) {
        const catalog = readDemoVcCatalog();
        const selectedIds = new Set(readDemoSelectedVcIds());
        return catalog
          .filter((vc) => selectedIds.has(vc.id))
          .map<UserVcWatchlistItem>((vc, index) => ({
            id: `demo-watch-${vc.id}`,
            userId: "demo-user",
            vcSourceId: vc.id,
            createdAt: demoSelectedVcWatchlist[index]?.createdAt ?? new Date().toISOString(),
            vcSource: vc,
          }));
      }

      const [{ data: items, error: itemsError }, { data: vcs, error: vcsError }] = await Promise.all([
        supabase
          .from("user_vc_watchlist_items")
          .select("*")
          .eq("user_id", session!.user.id)
          .order("created_at"),
        supabase.from("vc_sources").select("*"),
      ]);

      if (itemsError) throw itemsError;
      if (vcsError) throw vcsError;

      const vcMap = new Map((vcs ?? []).map((row) => [row.id, mapVc(row)]));

      return (items ?? [])
        .map<UserVcWatchlistItem | null>((item: WatchlistRow) => {
          const vcSource = vcMap.get(item.vc_source_id);
          if (!vcSource) return null;
          return {
            id: item.id,
            userId: item.user_id,
            vcSourceId: item.vc_source_id,
            createdAt: item.created_at,
            vcSource,
          };
        })
        .filter((item): item is UserVcWatchlistItem => !!item);
    },
  });
}

export function useAddVcToWatchlist() {
  const qc = useQueryClient();
  const { session, demoMode } = useAccessState();

  return useMutation({
    mutationFn: async (draft: VcSourceDraft) => {
      const slug = slugifyVc(draft.name, draft.firm);

      if (demoMode) {
        const catalog = readDemoVcCatalog();
        const selectedIds = new Set(readDemoSelectedVcIds());
        const normalizedHandle = draft.xHandle.replace(/^@/, "").trim().toLowerCase();
        const existing =
          catalog.find((vc) => vc.xHandle?.toLowerCase() === normalizedHandle) ??
          catalog.find((vc) => vc.slug === slug);

        const vc: VcSource =
          existing ??
          {
            id: `demo-vc-${crypto.randomUUID()}`,
            slug: existing?.slug ?? slug,
            name: draft.name.trim(),
            title: draft.title?.trim() || "Partner",
            firm: draft.firm.trim(),
            tier: draft.tier ?? "vc",
            region: draft.region?.trim() || "Europe",
            country: draft.country?.trim() || "Unknown",
            city: draft.city?.trim() || "",
            xHandle: normalizedHandle,
            xUserId: null,
            linkedinUrl: draft.linkedinUrl?.trim() || null,
            githubUsername: draft.githubUsername?.trim() || null,
            websiteUrl: draft.websiteUrl?.trim() || null,
            notes: draft.notes?.trim() || "",
            isSeeded: false,
            createdByUserId: "demo-user",
            syncStatus: "idle",
            lastXSyncAt: null,
            lastGithubSyncAt: null,
            lastSyncError: null,
          };

        if (!existing) {
          writeDemoVcCatalog([...catalog, vc]);
        }
        selectedIds.add(vc.id);
        writeDemoSelectedVcIds(Array.from(selectedIds));
        return vc;
      }

      if (!session?.user.id) {
        throw new Error("You need to be signed in to manage VCs.");
      }

      const normalizedHandle = draft.xHandle.replace(/^@/, "").trim().toLowerCase();

      const { data: existingByHandle, error: existingError } = await supabase
        .from("vc_sources")
        .select("*")
        .eq("x_handle", normalizedHandle)
        .maybeSingle();

      if (existingError) throw existingError;

      let vcId = existingByHandle?.id;

      if (!vcId) {
        const { data: inserted, error: insertError } = await supabase
          .from("vc_sources")
          .insert({
            slug,
            name: draft.name.trim(),
            title: draft.title?.trim() || "Partner",
            firm: draft.firm.trim(),
            tier: draft.tier ?? "vc",
            region: draft.region?.trim() || "Europe",
            country: draft.country?.trim() || "Unknown",
            city: draft.city?.trim() || "",
            x_handle: normalizedHandle,
            linkedin_url: draft.linkedinUrl?.trim() || null,
            github_username: draft.githubUsername?.trim() || null,
            website_url: draft.websiteUrl?.trim() || null,
            notes: draft.notes?.trim() || "",
            is_seeded: false,
            created_by_user_id: session.user.id,
            sync_status: "idle",
          })
          .select("*")
          .single();

        if (insertError) throw insertError;
        vcId = inserted.id;
      }

      const { error: linkError } = await supabase
        .from("user_vc_watchlist_items")
        .upsert(
          {
            user_id: session.user.id,
            vc_source_id: vcId,
          },
          { onConflict: "user_id,vc_source_id", ignoreDuplicates: true },
        );

      if (linkError) throw linkError;
      return vcId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["selected-vc-watchlist"] });
      qc.invalidateQueries({ queryKey: ["vc-sources"] });
      qc.invalidateQueries({ queryKey: ["graph-data"] });
    },
  });
}

export function useRemoveVcFromWatchlist() {
  const qc = useQueryClient();
  const { session, demoMode } = useAccessState();

  return useMutation({
    mutationFn: async (target: { watchlistItemId?: string; vcSourceId: string }) => {
      if (demoMode) {
        const selectedIds = readDemoSelectedVcIds().filter((id) => id !== target.vcSourceId);
        writeDemoSelectedVcIds(selectedIds);
        return;
      }

      if (!session?.user.id) {
        throw new Error("You need to be signed in to manage VCs.");
      }

      const query = supabase
        .from("user_vc_watchlist_items")
        .delete()
        .eq("user_id", session.user.id)
        .eq("vc_source_id", target.vcSourceId);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["selected-vc-watchlist"] });
      qc.invalidateQueries({ queryKey: ["graph-data"] });
    },
  });
}

export function useTrackedPeople(enabled = true) {
  const demoMode = useDemoMode();
  return useQuery({
    queryKey: ["tracked-people", demoMode ? "demo" : "live"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (demoMode) return demoTrackedPeople;
      const { data, error } = await supabase
        .from("tracked_people")
        .select("*")
        .eq("is_watchlist", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map(mapPerson);
    },
  });
}

export function usePersonIdentities(enabled = true) {
  const demoMode = useDemoMode();
  return useQuery({
    queryKey: ["person-identities", demoMode ? "demo" : "live"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (demoMode) return demoPersonIdentities;
      const { data, error } = await supabase
        .from("person_identities")
        .select("*")
        .order("platform");
      if (error) throw error;
      return (data ?? []).map(mapIdentity);
    },
  });
}

export function useActivityEvents(enabled = true) {
  const demoMode = useDemoMode();
  return useQuery({
    queryKey: ["activity-events", demoMode ? "demo" : "live"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (demoMode) return demoActivityEvents;
      const { data, error } = await supabase
        .from("activity_events")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapEvent);
    },
  });
}

export function useWeeklyPicks(enabled = true) {
  const demoMode = useDemoMode();
  const peopleQuery = useTrackedPeople(enabled);
  const eventsQuery = useActivityEvents(enabled);

  return {
    data: useMemo(() => {
      if (demoMode) return demoWeeklyPicks;
      if (!peopleQuery.data || !eventsQuery.data) return [];
      return buildWeeklyPicks(peopleQuery.data, eventsQuery.data);
    }, [demoMode, eventsQuery.data, peopleQuery.data]),
    isLoading: peopleQuery.isLoading || eventsQuery.isLoading,
    isError: peopleQuery.isError || eventsQuery.isError,
    error: peopleQuery.error ?? eventsQuery.error,
  };
}

export function useWatchlist(enabled = true) {
  const peopleQuery = useTrackedPeople(enabled);
  const identitiesQuery = usePersonIdentities(enabled);
  const eventsQuery = useActivityEvents(enabled);
  const selectedVcsQuery = useSelectedVcWatchlist(enabled);

  return {
    data: useMemo<WatchlistData>(() => {
      if (!peopleQuery.data || !identitiesQuery.data || !eventsQuery.data) {
        return {
          selectedVcs: selectedVcsQuery.data ?? [],
          people: [],
        };
      }
      const identitiesByPerson = new Map<string, PersonIdentity[]>();
      for (const identity of identitiesQuery.data) {
        const list = identitiesByPerson.get(identity.personId) ?? [];
        list.push(identity);
        identitiesByPerson.set(identity.personId, list);
      }

      const people = peopleQuery.data.map<WatchlistPerson>((person) => {
        const personEvents = eventsQuery.data.filter((event) => event.personId === person.id);
        return {
          ...person,
          identities: identitiesByPerson.get(person.id) ?? [],
          signalsThisWeek: personEvents.length,
          vcFollowersThisWeek: personEvents.filter((event) => event.eventType === "vc_follow").length,
          githubMomentum: personEvents
            .filter((event) => event.eventType === "repo_traction")
            .reduce((sum, event) => sum + Number(event.metadata.weekly_star_delta ?? 0), 0),
          bigTechExit: personEvents.some((event) => event.eventType === "big_tech_exit"),
          importantGithubFollowers: personEvents
            .filter((event) => event.eventType === "important_github_follower")
            .reduce((sum, event) => sum + Number(event.metadata.follower_count ?? 1), 0),
        };
      });

      return {
        selectedVcs: selectedVcsQuery.data ?? [],
        people,
      };
    }, [eventsQuery.data, identitiesQuery.data, peopleQuery.data, selectedVcsQuery.data]),
    isLoading:
      peopleQuery.isLoading ||
      identitiesQuery.isLoading ||
      eventsQuery.isLoading ||
      selectedVcsQuery.isLoading,
    isError:
      peopleQuery.isError ||
      identitiesQuery.isError ||
      eventsQuery.isError ||
      selectedVcsQuery.isError,
    error:
      peopleQuery.error ??
      identitiesQuery.error ??
      eventsQuery.error ??
      selectedVcsQuery.error,
  };
}

export function useGraphData(enabled = true) {
  const picksQuery = useWeeklyPicks(enabled);
  const selectedVcsQuery = useSelectedVcWatchlist(enabled);
  const peopleQuery = useTrackedPeople(enabled);
  const eventsQuery = useActivityEvents(enabled);

  return {
    data: useMemo(() => {
      if (!selectedVcsQuery.data || !peopleQuery.data || !eventsQuery.data) {
        return null;
      }

      const selectedVcs = selectedVcsQuery.data.map((item) => item.vcSource);
      const selectedVcIds = new Set(selectedVcs.map((vc) => vc.id));
      const topPickIds = new Set((picksQuery.data ?? []).map((pick) => pick.person.id));
      const edgeMap = new Map<string, GraphEdge>();

      for (const event of eventsQuery.data.filter(
        (item) => item.vcSourceId && selectedVcIds.has(item.vcSourceId),
      )) {
        const key = `${event.vcSourceId}-${event.personId}-${event.platform}`;
        const existing = edgeMap.get(key);
        if (existing) {
          existing.eventCount += 1;
          continue;
        }
        edgeMap.set(key, {
          id: key,
          sourceId: event.vcSourceId!,
          targetId: event.personId,
          platform: event.platform,
          eventCount: 1,
          isTopPick: topPickIds.has(event.personId),
        });
      }

      const connectedPeopleIds = new Set(Array.from(edgeMap.values()).map((edge) => edge.targetId));
      const people = peopleQuery.data.filter(
        (person) => connectedPeopleIds.has(person.id) || topPickIds.has(person.id),
      );

      return {
        vcs: selectedVcs,
        people,
        events: eventsQuery.data,
        weeklyPicks: picksQuery.data ?? [],
        edges: Array.from(edgeMap.values()),
        hasSelectedVcs: selectedVcs.length > 0,
      };
    }, [eventsQuery.data, peopleQuery.data, picksQuery.data, selectedVcsQuery.data]),
    isLoading:
      picksQuery.isLoading ||
      selectedVcsQuery.isLoading ||
      peopleQuery.isLoading ||
      eventsQuery.isLoading,
    isError:
      picksQuery.isError ||
      selectedVcsQuery.isError ||
      peopleQuery.isError ||
      eventsQuery.isError,
    error:
      picksQuery.error ??
      selectedVcsQuery.error ??
      peopleQuery.error ??
      eventsQuery.error,
  };
}
