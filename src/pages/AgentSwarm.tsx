import { useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Database, Github, Globe2, Linkedin, Play, Smartphone, Sparkles, Square } from "lucide-react";
import type { TriageResult } from "@/data/traqr";
import { getBackendBaseUrl } from "@/hooks/useTraqr";
import { getDemoTriageRun } from "@/lib/demoData";
import { isTraqrDemoMode } from "@/lib/demoMode";
import {
  founderTopPicks,
  summarizeSwarmPayload,
  type SwarmNodeId,
  type SwarmNodeState,
  type SwarmStepResult,
  type SwarmTriagePayload,
} from "@/lib/agentSwarm";

type SwarmPosition = "manager" | "finder" | "qualification" | "feasibility" | "ghosting";

const SWARM_STEPS: Array<{
  id: SwarmNodeId;
  label: string;
  role: string;
  stepIdle: string;
  endpoint: string;
  body?: Record<string, unknown>;
  position: SwarmPosition;
  Icon: typeof Sparkles;
  logo: string;
  brandClass: string;
  iconClass?: string;
}> = [
  {
    id: "x",
    label: "X",
    role: "Seed-source follows and public profile signals.",
    stepIdle: "TweetAPI ready",
    endpoint: "/agent-swarm/run-x",
    body: { seedLimit: 3, tweetApiMaxPages: 1, tweetApiPageSize: 25 },
    position: "manager",
    Icon: Sparkles,
    logo: "X",
    brandClass: "brand-x",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    role: "Role, company, and founder context enrichment.",
    stepIdle: "Profile context",
    endpoint: "/agent-swarm/run-linkedin",
    body: { limit: 3, missingOnly: false },
    position: "feasibility",
    Icon: Linkedin,
    logo: "",
    brandClass: "brand-linkedin",
    iconClass: "fill-white stroke-white",
  },
  {
    id: "github",
    label: "GitHub",
    role: "Builder proof, repos, and momentum.",
    stepIdle: "Builder proof",
    endpoint: "/agent-swarm/run-github",
    body: { viralRepoLimit: 3, networkMaxPages: 1 },
    position: "ghosting",
    Icon: Github,
    logo: "",
    brandClass: "brand-github",
    iconClass: "fill-white stroke-white",
  },
  {
    id: "crunchbase",
    label: "Crunchbase",
    role: "Company funding and organization lookup.",
    stepIdle: "Company lookup",
    endpoint: "/agent-swarm/run-crunchbase",
    body: { candidateLimit: 10 },
    position: "qualification",
    Icon: Database,
    logo: "cb",
    brandClass: "brand-crunchbase",
  },
  {
    id: "featherless",
    label: "Featherless",
    role: "Final founder triage and top-pick ranking.",
    stepIdle: "Triage ready",
    endpoint: "/agent-swarm/run-featherless-triage",
    position: "finder",
    Icon: BrainCircuit,
    logo: "",
    brandClass: "brand-featherless",
    iconClass: "stroke-white",
  },
];

const TELEGRAM_BOT_HANDLE = "traqrsignals_bot";
const TELEGRAM_WEB_URL = `https://web.telegram.org/k/#@${TELEGRAM_BOT_HANDLE}`;
const TELEGRAM_APP_URL = `tg://resolve?domain=${TELEGRAM_BOT_HANDLE}`;

const NODE_ORDER = SWARM_STEPS.map((step) => step.id);
const initialNodeStates = Object.fromEntries(NODE_ORDER.map((id) => [id, "idle"])) as Record<SwarmNodeId, SwarmNodeState>;
const completeNodeStates = Object.fromEntries(NODE_ORDER.map((id) => [id, "complete"])) as Record<SwarmNodeId, SwarmNodeState>;
const demoStepDelays: Record<SwarmNodeId, number> = {
  x: 3200,
  linkedin: 2200,
  github: 2300,
  crunchbase: 2100,
  featherless: 2600,
};

