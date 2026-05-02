import type {
  Investor,
  Founder,
  Signal,
  ConvergenceAlert,
  AlertRule,
  AlertRuleResponse,
  Dossier,
  DossierSummary,
  DossierFeedback,
  FeedbackSubmission,
  FeedbackResult,
  NotifierStatus,
} from "@/data/types";
import {
  overlayAlerts,
  overlayFounderDetail,
  overlayFounders,
  overlayInvestors,
  overlayPerson,
} from "@/data/judgeOverlay";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "https://mispackaged-linn-prepoetic.ngrok-free.dev";

export interface GraphNodeDTO {
  id: string;
  kind: "investor" | "founder";
  data: Investor | Founder;
}

export interface GraphEdgeDTO {
  id: string;
  sourceId: string;
  targetId: string;
  signal: Signal;
}

export interface GraphResponse {
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  topPickFounderId?: string;
  generatedAt: string;
}

export interface HealthResponse {
  ok: boolean;
  neo4j: boolean;
  generatedAt: string;
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => getJSON<HealthResponse>("/api/health"),
  investors: () => getJSON<Investor[]>("/api/investors").then(overlayInvestors),
  founders: () => getJSON<Founder[]>("/api/founders").then(overlayFounders),
  alerts: () => getJSON<ConvergenceAlert[]>("/api/alerts").then(overlayAlerts),
  graph: () => getJSON<GraphResponse>("/api/graph"),
  person: (id: string) =>
    getJSON<Investor | Founder>(`/api/person/${encodeURIComponent(id)}`).then(overlayPerson),
  founder: (id: string) =>
    getJSON<Founder & {
      alerts: ConvergenceAlert[];
      latest_dossier_id?: string;
      latest_dossier_classification?: Dossier["classification"];
      latest_dossier_status?: Dossier["status"];
    }>(
      `/api/founder/${encodeURIComponent(id)}`
    ).then(overlayFounderDetail),
  alertRule: () => getJSON<AlertRuleResponse>("/api/alert-rule"),
  updateAlertRule: async (patch: Partial<AlertRule>): Promise<AlertRuleResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/alert-rule`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const j = await res.json();
        if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      } catch { /* ignore */ }
      const err = new Error(detail) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as AlertRuleResponse;
  },
  triggerNotifierSendNow: async (
    dryRun: boolean
  ): Promise<{ started: boolean; reason?: string; started_at?: string; dry_run?: boolean }> => {
    const res = await fetch(`${API_BASE_URL}/api/notifier/send-now`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ dry_run: dryRun }),
    });
    if (res.status === 409) {
      let reason = "already_running";
      try {
        const j = await res.json();
        if (j?.detail?.reason) reason = j.detail.reason;
      } catch { /* ignore */ }
      return { started: false, reason };
    }
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const j = await res.json();
        if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      } catch { /* ignore */ }
      throw new Error(detail);
    }
    return (await res.json()) as { started: boolean; started_at?: string; dry_run?: boolean };
  },
  notifierStatus: () => getJSON<NotifierStatus>("/api/notifier/status"),
  recomputeAlerts: () =>
    fetch(`${API_BASE_URL}/api/alerts/recompute`, {
      method: "POST",
      headers: { "ngrok-skip-browser-warning": "true" },
    }).then((r) => {
      if (!r.ok) throw new Error(`POST /api/alerts/recompute failed: ${r.status}`);
      return r.json();
    }),
  dossier: (id: string) =>
    getJSON<Dossier>(`/api/dossier/${encodeURIComponent(id)}`),
  dossiers: (status?: Dossier["status"]) =>
    getJSON<DossierSummary[]>(
      `/api/dossiers${status ? `?status=${encodeURIComponent(status)}` : ""}`
    ),
  regenerateDossier: (body: { target_id?: string; force_reclassify?: boolean }) =>
    fetch(`${API_BASE_URL}/api/dossiers/regenerate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error(`POST /api/dossiers/regenerate failed: ${r.status}`);
      return r.json();
    }),
  submitDossierFeedback: async (
    dossierId: string,
    body: FeedbackSubmission
  ): Promise<FeedbackResult> => {
    const res = await fetch(
      `${API_BASE_URL}/api/dossier/${encodeURIComponent(dossierId)}/feedback`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const j = await res.json();
        if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return (await res.json()) as FeedbackResult;
  },
  dossierFeedback: (dossierId: string) =>
    getJSON<DossierFeedback[]>(
      `/api/dossier/${encodeURIComponent(dossierId)}/feedback`
    ),
  allFeedback: (sinceIso?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (sinceIso) params.set("since", sinceIso);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return getJSON<DossierFeedback[]>(`/api/feedback${qs ? `?${qs}` : ""}`);
  },
};

export { API_BASE_URL };
