import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  ActivityEvent,
  GraphEdge,
  PersonIdentity,
  TrackedPerson,
  ViewerAccessState,
  VcSource,
  WatchlistPerson,
  WeeklyPick,
  WeeklyPickReason,
} from "@/data/anytrace";

type SubRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type VcRow = Database["public"]["Tables"]["vc_sources"]["Row"];
type PersonRow = Database["public"]["Tables"]["tracked_people"]["Row"];
type IdentityRow = Database["public"]["Tables"]["person_identities"]["Row"];
type EventRow = Database["public"]["Tables"]["activity_events"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["weekly_pick_snapshots"]["Row"];
type ReasonRow = Database["public"]["Tables"]["weekly_pick_reasons"]["Row"];

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
    linkedinUrl: row.linkedin_url,
    githubUsername: row.github_username,
    websiteUrl: row.website_url,
    notes: row.notes,
    isSeeded: row.is_seeded,
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
  };
}

function mapReason(row: ReasonRow): WeeklyPickReason {
  return {
    id: row.id,
    reasonKind: row.reason_kind,
    title: row.title,
    detail: row.detail,
    metricValue: row.metric_value,
    displayOrder: row.display_order,
    sourceEventId: row.source_event_id,
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

export function useAccessState() {
  const { session, loading } = useSession();

  const subscriptionQuery = useQuery({
    queryKey: ["subscription", session?.user.id ?? "signed-out"],
    enabled: !!session?.user.id,
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

  return {
    session,
    loading: loading || subscriptionQuery.isLoading,
    access,
    subscription: subscriptionQuery.data ?? null,
  };
}

export function useMagicLinkSignIn() {
  return useMutation({
    mutationFn: async (email: string) => {
      const redirectTo = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useVcSources(enabled = true) {
  return useQuery({
    queryKey: ["vc-sources"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("vc_sources").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(mapVc);
    },
  });
}

export function useTrackedPeople(enabled = true) {
  return useQuery({
    queryKey: ["tracked-people"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
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
  return useQuery({
    queryKey: ["person-identities"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
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
  return useQuery({
    queryKey: ["activity-events"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
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
  return useQuery({
    queryKey: ["weekly-picks"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: snapshots, error: snapshotsError }, { data: people, error: peopleError }, { data: reasons, error: reasonsError }] =
        await Promise.all([
          supabase.from("weekly_pick_snapshots").select("*").order("week_start", { ascending: false }).order("rank"),
          supabase.from("tracked_people").select("*"),
          supabase.from("weekly_pick_reasons").select("*").order("display_order"),
        ]);

      if (snapshotsError) throw snapshotsError;
      if (peopleError) throw peopleError;
      if (reasonsError) throw reasonsError;

      const personMap = new Map((people ?? []).map((person) => [person.id, mapPerson(person)]));
      const reasonsBySnapshot = new Map<string, WeeklyPickReason[]>();

      for (const reasonRow of reasons ?? []) {
        const mapped = mapReason(reasonRow);
        const list = reasonsBySnapshot.get(reasonRow.snapshot_id) ?? [];
        list.push(mapped);
        reasonsBySnapshot.set(reasonRow.snapshot_id, list);
      }

      return (snapshots ?? [])
        .map((row: SnapshotRow): WeeklyPick | null => {
          const person = personMap.get(row.person_id);
          if (!person) return null;
          return {
            id: row.id,
            weekStart: row.week_start,
            rank: row.rank,
            score: row.score,
            primaryReason: row.primary_reason,
            summary: row.summary,
            vcFollowCount: row.vc_follow_count,
            githubAttentionScore: row.github_attention_score,
            bigTechExit: row.big_tech_exit,
            person,
            reasons: (reasonsBySnapshot.get(row.id) ?? []).sort(
              (a, b) => a.displayOrder - b.displayOrder,
            ),
          };
        })
        .filter((pick): pick is WeeklyPick => !!pick);
    },
  });
}

export function useWatchlist(enabled = true) {
  const peopleQuery = useTrackedPeople(enabled);
  const identitiesQuery = usePersonIdentities(enabled);
  const eventsQuery = useActivityEvents(enabled);

  return {
    ...peopleQuery,
    data: useMemo(() => {
      if (!peopleQuery.data || !identitiesQuery.data || !eventsQuery.data) return [];
      const identitiesByPerson = new Map<string, PersonIdentity[]>();
      for (const identity of identitiesQuery.data) {
        const list = identitiesByPerson.get(identity.personId) ?? [];
        list.push(identity);
        identitiesByPerson.set(identity.personId, list);
      }

      return peopleQuery.data.map<WatchlistPerson>((person) => {
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
        };
      });
    }, [peopleQuery.data, identitiesQuery.data, eventsQuery.data]),
    isLoading: peopleQuery.isLoading || identitiesQuery.isLoading || eventsQuery.isLoading,
    isError: peopleQuery.isError || identitiesQuery.isError || eventsQuery.isError,
    error: peopleQuery.error ?? identitiesQuery.error ?? eventsQuery.error,
  };
}

export function useGraphData(enabled = true) {
  const picksQuery = useWeeklyPicks(enabled);
  const vcsQuery = useVcSources(enabled);
  const peopleQuery = useTrackedPeople(enabled);
  const eventsQuery = useActivityEvents(enabled);

  return {
    data: useMemo(() => {
      if (!vcsQuery.data || !peopleQuery.data || !eventsQuery.data) {
        return null;
      }

      const topPickIds = new Set((picksQuery.data ?? []).map((pick) => pick.person.id));
      const edgeMap = new Map<string, GraphEdge>();

      for (const event of eventsQuery.data.filter((item) => item.vcSourceId)) {
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

      return {
        vcs: vcsQuery.data,
        people: peopleQuery.data,
        events: eventsQuery.data,
        weeklyPicks: picksQuery.data ?? [],
        edges: Array.from(edgeMap.values()),
      };
    }, [eventsQuery.data, peopleQuery.data, picksQuery.data, vcsQuery.data]),
    isLoading:
      picksQuery.isLoading || vcsQuery.isLoading || peopleQuery.isLoading || eventsQuery.isLoading,
    isError: picksQuery.isError || vcsQuery.isError || peopleQuery.isError || eventsQuery.isError,
    error: picksQuery.error ?? vcsQuery.error ?? peopleQuery.error ?? eventsQuery.error,
  };
}
