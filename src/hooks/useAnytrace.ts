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
  GraphData,
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
const DEMO_PROFILE_KEY = "anytrace-demo-profile-v1";
const DEMO_VC_CATALOG_KEY = "anytrace-demo-vc-catalog-v2";
const DEMO_VC_SELECTED_IDS_KEY = "anytrace-demo-selected-vc-ids-v2";
const LOCAL_GITHUB_PEOPLE_KEY = "anytrace-local-github-people-v1";
const LOCAL_GITHUB_SELECTED_IDS_KEY = "anytrace-local-github-selected-ids-v1";

type DemoProfile = {
  email: string;
  id: string;
  fullName?: string;
};

type LocalGithubEntry = {
  person: TrackedPerson;
  identities: PersonIdentity[];
};

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

function readDemoProfile(): DemoProfile {
  return readJson(DEMO_PROFILE_KEY, {
    email: "demo@anytrace.local",
    id: "demo-user",
    fullName: "Demo User",
  });
}

function writeDemoProfile(profile: DemoProfile) {
  writeJson(DEMO_PROFILE_KEY, profile);
}

function slugifyVc(name: string, firm: string) {
  return `${name}-${firm}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTwitterInput(input: string) {
  const trimmed = input.trim();
  const withoutAt = trimmed.replace(/^@/, "");
  if (!trimmed) {
    return { handle: "", url: "" };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const handle = parsed.pathname.split("/").filter(Boolean).at(-1)?.replace(/^@/, "") ?? "";
      if (!handle) {
        return { handle: "", url: "" };
      }
      return {
        handle: handle.toLowerCase(),
        url: `https://twitter.com/${handle}`,
      };
    } catch {
      if (!withoutAt) {
        return { handle: "", url: "" };
      }
      return { handle: withoutAt.toLowerCase(), url: `https://twitter.com/${withoutAt}` };
    }
  }
  if (!withoutAt) {
    return { handle: "", url: "" };
  }
  return {
    handle: withoutAt.toLowerCase(),
    url: `https://twitter.com/${withoutAt}`,
  };
}

function inferTier(sizeLabel: string | undefined): "vc" | "microvc" {
  if (!sizeLabel) return "vc";
  return sizeLabel.toLowerCase().includes("klein") ? "microvc" : "vc";
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

function readLocalGithubEntries() {
  return readJson<LocalGithubEntry[]>(LOCAL_GITHUB_PEOPLE_KEY, []);
}

function writeLocalGithubEntries(entries: LocalGithubEntry[]) {
  writeJson(LOCAL_GITHUB_PEOPLE_KEY, entries);
}

function readLocalGithubSelectedIds() {
  return readJson<string[]>(LOCAL_GITHUB_SELECTED_IDS_KEY, []);
}

function writeLocalGithubSelectedIds(ids: string[]) {
  writeJson(LOCAL_GITHUB_SELECTED_IDS_KEY, ids);
}

function githubProfileUrl(handle: string) {
  return `https://github.com/${handle}`;
}

function xProfileUrl(handle: string) {
  return `https://x.com/${handle}`;
}

function linkedinProfileUrl(handle: string) {
  return handle.startsWith("http") ? handle : `https://www.linkedin.com/in/${handle}/`;
}

function markDemoSync(target: "x" | "github" | "media-backfill" | "all") {
  const now = new Date().toISOString();

  if (target === "x" || target === "all" || target === "github") {
    const selectedIds = new Set(readDemoSelectedVcIds());
    const nextCatalog = readDemoVcCatalog().map((vc) => {
      if (!selectedIds.has(vc.id)) return vc;

      if (target === "x" || target === "all") {
        return {
          ...vc,
          syncStatus: "ok" as const,
          lastXSyncAt: now,
          lastSyncError: null,
        };
      }

      return {
        ...vc,
        syncStatus: "ok" as const,
        lastGithubSyncAt: now,
        lastSyncError: null,
      };
    });

    writeDemoVcCatalog(nextCatalog);
  }

  return {
    ok: true,
    mode: "demo",
    target,
    syncedAt: now,
  };
}

function mapVc(row: VcRow): VcSource {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.title,
    firm: row.firm,
    sizeLabel: row.size_label ?? row.title,
    sectorFocus: row.sector_focus ?? row.firm,
    tier: row.tier,
    region: row.region,
    country: row.country,
    city: row.city,
    xHandle: row.x_handle,
    twitterUrl: row.twitter_url ?? (row.x_handle ? `https://twitter.com/${row.x_handle}` : null),
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
  const trialEnds = subscription.trial_ends_at ? new Date(subscription.trial_ends_at).getTime() : Number.NaN;
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
    trialEndsAt: subscription.trial_ends_at ?? null,
    daysLeftInTrial: daysLeft,
  };
}

