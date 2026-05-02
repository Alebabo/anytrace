import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, ExternalLink, Github, Linkedin, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { TierBadge } from "@/components/converge/InvestorAvatar";
import { SignalIcon, platformLabel } from "@/components/converge/SignalIcon";
import { useAlerts, useFounders, useInvestors } from "@/hooks/useApi";
import { useOfflineFallback } from "@/hooks/useOfflineFallback";
import { formatRelative } from "@/lib/format";
import type {
  ConvergenceAlert,
  Founder,
  Investor,
  Signal,
  SignalPlatform,
} from "@/data/types";

/* ---------- Node renderers ---------- */

type CenterData = {
  kind: "center";
  name: string;
  githubUsername?: string;
  subtitle: string;
  rounded: "full" | "xl";
};
type PeerData = {
  kind: "peer";
  id: string;
  name: string;
  githubUsername?: string;
  subtitle: string;
  rounded: "full" | "xl";
  signalCount: number;
};

function CenterNode({ data }: NodeProps<Node<CenterData>>) {
  return (
    <div className="relative grid place-items-center">
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0" />
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />
      <div className="ring-4 ring-accent-indigo/40 rounded-2xl shadow-lg">
        <EntityAvatar
          githubUsername={data.githubUsername}
          name={data.name}
          size={88}
          rounded={data.rounded}
        />
      </div>
      <div className="absolute top-full mt-3 text-center w-48">
        <div className="font-serif text-base leading-tight">{data.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{data.subtitle}</div>
      </div>
    </div>
  );
}

function PeerNode({ data }: NodeProps<Node<PeerData>>) {
  const navigate = useNavigate();
  return (
    <div
      className="relative grid place-items-center cursor-pointer group"
      onClick={() => navigate(`/connections/${data.id}`)}
    >
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0" />
      <div className="ring-1 ring-border group-hover:ring-2 group-hover:ring-foreground/30 transition-all rounded-2xl">
        <EntityAvatar
          githubUsername={data.githubUsername}
          name={data.name}
          size={48}
          rounded={data.rounded}
        />
      </div>
      <div className="absolute top-full mt-2 text-center w-32">
        <div className="text-xs font-medium truncate">{data.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{data.subtitle}</div>
      </div>
    </div>
  );
}

const nodeTypes = { center: CenterNode, peer: PeerNode };

function platformEdgeColor(p: SignalPlatform) {
  const map: Record<SignalPlatform, string> = {
    twitter: "hsl(var(--foreground))",
    linkedin: "hsl(var(--signal-linkedin))",
    github: "hsl(var(--foreground))",
  };
  return map[p];
}

/* ---------- Page ---------- */

function ConnectionsInner() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const investorsQuery = useInvestors();
  const foundersQuery = useFounders();
  const alertsQuery = useAlerts();
  const offline = useOfflineFallback(alertsQuery);

  const investors = (offline.data?.investors ?? investorsQuery.data ?? []) as Investor[];
  const founders = (offline.data?.founders ?? foundersQuery.data ?? []) as Founder[];
  const alerts = (offline.data?.alerts ?? alertsQuery.data ?? []) as ConvergenceAlert[];

  const isLoading =
    (investorsQuery.isLoading || foundersQuery.isLoading || alertsQuery.isLoading) &&
    !offline.data;
  const isError =
    (investorsQuery.isError || foundersQuery.isError || alertsQuery.isError) &&
    !offline.data;

  const investor = useMemo(() => investors.find((i) => i.id === id), [investors, id]);
  const founder = useMemo(() => founders.find((f) => f.id === id), [founders, id]);
  const kind: "investor" | "founder" | null = investor ? "investor" : founder ? "founder" : null;

  // Collect signals touching this entity, grouped by the "other" side
  const { peers, signals, peerKind } = useMemo(() => {
    const sigs: Array<Signal & { _founderId: string }> = alerts.flatMap((a) =>
      a.signals.map((s) => ({ ...s, _founderId: a.founder.id })),
    );

    if (kind === "investor") {
      const mine = sigs.filter((s) => s.investorId === id);
      const peerIds = Array.from(new Set(mine.map((s) => s._founderId)));
      const ps = peerIds
        .map((pid) => founders.find((f) => f.id === pid))
        .filter((x): x is Founder => !!x);
      return { peers: ps, signals: mine, peerKind: "founder" as const };
    }
    if (kind === "founder") {
      const mine = sigs.filter((s) => s._founderId === id);
      const peerIds = Array.from(new Set(mine.map((s) => s.investorId)));
      const ps = peerIds
        .map((pid) => investors.find((i) => i.id === pid))
        .filter((x): x is Investor => !!x);
      return { peers: ps, signals: mine, peerKind: "investor" as const };
    }
    return { peers: [], signals: [], peerKind: "investor" as const };
  }, [alerts, founders, investors, id, kind]);

  // Build nodes/edges: center + ring of peers
  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = [];
    const es: Edge[] = [];
    if (!kind) return { nodes: ns, edges: es };

    const centerName = kind === "investor" ? investor!.name : founder!.name;
    const centerSubtitle =
      kind === "investor"
        ? investor!.firm ?? investor!.title
        : founder!.headline;
    const centerRounded: "full" | "xl" = kind === "investor" ? "full" : "xl";
    const centerGh = kind === "investor" ? investor!.githubUsername : founder!.githubUsername;

    ns.push({
      id: "__center__",
      type: "center",
      position: { x: 0, y: 0 },
      data: {
        kind: "center",
        name: centerName,
        githubUsername: centerGh,
        subtitle: centerSubtitle,
        rounded: centerRounded,
      } as CenterData,
      draggable: false,
      selectable: false,
    });

    const radius = Math.max(220, 80 + peers.length * 22);
    peers.forEach((p, i) => {
      const angle = (i / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const isInv = peerKind === "investor";
      const peerSignals = signals.filter((s) =>
        isInv ? s.investorId === p.id : s._founderId === p.id,
      );
      const subtitle = isInv
        ? (p as Investor).firm ?? (p as Investor).title
        : (p as Founder).company ?? (p as Founder).location;

      ns.push({
        id: p.id,
        type: "peer",
        position: { x, y },
        data: {
          kind: "peer",
          id: p.id,
          name: p.name,
          githubUsername: p.githubUsername,
          subtitle,
          rounded: isInv ? "full" : "xl",
          signalCount: peerSignals.length,
        } as PeerData,
        draggable: true,
      });

      // One edge per platform between center and this peer
      const byPlatform = new Map<SignalPlatform, number>();
      peerSignals.forEach((s) =>
        byPlatform.set(s.platform, (byPlatform.get(s.platform) ?? 0) + 1),
      );
      Array.from(byPlatform.entries()).forEach(([platform, count]) => {
        es.push({
          id: `${p.id}-${platform}`,
          source: kind === "investor" ? "__center__" : p.id,
          target: kind === "investor" ? p.id : "__center__",
          type: "straight",
          animated: true,
          style: {
            stroke: platformEdgeColor(platform),
            strokeWidth: Math.max(1, Math.min(4, count * 1.4)),
            opacity: 0.55,
          },
        });
      });
    });

    return { nodes: ns, edges: es };
  }, [kind, investor, founder, peers, signals, peerKind]);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] bg-surface-sunken/40 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-[320px] shrink-0 bg-background border-b md:border-b-0 md:border-r border-border p-5 overflow-y-auto">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 gap-1.5 text-muted-foreground"
          onClick={() => navigate("/explore")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to graph
        </Button>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : isError ? (
          <div className="text-sm text-muted-foreground">
            Couldn't load this contact.
          </div>
        ) : !kind ? (
          <div className="text-sm text-muted-foreground">
            Contact not found.
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <EntityAvatar
                githubUsername={
                  kind === "investor" ? investor!.githubUsername : founder!.githubUsername
                }
                name={kind === "investor" ? investor!.name : founder!.name}
                size={56}
                rounded={kind === "investor" ? "full" : "xl"}
              />
              <div className="min-w-0">
                <h1 className="font-serif text-2xl leading-tight">
                  {kind === "investor" ? investor!.name : founder!.name}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {kind === "investor"
                    ? `${investor!.title}${investor!.firm ? ` · ${investor!.firm}` : ""}`
                    : founder!.location}
                </p>
                {kind === "investor" && (
                  <div className="mt-2">
                    <TierBadge tier={investor!.tier} />
                  </div>
                )}
              </div>
            </div>

            {kind === "founder" && founder!.headline && (
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                {founder!.headline}
              </p>
            )}

            {/* Social links */}
            <div className="flex items-center gap-3 mt-4">
              {(kind === "investor" ? investor!.linkedinUrl : founder!.linkedinUrl) && (
                <a
                  href={kind === "investor" ? investor!.linkedinUrl : founder!.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-signal-linkedin"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {(kind === "investor" ? investor!.twitterHandle : founder!.twitterHandle) && (
                <a
                  href={`https://x.com/${
                    kind === "investor" ? investor!.twitterHandle : founder!.twitterHandle
                  }`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-signal-twitter"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {(kind === "investor"
                ? investor!.githubUsername
                : founder!.githubUsername) && (
                <a
                  href={`https://github.com/${
                    kind === "investor"
                      ? investor!.githubUsername
                      : founder!.githubUsername
                  }`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-signal-github"
                >
                  <Github className="h-4 w-4" />
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="rounded-2xl bg-surface-sunken p-3">
                <div className="font-serif text-2xl tabular-nums leading-none">
                  {peers.length}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {peerKind === "investor" ? "Investors connected" : "Founders touched"}
                </div>
              </div>
              <div className="rounded-2xl bg-surface-sunken p-3">
                <div className="font-serif text-2xl tabular-nums leading-none">
                  {signals.length}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Signals</div>
              </div>
            </div>

            <h4 className="text-xs font-medium text-muted-foreground mt-6 mb-2">
              Recent signals
            </h4>
            <ul className="space-y-2">
              {signals
                .slice()
                .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
                .slice(0, 8)
                .map((s) => {
                  const peer =
                    peerKind === "investor"
                      ? investors.find((i) => i.id === s.investorId)
                      : founders.find((f) => f.id === s._founderId);
                  return (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      <SignalIcon platform={s.platform} className="h-3 w-3 shrink-0" />
                      <span className="text-muted-foreground truncate flex-1">
                        {s.action}{" "}
                        <span className="text-foreground">{peer?.name ?? "—"}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {formatRelative(s.occurredAt)}
                      </span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-indigo hover:underline shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  );
                })}
              {signals.length === 0 && (
                <li className="text-xs text-muted-foreground">No signals yet.</li>
              )}
            </ul>

            {kind === "founder" && (
              <Button
                className="w-full mt-6"
                asChild
              >
                <Link to={`/founder/${founder!.id}`}>
                  Open dossier <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            )}
          </>
        )}
      </aside>

      {/* Graph */}
      <div className="relative flex-1 min-w-0">
        <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10 bg-background border border-border rounded-full shadow-sm px-3 py-1.5 text-[11px] text-muted-foreground">
          {peers.length} direct {peerKind === "investor" ? "investor" : "founder"} connection
          {peers.length === 1 ? "" : "s"}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          panOnDrag
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="hsl(var(--border))"
          />
          <Controls
            showInteractive={false}
            className="!bg-background !border !border-border !rounded-full !shadow-sm overflow-hidden !hidden md:!flex"
          />
        </ReactFlow>

        {!isLoading && !isError && kind && peers.length === 0 && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <p className="text-sm text-muted-foreground bg-background/80 px-4 py-2 rounded-full border border-border">
              No connections recorded yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Connections() {
  return (
    <ReactFlowProvider>
      <ConnectionsInner />
    </ReactFlowProvider>
  );
}
