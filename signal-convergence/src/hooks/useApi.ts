import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AlertRule, Dossier } from "@/data/types";

const STALE_30S = 30_000;
const REFETCH_30S = 30_000;

export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: REFETCH_30S,
    staleTime: STALE_30S,
  });

export const useInvestors = () =>
  useQuery({
    queryKey: ["investors"],
    queryFn: api.investors,
    staleTime: STALE_30S,
  });

export const useFounders = () =>
  useQuery({
    queryKey: ["founders"],
    queryFn: api.founders,
    staleTime: STALE_30S,
  });

export const useAlerts = () =>
  useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts,
    refetchInterval: REFETCH_30S,
    staleTime: STALE_30S,
  });

export const useGraph = () =>
  useQuery({
    queryKey: ["graph"],
    queryFn: api.graph,
    refetchInterval: REFETCH_30S,
    staleTime: STALE_30S,
  });

export const useFounder = (id: string | undefined) =>
  useQuery({
    queryKey: ["founder", id],
    queryFn: () => api.founder(id!),
    enabled: !!id,
    staleTime: STALE_30S,
  });

export const useAlertRule = () =>
  useQuery({
    queryKey: ["alert-rule"],
    queryFn: api.alertRule,
    staleTime: 60_000,
  });

export const useUpdateAlertRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AlertRule>) => api.updateAlertRule(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rule"] }),
  });
};

export const useRecomputeAlerts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.recomputeAlerts,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
};

export const useDossier = (id: string | undefined) =>
  useQuery({
    queryKey: ["dossier", id],
    queryFn: () => api.dossier(id!),
    enabled: !!id,
    staleTime: STALE_30S,
  });

export const useDossiers = (status?: Dossier["status"]) =>
  useQuery({
    queryKey: ["dossiers", status ?? "all"],
    queryFn: () => api.dossiers(status),
    staleTime: STALE_30S,
  });

export const useRegenerateDossier = (dossierId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { target_id?: string; force_reclassify?: boolean }) =>
      api.regenerateDossier(body),
    onSuccess: () => {
      if (dossierId) qc.invalidateQueries({ queryKey: ["dossier", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
    },
  });
};