async function getFreshSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

async function callServerApi<T>(path: string, body?: Record<string, unknown>) {
  const session = await getFreshSession();
  if (!session?.access_token) {
    throw new Error("You need to be signed in to run this sync.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body ?? {}),
  });

  const rawText = await response.text();
  const payload = rawText
    ? ((() => {
        try {
          return JSON.parse(rawText) as T | { error?: string; details?: string } | null;
        } catch {
          return null;
        }
      })())
    : null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : rawText.trim()
          ? `${path} failed with status ${response.status}: ${rawText.trim().slice(0, 240)}`
          : `${path} failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
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
    if (typeof window === "undefined") return;
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
    const demoProfile = readDemoProfile();
    return {
      session: {
        user: { id: demoProfile.id, email: demoProfile.email },
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
      const siteUrl =
        (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ||
        window.location.origin;
      const redirectTo = new URL("/auth/confirm", siteUrl).toString();
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
    mutationFn: async (profile?: Partial<DemoProfile>) => {
      if (profile?.email || profile?.id || profile?.fullName) {
        const existing = readDemoProfile();
        writeDemoProfile({
          ...existing,
          ...profile,
          email: profile?.email ?? existing.email,
          id: profile?.id ?? existing.id,
        });
      }
      writeDemoMode(true);
    },
  });
}

export function useLoginAsAle() {
  return useMutation({
    mutationFn: async () => {
      const email = (import.meta.env.VITE_ALE_TEST_EMAIL as string | undefined)?.trim();
      const password = (import.meta.env.VITE_ALE_TEST_PASSWORD as string | undefined)?.trim();

      if (!email || !password) {
        throw new Error("Missing VITE_ALE_TEST_EMAIL or VITE_ALE_TEST_PASSWORD.");
      }

      writeDemoMode(false);
      writeDemoProfile({
        id: "demo-user",
        email: "demo@anytrace.local",
        fullName: "Demo User",
      });

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      writeDemoProfile({
        email: "demo@anytrace.local",
        id: "demo-user",
        fullName: "Demo User",
      });
      writeDemoMode(false);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useManualSync() {
  const qc = useQueryClient();
  const demoMode = useDemoMode();

  return useMutation({
    mutationFn: async (target: "x" | "github" | "media-backfill" | "all") => {
      if (demoMode) {
        if (target === "all") {
          return {
            x: markDemoSync("x"),
            github: markDemoSync("github"),
            mediaBackfill: markDemoSync("media-backfill"),
          };
        }

        return markDemoSync(target);
      }

      if (target === "all") {
        const xResult = await callServerApi<Record<string, unknown>>("/api/sync/x");
        const githubResult = await callServerApi<Record<string, unknown>>("/api/sync/github");
        const mediaResult = await callServerApi<Record<string, unknown>>("/api/sync/media-backfill");
        return {
          x: xResult,
          github: githubResult,
          mediaBackfill: mediaResult,
        };
      }

      return await callServerApi<Record<string, unknown>>(`/api/sync/${target}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vc-sources"] });
      qc.invalidateQueries({ queryKey: ["tracked-people"] });
      qc.invalidateQueries({ queryKey: ["person-identities"] });
      qc.invalidateQueries({ queryKey: ["activity-events"] });
      qc.invalidateQueries({ queryKey: ["selected-vc-watchlist"] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["graph-data"] });
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

      if (vcsError) throw vcsError;

      const mappedVcs = (vcs ?? []).map(mapVc);
      const vcMap = new Map(mappedVcs.map((row) => [row.id, row]));

      if (itemsError) {
        return mappedVcs
          .filter((vc) => vc.isSeeded)
          .map<UserVcWatchlistItem>((vc, index) => ({
            id: `fallback-watch-${vc.id}`,
            userId: session!.user.id,
            vcSourceId: vc.id,
            createdAt: new Date(Date.now() + index * 1000).toISOString(),
            vcSource: vc,
          }));
      }

      if ((items ?? []).length === 0) {
        return mappedVcs
          .filter((vc) => vc.isSeeded)
          .map<UserVcWatchlistItem>((vc, index) => ({
            id: `fallback-watch-${vc.id}`,
            userId: session!.user.id,
            vcSourceId: vc.id,
            createdAt: new Date(Date.now() + index * 1000).toISOString(),
            vcSource: vc,
          }));
      }

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
      const slug = slugifyVc(draft.name, draft.country);
      const normalizedTwitter = normalizeTwitterInput(draft.twitterUrl);
      const sizeLabel = draft.sizeLabel.trim();
      const sectorFocus = draft.sectorFocus.trim();
      if (!normalizedTwitter.handle) {
        throw new Error("Please provide a valid Twitter URL or handle.");
      }

      if (demoMode) {
        const catalog = readDemoVcCatalog();
        const selectedIds = new Set(readDemoSelectedVcIds());
        const existing =
          catalog.find((vc) => vc.xHandle?.toLowerCase() === normalizedTwitter.handle) ??
          catalog.find((vc) => vc.slug === slug);

        const vc: VcSource =
          existing ??
          {
            id: `demo-vc-${crypto.randomUUID()}`,
            slug: existing?.slug ?? slug,
            name: draft.name.trim(),
            title: sizeLabel,
            firm: sectorFocus,
            sizeLabel,
            sectorFocus,
            tier: draft.tier ?? inferTier(sizeLabel),
            region: draft.region?.trim() || "Europe",
            country: draft.country.trim(),
            city: draft.city?.trim() || "",
            xHandle: normalizedTwitter.handle,
            twitterUrl: normalizedTwitter.url,
            xUserId: null,
            linkedinUrl: draft.linkedinUrl.trim(),
            githubUsername: draft.githubUsername?.trim() || null,
            websiteUrl: draft.websiteUrl?.trim() || null,
            notes: draft.notes?.trim() || sectorFocus,
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

      const { data: existingByHandle, error: existingError } = await supabase
        .from("vc_sources")
        .select("*")
        .eq("x_handle", normalizedTwitter.handle)
        .maybeSingle();

      if (existingError) throw existingError;

      let vcId = existingByHandle?.id;

      if (!vcId) {
        const { data: inserted, error: insertError } = await supabase
          .from("vc_sources")
          .insert({
            slug,
            name: draft.name.trim(),
            title: sizeLabel,
            firm: sectorFocus,
            size_label: sizeLabel,
            sector_focus: sectorFocus,
            tier: draft.tier ?? inferTier(sizeLabel),
            region: draft.region?.trim() || "Europe",
            country: draft.country.trim(),
            city: draft.city?.trim() || "",
            x_handle: normalizedTwitter.handle,
            twitter_url: normalizedTwitter.url,
            linkedin_url: draft.linkedinUrl.trim(),
            github_username: draft.githubUsername?.trim() || null,
            website_url: draft.websiteUrl?.trim() || null,
            notes: draft.notes?.trim() || sectorFocus,
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
      const localPeople = readLocalGithubEntries().map((entry) => entry.person);
      if (demoMode) {
        const merged = [...demoTrackedPeople, ...localPeople];
        return Array.from(new Map(merged.map((person) => [person.id, person])).values());
      }
      const { data, error } = await supabase
        .from("tracked_people")
        .select("*")
        .eq("is_watchlist", true)
        .order("full_name");
      if (error) throw error;
      const merged = [...(data ?? []).map(mapPerson), ...localPeople];
      return Array.from(new Map(merged.map((person) => [person.id, person])).values());
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
      const localIdentities = readLocalGithubEntries().flatMap((entry) => entry.identities);
      if (demoMode) {
        const merged = [...demoPersonIdentities, ...localIdentities];
        return Array.from(new Map(merged.map((identity) => [identity.id, identity])).values());
      }
      const { data, error } = await supabase
        .from("person_identities")
        .select("*")
        .order("platform");
      if (error) throw error;
      const merged = [...(data ?? []).map(mapIdentity), ...localIdentities];
      return Array.from(new Map(merged.map((identity) => [identity.id, identity])).values());
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
  const demoMode = useDemoMode();

  return {
    data: useMemo<WatchlistData>(() => {
      if (!peopleQuery.data || !identitiesQuery.data || !eventsQuery.data) {
        return {
          selectedVcs: selectedVcsQuery.data ?? [],
          people: [],
        };
      }
      const explicitSelectedGithubIds = readLocalGithubSelectedIds();
      const selectedGithubIds = new Set(
        explicitSelectedGithubIds.length > 0
          ? explicitSelectedGithubIds
          : demoMode
            ? demoTrackedPeople.map((person) => person.id)
            : peopleQuery.data.map((person) => person.id),
      );
      const identitiesByPerson = new Map<string, PersonIdentity[]>();
      for (const identity of identitiesQuery.data) {
        const list = identitiesByPerson.get(identity.personId) ?? [];
        list.push(identity);
        identitiesByPerson.set(identity.personId, list);
      }
      const eventsByPerson = new Map<string, ActivityEvent[]>();
      for (const event of eventsQuery.data) {
        const list = eventsByPerson.get(event.personId) ?? [];
        list.push(event);
        eventsByPerson.set(event.personId, list);
      }

      const people = peopleQuery.data
        .filter((person) => selectedGithubIds.has(person.id))
        .map<WatchlistPerson>((person) => {
          const personEvents = eventsByPerson.get(person.id) ?? [];
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
    }, [demoMode, eventsQuery.data, identitiesQuery.data, peopleQuery.data, selectedVcsQuery.data]),
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

export function useAddGithubPersonToWatchlist() {
  const qc = useQueryClient();
  const { demoMode } = useAccessState();

  return useMutation({
    mutationFn: async (input: {
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
      const selectedIds = new Set(readLocalGithubSelectedIds());

      if (input.existing) {
        selectedIds.add(input.existing.person.id);
        writeLocalGithubSelectedIds(Array.from(selectedIds));
        return input.existing.person.id;
      }

      const draft = input.draft;
      if (!draft?.fullName.trim() || !draft.githubHandle.trim()) {
        throw new Error("Name and GitHub handle are required.");
      }

      const githubHandle = draft.githubHandle.trim().replace(/^@/, "");
      const personId = `local-gh-${crypto.randomUUID()}`;
      const person: TrackedPerson = {
        id: personId,
        slug: githubHandle.toLowerCase(),
        fullName: draft.fullName.trim(),
        roleTitle: draft.roleTitle?.trim() || "GitHub builder",
        company: draft.company?.trim() || "",
        location: draft.location?.trim() || "",
        summary: draft.summary?.trim() || `Manually added GitHub person @${githubHandle}.`,
        avatarUrl: null,
        topPickNote: "",
        isWatchlist: true,
      };

      const identities: PersonIdentity[] = [
        {
          id: `local-gh-identity-${crypto.randomUUID()}`,
          personId,
          platform: "github",
          handle: githubHandle,
          profileUrl: githubProfileUrl(githubHandle),
          isPrimary: true,
        },
      ];

      const xHandle = draft.xHandle?.trim().replace(/^@/, "");
      if (xHandle) {
        identities.push({
          id: `local-x-identity-${crypto.randomUUID()}`,
          personId,
          platform: "x",
          handle: xHandle,
          profileUrl: xProfileUrl(xHandle),
          isPrimary: true,
        });
      }

      const linkedinHandle = draft.linkedinHandle?.trim();
      if (linkedinHandle) {
        identities.push({
          id: `local-li-identity-${crypto.randomUUID()}`,
          personId,
          platform: "linkedin",
          handle: linkedinHandle,
          profileUrl: linkedinProfileUrl(linkedinHandle),
          isPrimary: true,
        });
      }

      const entries = readLocalGithubEntries();
      entries.push({ person, identities });
      writeLocalGithubEntries(entries);
      selectedIds.add(personId);
      writeLocalGithubSelectedIds(Array.from(selectedIds));

      return personId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracked-people"] });
      qc.invalidateQueries({ queryKey: ["person-identities"] });
      qc.invalidateQueries({ queryKey: ["activity-events"] });
      qc.invalidateQueries({ queryKey: ["graph-data"] });
    },
  });
}

export function useRemoveGithubPersonFromWatchlist() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (personId: string) => {
      const selectedIds = readLocalGithubSelectedIds().filter((id) => id !== personId);
      writeLocalGithubSelectedIds(selectedIds);

      if (personId.startsWith("local-gh-")) {
        const remainingEntries = readLocalGithubEntries().filter((entry) => entry.person.id !== personId);
        writeLocalGithubEntries(remainingEntries);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracked-people"] });
      qc.invalidateQueries({ queryKey: ["person-identities"] });
      qc.invalidateQueries({ queryKey: ["activity-events"] });
      qc.invalidateQueries({ queryKey: ["graph-data"] });
    },
  });
}

export function useGraphData(enabled = true, viewMode: "selected" | "all" = "selected") {
  const picksQuery = useWeeklyPicks(enabled);
  const selectedVcsQuery = useSelectedVcWatchlist(enabled);
  const vcSourcesQuery = useVcSources(enabled);
  const peopleQuery = useTrackedPeople(enabled);
  const eventsQuery = useActivityEvents(enabled);

  return {
    data: useMemo<GraphData | null>(() => {
      if (!selectedVcsQuery.data || !vcSourcesQuery.data || !peopleQuery.data || !eventsQuery.data) {
        return null;
      }

      const selectedVcs = selectedVcsQuery.data.map((item) => item.vcSource);
      const allVcs = vcSourcesQuery.data;
      const scopedVcs = viewMode === "all" ? allVcs : selectedVcs;
      const selectedVcIds = new Set(scopedVcs.map((vc) => vc.id));
      const validVcIds = new Set(allVcs.map((vc) => vc.id));
      const topPickIds = new Set((picksQuery.data ?? []).map((pick) => pick.person.id));
      const edgeMap = new Map<string, GraphEdge>();
      const validEvents = eventsQuery.data.filter(
        (item) => item.vcSourceId && validVcIds.has(item.vcSourceId),
      );
      const orphanedEventCount = eventsQuery.data.filter(
        (item) => item.vcSourceId && !validVcIds.has(item.vcSourceId),
      ).length;
      const directEvents = validEvents.filter((item) => selectedVcIds.has(item.vcSourceId!));
      const fallbackOnlyEvents = validEvents.filter((item) => item.eventType === "vc_follow");
      const graphEvents = directEvents.length > 0 ? directEvents : fallbackOnlyEvents;
      const graphSource =
        directEvents.length > 0
          ? "direct"
          : fallbackOnlyEvents.length > 0
            ? "fallback"
            : "empty";

      for (const event of graphEvents) {
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
          graphSource: graphSource === "direct" ? "direct" : "fallback",
        });
      }

      const connectedPeopleIds = new Set(Array.from(edgeMap.values()).map((edge) => edge.targetId));
      const connectedVcIds = new Set(Array.from(edgeMap.values()).map((edge) => edge.sourceId));
      const visibleVcs =
        directEvents.length > 0
          ? scopedVcs
          : allVcs.filter((vc) => connectedVcIds.has(vc.id)).length > 0
            ? allVcs.filter((vc) => connectedVcIds.has(vc.id))
            : scopedVcs;
      const people = peopleQuery.data.filter(
        (person) => connectedPeopleIds.has(person.id) || topPickIds.has(person.id),
      );

      return {
        vcs: visibleVcs,
        people,
        events: eventsQuery.data,
        weeklyPicks: picksQuery.data ?? [],
        edges: Array.from(edgeMap.values()),
        hasSelectedVcs: selectedVcs.length > 0,
        viewMode,
        graphSource,
        orphanedEventCount,
      };
    }, [eventsQuery.data, peopleQuery.data, picksQuery.data, selectedVcsQuery.data, vcSourcesQuery.data, viewMode]),
    isLoading:
      picksQuery.isLoading ||
      selectedVcsQuery.isLoading ||
      vcSourcesQuery.isLoading ||
      peopleQuery.isLoading ||
      eventsQuery.isLoading,
    isError:
      picksQuery.isError ||
      selectedVcsQuery.isError ||
      vcSourcesQuery.isError ||
      peopleQuery.isError ||
      eventsQuery.isError,
    error:
      picksQuery.error ??
      selectedVcsQuery.error ??
      vcSourcesQuery.error ??
      peopleQuery.error ??
      eventsQuery.error,
  };
}