type SwarmPostResult = {
  ok: boolean;
  error?: string;
  status: string;
  payload: Record<string, unknown>;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function demoTriagePayload(): SwarmTriagePayload {
  const run = getDemoTriageRun();
  const topPicks = founderTopPicks(run);
  return {
    ...run,
    ok: true,
    mode: "mock",
    provider: "featherless",
    topPicks,
    hiddenCount: Math.max(0, (run.results?.length ?? 0) - topPicks.length),
  };
}

function demoPayloadForStep(id: SwarmNodeId): Record<string, unknown> {
  const triage = demoTriagePayload();
  const rawCandidates = triage.rawCandidates ?? [];
  const results = triage.results ?? [];
  const totalSeedFollows = rawCandidates.reduce((sum, candidate) => sum + (candidate.currentSeedFollowerCount || 0), 0);
  const linkedInProfiles = rawCandidates.filter((candidate) => Boolean(candidate.linkedinUrl));
  const githubProfiles = rawCandidates.filter((candidate) => Boolean(candidate.githubUrl || candidate.githubContext?.handle));
  const companyProfiles = rawCandidates.filter((candidate) => Boolean(candidate.linkedinCompany));

  if (id === "x") {
    return {
      ok: true,
      status: "completed",
      processed: 3,
      matchedCandidateCount: rawCandidates.length,
      newSnapshotCount: totalSeedFollows,
      message: "Demo seed graph loaded from the production-style founder snapshot.",
    };
  }

  if (id === "linkedin") {
    return {
      ok: true,
      status: "completed",
      processed: rawCandidates.length,
      enriched: linkedInProfiles.length,
      skipped: rawCandidates.length - linkedInProfiles.length,
      message: "Demo LinkedIn context loaded from the enriched founder snapshot.",
    };
  }

  if (id === "github") {
    return {
      ok: true,
      status: "completed",
      trackedCount: githubProfiles.length,
      viralRepoCount: Math.min(3, results.filter((result) => Boolean(result.githubContext?.topRepos?.length)).length || 3),
      message: "Demo GitHub builder signals loaded from candidate-linked contexts.",
    };
  }

  if (id === "crunchbase") {
    return {
      ok: true,
      status: "completed",
      processed: companyProfiles.length,
      enriched: companyProfiles.length,
      message: "Demo company records matched from enriched organization context.",
    };
  }

  return triage;
}

function demoStepResults(): SwarmStepResult[] {
  return SWARM_STEPS.map((step) => {
    const payload = demoPayloadForStep(step.id);
    return {
      id: step.id,
      ok: true,
      status: String(payload.status || "completed"),
      summary: summarizeSwarmPayload(step.id, payload),
      payload,
    };
  });
}

async function postDemoSwarmStep(step: (typeof SWARM_STEPS)[number]): Promise<SwarmPostResult> {
  await wait(260);
  const payload = demoPayloadForStep(step.id);
  return {
    ok: true,
    status: String(payload.status || "completed"),
    payload,
  };
}

function activeNodeLabel(ids: SwarmNodeId[]) {
  if (!ids.length) return "agent";
  if (ids.length === 1) return ids[0];
  return `${ids.length} agents`;
}

async function animateDemoStep(stepId: SwarmNodeId, setActiveNodes: (ids: SwarmNodeId[]) => void) {
  const total = demoStepDelays[stepId];
  const choreography: SwarmNodeId[][] =
    stepId === "x"
      ? [["x"], ["x", "linkedin"], ["x", "github"], ["x", "crunchbase"], ["x", "featherless"], ["x"]]
      : stepId === "featherless"
        ? [["x", "linkedin"], ["x", "github"], ["x", "crunchbase"], ["featherless", "x"], ["featherless", "x", "github"], ["featherless", "x"]]
        : [["x", stepId], ["x", stepId, "featherless"], ["x"], ["x", stepId, "github"], ["x", stepId]];
  const segment = Math.max(180, Math.floor(total / choreography.length));
  for (const ids of choreography) {
    setActiveNodes(ids);
    await wait(segment);
  }
  setActiveNodes([stepId]);
}

async function postSwarmStep(step: (typeof SWARM_STEPS)[number]): Promise<SwarmPostResult> {
  const response = await fetch(`${getBackendBaseUrl()}${step.endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step.body ?? {}),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      error: String(payload.error || `${step.label} request failed.`),
      status: String(payload.status || "error"),
      payload,
    };
  }
  return {
    ok: payload.ok !== false && payload.status !== "no_linkedin_urls" && payload.status !== "partial_error",
    error:
      payload.ok === false || payload.status === "no_linkedin_urls" || payload.status === "partial_error"
        ? String(payload.error || payload.message || `${step.label} returned no live data.`)
        : undefined,
    status: String(payload.status || "completed"),
    payload,
  };
}

function lineEnd(position: SwarmPosition) {
  return {
    manager: { x: 50, y: 14 },
    finder: { x: 18, y: 36 },
    qualification: { x: 24, y: 78 },
    feasibility: { x: 76, y: 36 },
    ghosting: { x: 82, y: 78 },
  }[position];
}

function connectionPath(position: SwarmPosition) {
  const end = lineEnd(position);
  const bendY = position === "manager" ? 32 : end.y > 50 ? 62 : 40;
  return `M50 50 Q50 ${bendY} ${end.x} ${end.y}`;
}

function compactNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" })
    .format(value)
    .replace("K", "k")
    .replace("M", "m");
}

function nodeStatus(state: SwarmNodeState) {
  if (state === "active") return "active";
  if (state === "complete") return "success";
  if (state === "error") return "error";
  return "idle";
}

function orbTitle(running: boolean, topPicks: number) {
  if (running) return "Orchestrating";
  if (topPicks > 0) return "Top picks ready";
  return "Ready";
}

function founderInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function uniqueRows(rows: string[]) {
  return [...new Set(rows.map((row) => row.trim()).filter(Boolean))];
}

function founderContextRows(pick: TriageResult) {
  const repo = pick.githubContext?.topRepos?.[0];
  const repoStars = compactNumber(repo?.stars);
  const repoDelta = compactNumber(repo?.starDelta7d);
  const context = [
    pick.linkedinRoleTitle && pick.linkedinCompany && !pick.linkedinRoleTitle.includes(pick.linkedinCompany)
      ? `${pick.linkedinRoleTitle} at ${pick.linkedinCompany}`
      : pick.linkedinRoleTitle || pick.linkedinHeadline || pick.linkedinCompany || "",
    pick.linkedinLocation ? `Based in ${pick.linkedinLocation}` : "",
    repo?.repoLabel
      ? `${repo.repoLabel}${repoStars ? ` has ${repoStars} stars` : ""}${repoDelta ? `, +${repoDelta} in 7d` : ""}`
      : pick.githubContext?.builderSignal || "",
    pick.currentSeedFollowerCount ? `${pick.currentSeedFollowerCount} curated seed sources follow this profile` : "",
  ];
  return uniqueRows(context).slice(0, 3);
}

function FounderPick({ pick, expanded, onToggle }: { pick: TriageResult; expanded: boolean; onToggle: () => void }) {
  const audience = compactNumber(pick.xPublicFollowerCount);
  const evidence = (pick.evidence ?? []).filter(
    (item) => item.type !== "pitch_deck" && !item.label.toLowerCase().includes("proof-of-signal pitch deck"),
  );
  const contextRows = founderContextRows(pick);
  const avatarUrl = pick.avatarUrl || pick.xAvatarUrl;

  return (
    <article className={expanded ? "swarm-top-pick expanded" : "swarm-top-pick"}>
      <button className="pick-head" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="pick-rank">#{pick.rank}</span>
        <div className="pick-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : <span>{founderInitials(pick.displayName)}</span>}
        </div>
        <div className="pick-title">
          <strong>{pick.displayName}</strong>
          <small>{pick.xHandle || pick.linkedinCompany || "Founder candidate"}</small>
        </div>
        <span className="pick-expand-indicator">{expanded ? "Close" : "Details"}</span>
      </button>
      {expanded ? (
        <div className="pick-details">
          <p>{pick.overview || pick.whyNow}</p>
          <div className="pick-meta">
            <span>{pick.xHandle || "No X handle"}</span>
            <span>{pick.confidence}% confidence</span>
            {audience ? <span>{audience} audience</span> : null}
          </div>
          {evidence.length ? (
            <div className="pick-evidence">
              {evidence.slice(0, 2).map((item, index) => (
                <div key={`${item.type}-${index}`}>
                  <CheckCircle2 size={14} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="pick-context">
            <strong>Context</strong>
            {contextRows.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

async function sendTelegramTopPicks(picks: TriageResult[]) {
  const payload = {
    topPicks: picks.slice(0, 5).map((pick) => ({
      candidateId: pick.candidateId,
      rank: pick.rank,
      displayName: pick.displayName,
      xHandle: pick.xHandle,
      overview: pick.overview || pick.whyNow,
      confidence: pick.confidence,
      context: founderContextRows(pick),
    })),
  };

  const response = await fetch("/api/agent-swarm-telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
}

function initialExpandedPickId() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("pick");
}

export default function AgentSwarmPage() {
  const demoMode = isTraqrDemoMode();
  const [running, setRunning] = useState(false);
  const [activeNodes, setActiveNodes] = useState<SwarmNodeId[]>([]);
  const [expandedPickId, setExpandedPickId] = useState<string | null>(() => initialExpandedPickId());
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [infoPopup, setInfoPopup] = useState<string | null>(null);
  const [telegramMenuOpen, setTelegramMenuOpen] = useState(false);
  const [nodeStates, setNodeStates] = useState<Record<SwarmNodeId, SwarmNodeState>>(() =>
    demoMode ? completeNodeStates : initialNodeStates,
  );
  const [stepResults, setStepResults] = useState<SwarmStepResult[]>(() => (demoMode ? demoStepResults() : []));
  const [triagePayload, setTriagePayload] = useState<SwarmTriagePayload | null>(() => (demoMode ? demoTriagePayload() : null));

  const topPicks = useMemo(() => founderTopPicks(triagePayload), [triagePayload]);
  const completedCount = Object.values(nodeStates).filter((state) => state === "complete").length;
  const errorCount = Object.values(nodeStates).filter((state) => state === "error").length;
  const systemStatus = running ? "Agent Active" : topPicks.length ? "Complete" : "Idle";

  const runSwarm = async () => {
    if (running) return;
    setRunning(true);
    setActiveNodes([]);
    setNodeStates(initialNodeStates);
    setStepResults([]);
    setTriagePayload(null);

    const nextResults: SwarmStepResult[] = [];
    for (const step of SWARM_STEPS) {
      setActiveNodes([step.id]);
      setNodeStates((state) => ({ ...state, [step.id]: "active" }));
      if (demoMode) {
        await animateDemoStep(step.id, setActiveNodes);
      }
      const result = demoMode ? await postDemoSwarmStep(step) : await postSwarmStep(step);
      const stepResult = {
        id: step.id,
        ok: result.ok,
        status: result.status,
        error: result.error,
        summary: summarizeSwarmPayload(step.id, result.payload),
        payload: result.payload,
      };
      nextResults.push(stepResult);
      setStepResults([...nextResults]);
      setNodeStates((state) => ({ ...state, [step.id]: result.ok ? "complete" : "error" }));
      if (step.id === "featherless") {
        setTriagePayload(result.payload as SwarmTriagePayload);
      }
    }

    setActiveNodes([]);
    setRunning(false);
    if (demoMode) {
      const picks = founderTopPicks(nextResults.find((result) => result.id === "featherless")?.payload as SwarmTriagePayload);
      setInfoPopup("Sending top picks to Telegram...");
      const telegram = await sendTelegramTopPicks(picks);
      setInfoPopup(telegram.ok ? telegram.message || "Top picks sent to Telegram." : telegram.error || telegram.message || "Telegram bot needs an open chat first.");
      window.setTimeout(() => setInfoPopup(null), 4200);
    }
  };

  return (
    <main className={running ? "voice-swarm-page standby" : "voice-swarm-page"}>
      <div className="swarm-powered-by" aria-label="Powered by Featherless.ai and Google AI Studio">
        <span>powered by</span>
        <img src="https://www.google.com/s2/favicons?domain=featherless.ai&sz=64" alt="" loading="lazy" />
        <strong>featherless.ai</strong>
        <span>and</span>
        <img src="https://www.google.com/s2/favicons?domain=aistudio.google.com&sz=64" alt="" loading="lazy" />
        <strong>google ai studios</strong>
      </div>
      <div className={telegramMenuOpen ? "swarm-telegram-launcher open" : "swarm-telegram-launcher"}>
        <button
          className="swarm-telegram-button"
          type="button"
          aria-expanded={telegramMenuOpen}
          aria-haspopup="menu"
          aria-label="Open traqr Telegram bot options"
          title="Open Telegram bot"
          onClick={() => setTelegramMenuOpen((open) => !open)}
        >
          <span className="telegram-button-icon" aria-hidden="true">
            <img src="https://telegram.org/img/t_logo.svg" alt="" loading="lazy" />
          </span>
          <span>Open Telegram Bot</span>
        </button>
        {telegramMenuOpen ? (
          <div className="swarm-telegram-menu" role="menu">
            <a href={TELEGRAM_WEB_URL} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setTelegramMenuOpen(false)}>
              <Globe2 size={16} />
              <span>Telegram Web</span>
            </a>
            <a href={TELEGRAM_APP_URL} role="menuitem" onClick={() => setTelegramMenuOpen(false)}>
              <Smartphone size={16} />
              <span>Telegram App</span>
            </a>
          </div>
        ) : null}
      </div>
      {infoPopup ? (
        <div className="swarm-info-popup" role="status" aria-live="polite">
          <span>i</span>
          <p>{infoPopup}</p>
        </div>
      ) : null}
      <section className="swarm-layout">
        <div className="swarm-stage">
          <button
            className={running ? "standby-toggle active" : "standby-toggle"}
            onClick={runSwarm}
            disabled={running}
            title={running ? "Agent swarm running" : "Agent swarm starten"}
            type="button"
          >
            {running ? <Square size={16} /> : <Play size={16} />}
            <span>{running ? "Run" : "Play"}</span>
          </button>

          <svg className="swarm-lines" viewBox="0 0 100 100" aria-hidden="true">
            {SWARM_STEPS.map((step) => (
              <g className={activeNodes.includes(step.id) ? "active" : ""} key={step.id}>
                <path d={connectionPath(step.position)} />
                <circle className="packet packet-a" r="1.1">
                  <animateMotion dur="1.7s" repeatCount="indefinite" path={connectionPath(step.position)} />
                </circle>
                <circle className="packet packet-b" r="0.85">
                  <animateMotion
                    dur="1.7s"
                    begin="0.85s"
                    repeatCount="indefinite"
                    path={`M${lineEnd(step.position).x} ${lineEnd(step.position).y} Q50 ${
                      step.position === "manager" ? 32 : lineEnd(step.position).y > 50 ? 62 : 40
                    } 50 50`}
                  />
                </circle>
              </g>
            ))}
          </svg>

          <button
            className={`voice-orb-large ${running ? "orchestrating" : topPicks.length ? "standby" : "idle"}`}
            onClick={runSwarm}
            disabled={running}
            aria-label="Run agent swarm"
          >
            <div className="orb-ring" />
            <div className="orb-content">
              <img src="/traqr-favicon.svg" alt="" className="swarm-center-logo" />
              <span className="sr-only">{orbTitle(running, topPicks.length)}</span>
            </div>
          </button>

          {SWARM_STEPS.map((step) => {
            const state = nodeStates[step.id];
            const status = nodeStatus(state);
            return (
              <article
                className={`swarm-agent-card ${step.position} ${status} ${activeNodes.includes(step.id) ? "selected" : ""} ${step.brandClass}`}
                key={step.id}
              >
                <span className="swarm-agent-icon">
                  {step.logo ? <span className="brand-letters">{step.logo}</span> : <step.Icon className={step.iconClass || ""} size={28} strokeWidth={2.4} />}
                </span>
                <strong>{step.label}</strong>
                <small>{state === "active" ? "Fetching live data" : step.stepIdle}</small>
                <span className={`agent-status-flag ${status}`}>{status}</span>
              </article>
            );
          })}
        </div>

        <aside className="swarm-side">
          <section className="side-panel swarm-top-picks-panel">
            <div className="side-head">
              <h2>Top Picks</h2>
              <span>{systemStatus}</span>
            </div>
            <div className="source-drawer">
              <button className="source-drawer-toggle" type="button" onClick={() => setSourcesExpanded((value) => !value)} aria-expanded={sourcesExpanded}>
                <span>Sources</span>
                <strong>{sourcesExpanded ? "Hide" : "Show"}</strong>
              </button>
              {sourcesExpanded ? (
                <div className="source-drawer-body">
                  <p className="manager-context">
                    {running
                      ? `Running ${activeNodeLabel(activeNodes)}. Packets show live collection.`
                      : `${completedCount}/5 sources complete. ${errorCount} source alerts.`}
                  </p>
                  <div className="manager-task-list">
                    {SWARM_STEPS.map((step) => {
                      const result = stepResults.find((row) => row.id === step.id);
                      const state = nodeStates[step.id];
                      return (
                        <article className={state === "complete" ? "done" : state === "active" ? "running" : ""} key={step.id}>
                          <span>{state}</span>
                          <div>
                            <strong>{step.label}</strong>
                            <p>{result?.summary || (state === "active" ? "Fetching live evidence..." : step.role)}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {stepResults.some((result) => !result.ok) ? (
                    <div className="swarm-error">
                      <AlertTriangle size={14} />
                      {stepResults.find((result) => !result.ok)?.error || "A live source returned a configuration warning."}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="swarm-pick-list">
              {topPicks.length > 0 ? (
                topPicks.map((pick) => (
                  <FounderPick
                    key={pick.candidateId}
                    pick={pick}
                    expanded={expandedPickId === pick.candidateId}
                    onToggle={() => setExpandedPickId((current) => (current === pick.candidateId ? null : pick.candidateId))}
                  />
                ))
              ) : (
                <div className="swarm-empty-picks">
                  {triagePayload ? "No founder-grade profiles passed the Featherless filter." : "Run the swarm to show founder top picks here."}
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
