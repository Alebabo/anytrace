import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ExternalLink, Filter, Flame, Search } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useGraphData, usePersonIdentities } from "@/hooks/useAnytrace";
import type { ActivityPlatform, PersonIdentity, TrackedPerson, VcSource } from "@/data/anytrace";

type GraphNodeData =
  | { kind: "vc"; vc: VcSource; highlight: boolean; dim: boolean }
  | { kind: "person"; person: TrackedPerson; githubUsername?: string; highlight: boolean; dim: boolean; topPick: boolean };

type GraphPosition = { x: number; y: number };

function identityFor(
  identities: PersonIdentity[],
  personId: string,
  platform: PersonIdentity["platform"],
) {
  return identities.find((identity) => identity.personId === personId && identity.platform === platform);
}

function VcNode({ data }: NodeProps<Node<GraphNodeData>>) {
  if (data.kind !== "vc") return null;
  return (
    <div className="relative">
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-foreground"
      />
      <div
        className={`cursor-pointer rounded-full bg-background ring-1 ring-border p-1 transition-all ${
          data.highlight ? "ring-2 ring-accent-indigo shadow-md scale-110" : ""
        } ${data.dim ? "opacity-30" : ""}`}
      >
        <EntityAvatar name={data.vc.name} githubUsername={data.vc.githubUsername ?? undefined} size={48} />
      </div>
    </div>
  );
}

function PersonNode({ data }: NodeProps<Node<GraphNodeData>>) {
  if (data.kind !== "person") return null;
  return (
    <div
      className={`relative cursor-pointer rounded-2xl transition-all ${
        data.topPick ? "ring-4 ring-destructive/30 shadow-lg" : "ring-1 ring-border"
      } ${data.highlight ? "scale-110" : ""} ${data.dim ? "opacity-30" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />
      <EntityAvatar
        name={data.person.fullName}
        githubUsername={data.githubUsername}
        size={data.topPick ? 64 : 48}
        rounded="xl"
      />
      {data.topPick && (
        <span className="absolute -top-2 -right-2 rounded-full bg-destructive px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-destructive-foreground">
          Top
        </span>
      )}
    </div>
  );
}

const nodeTypes = {
  vc: VcNode,
  person: PersonNode,
};

function platformColor(platform: ActivityPlatform) {
  if (platform === "linkedin") return "hsl(var(--signal-linkedin))";
  return "hsl(var(--foreground))";
}

function EmptyGraphState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="max-w-lg rounded-[28px] border border-border bg-card p-8 text-center shadow-sm">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function buildGraphLayout({
  vcs,
  people,
  edges,
  topPickIds,
}: {
  vcs: VcSource[];
  people: TrackedPerson[];
  edges: { sourceId: string; targetId: string }[];
  topPickIds: Set<string>;
}) {
  const positions = new Map<string, GraphPosition>();
  const vcCount = Math.max(vcs.length, 1);
  const vcRadius = Math.max(220, vcCount * 22);

  vcs.forEach((vc, index) => {
    const angle = (index / vcCount) * Math.PI * 2 - Math.PI / 2;
    positions.set(vc.id, {
      x: Math.cos(angle) * vcRadius,
      y: Math.sin(angle) * vcRadius,
    });
  });

  const incomingByPerson = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incomingByPerson.get(edge.targetId) ?? [];
    list.push(edge.sourceId);
    incomingByPerson.set(edge.targetId, list);
  }

  const topPickPeople = people.filter((person) => topPickIds.has(person.id));
  const outerPeople = people.filter((person) => !topPickIds.has(person.id));

  topPickPeople
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .forEach((person, index) => {
      const sourceIds = Array.from(new Set(incomingByPerson.get(person.id) ?? []));
      const anchors = sourceIds
        .map((sourceId) => positions.get(sourceId))
        .filter((point): point is GraphPosition => !!point);
      const baseAngle =
        anchors.length > 0
          ? Math.atan2(
              anchors.reduce((sum, point) => sum + point.y, 0) / anchors.length,
              anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length,
            )
          : (index / Math.max(topPickPeople.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const innerRadius = Math.max(70, vcRadius * 0.46 + (index % 2) * 26);
      const angleOffset = ((index % 3) - 1) * 0.28;
      positions.set(person.id, {
        x: Math.cos(baseAngle + angleOffset) * innerRadius,
        y: Math.sin(baseAngle + angleOffset) * innerRadius,
      });
    });

  outerPeople
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .forEach((person, index) => {
      const sourceIds = Array.from(new Set(incomingByPerson.get(person.id) ?? []));
      const anchors = sourceIds
        .map((sourceId) => positions.get(sourceId))
        .filter((point): point is GraphPosition => !!point);
      const baseAngle =
        anchors.length > 0
          ? Math.atan2(
              anchors.reduce((sum, point) => sum + point.y, 0) / anchors.length,
              anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length,
            )
          : (index / Math.max(outerPeople.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const outerRadius = vcRadius + 165 + Math.floor(index / Math.max(vcCount, 1)) * 90;
      const angleOffset = ((index % 4) - 1.5) * 0.18;
      positions.set(person.id, {
        x: Math.cos(baseAngle + angleOffset) * outerRadius,
        y: Math.sin(baseAngle + angleOffset) * outerRadius,
      });
    });

  for (const person of people) {
    if (!positions.has(person.id)) {
      positions.set(person.id, { x: 0, y: 360 });
    }
  }

  return positions;
}

function GraphInner() {
  const navigate = useNavigate();
  const { access } = useAccessState();
  const [viewMode, setViewMode] = useState<"selected" | "all">("selected");
  const graphQuery = useGraphData(access.isAuthenticated, viewMode);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const [query, setQuery] = useState("");
  const [showOnlyTop, setShowOnlyTop] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, GraphPosition>>({});

  const graph = graphQuery.data;
  const identities = identitiesQuery.data ?? [];
  const selectedPerson = graph?.people.find((person) => person.id === selectedNodeId) ?? null;
  const selectedVc = graph?.vcs.find((vc) => vc.id === selectedNodeId) ?? null;
  const selectedPersonIdentities = selectedPerson
    ? identities.filter((identity) => identity.personId === selectedPerson.id)
    : [];
  const selectedPersonEvents = selectedPerson
    ? (graph?.events ?? []).filter((event) => event.personId === selectedPerson.id).slice(0, 4)
    : [];
  const selectedVcConnections = selectedVc
    ? (graph?.edges ?? [])
        .filter((edge) => edge.sourceId === selectedVc.id)
        .map((edge) => graph?.people.find((person) => person.id === edge.targetId))
        .filter((person): person is TrackedPerson => !!person)
    : [];

  useEffect(() => {
    if (!graph) {
      setPositionOverrides({});
      return;
    }

    setPositionOverrides((current) => {
      const validIds = new Set([...graph.vcs.map((vc) => vc.id), ...graph.people.map((person) => person.id)]);
      const next = Object.fromEntries(
        Object.entries(current).filter(([nodeId]) => validIds.has(nodeId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [graph]);

  const built = useMemo(() => {
    if (!graph) return { nodes: [] as Node<GraphNodeData>[], edges: [] as Edge[] };

    const search = query.trim().toLowerCase();
    const topPickIds = new Set(graph.weeklyPicks.map((pick) => pick.person.id));
    const vcNodes: Node<GraphNodeData>[] = [];
    const personNodes: Node<GraphNodeData>[] = [];
    const edges: Edge[] = [];
    const filteredPeople = graph.people.filter((person) => {
      if (showOnlyTop && !topPickIds.has(person.id)) return false;
      if (!search) return true;
      return [person.fullName, person.company, person.location].join(" ").toLowerCase().includes(search);
    });
    const personIds = new Set(filteredPeople.map((person) => person.id));
    const filteredEdges = graph.edges.filter((edge) => personIds.has(edge.targetId));
    const vcIds = new Set(filteredEdges.map((edge) => edge.sourceId));
    const activeNodeId = selectedNodeId;
    const visibleVcs = graph.vcs.filter((vc) => vcIds.has(vc.id) || !filteredEdges.length);
    const siblingOrderByEdgeId = new Map<string, number>();
    const siblingCountBySource = new Map<string, number>();
    const edgesBySource = new Map<string, typeof filteredEdges>();

    filteredEdges.forEach((edge) => {
      const list = edgesBySource.get(edge.sourceId) ?? [];
      list.push(edge);
      edgesBySource.set(edge.sourceId, list);
    });

    edgesBySource.forEach((sourceEdges, sourceId) => {
      const sorted = [...sourceEdges].sort((left, right) => {
        const leftY = positionOverrides[left.targetId]?.y ?? 0;
        const rightY = positionOverrides[right.targetId]?.y ?? 0;
        if (leftY !== rightY) return leftY - rightY;
        return left.targetId.localeCompare(right.targetId);
      });

      siblingCountBySource.set(sourceId, sorted.length);
      sorted.forEach((edge, index) => {
        siblingOrderByEdgeId.set(edge.id, index);
      });
    });

    const layoutPositions = buildGraphLayout({
      vcs: visibleVcs,
      people: filteredPeople,
      edges: filteredEdges,
      topPickIds,
    });

    visibleVcs.forEach((vc) => {
      const position = positionOverrides[vc.id] ?? layoutPositions.get(vc.id) ?? { x: 0, y: -220 };
      vcNodes.push({
        id: vc.id,
        type: "vc",
        position,
        draggable: true,
        data: {
          kind: "vc",
          vc,
          highlight: vcIds.has(vc.id),
          dim: !vcIds.has(vc.id) && personIds.size > 0,
        },
      });
    });

    filteredPeople.forEach((person) => {
      const position =
        positionOverrides[person.id] ??
        layoutPositions.get(person.id) ??
        { x: 0, y: topPickIds.has(person.id) ? 240 : 320 };
      personNodes.push({
        id: person.id,
        type: "person",
        position,
        draggable: true,
        data: {
          kind: "person",
          person,
          githubUsername: identityFor(identities, person.id, "github")?.handle,
          highlight: topPickIds.has(person.id),
          dim: false,
          topPick: topPickIds.has(person.id),
        },
      });
    });

    filteredEdges.forEach((edge) => {
      const siblingIndex = siblingOrderByEdgeId.get(edge.id) ?? 0;
      const siblingCount = siblingCountBySource.get(edge.sourceId) ?? 1;
      const centeredIndex = siblingIndex - (siblingCount - 1) / 2;
      const isOuterConnection = !topPickIds.has(edge.targetId);
      const isSelectedConnection = !!activeNodeId && (edge.sourceId === activeNodeId || edge.targetId === activeNodeId);
      const dimUnselectedEdges = !!activeNodeId && !isSelectedConnection;

      edges.push({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        type: "smoothstep",
        animated: edge.isTopPick,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        pathOptions: {
          borderRadius: edge.isTopPick ? 26 : 18,
          offset: isOuterConnection ? 34 + Math.abs(centeredIndex) * 10 : 24 + Math.abs(centeredIndex) * 8,
        },
        zIndex: edge.isTopPick ? 2 : 1,
        style: {
          stroke: platformColor(edge.platform),
          strokeWidth: Math.min(4, Math.max(1.25, edge.eventCount * 1.3)),
          opacity: dimUnselectedEdges ? 0.12 : edge.isTopPick ? 0.95 : 0.56,
        },
      });
    });

    return { nodes: [...vcNodes, ...personNodes], edges };
  }, [graph, identities, positionOverrides, query, selectedNodeId, showOnlyTop]);

  const hasSelectedVcs = graph?.hasSelectedVcs ?? false;
  const requiresSelection = viewMode === "selected";
  const hasEdges = (graph?.edges.length ?? 0) > 0;
  const showingFallback = graph?.graphSource === "fallback";
  const graphIsPartial = showingFallback || (graph?.orphanedEventCount ?? 0) > 0;

  return (
    <ProductGate
      title="Graph"
      description="The Anytrace graph is now scoped to your selected VCs and only shows people with actual signal edges from those sources."
    >
      <div className="relative h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] bg-surface-sunken/40">
        <div className="absolute top-3 left-3 right-3 md:top-4 md:left-4 md:right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm w-full max-w-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a person, company, or city"
              className="border-0 bg-transparent h-auto p-0 focus-visible:ring-0"
            />
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              variant={showOnlyTop ? "default" : "outline"}
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setShowOnlyTop((value) => !value)}
            >
              <Flame className="h-3.5 w-3.5" />
              Top picks
            </Button>
            <Button
              variant={viewMode === "selected" ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setViewMode("selected")}
            >
              Selected VCs
            </Button>
            <Button
              variant={viewMode === "all" ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setViewMode("all")}
            >
              All VCs
            </Button>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {showingFallback
                ? "Fallback signal view"
                : viewMode === "all"
                  ? "All VC sources"
                  : "Selected VCs only"}
            </div>
          </div>
        </div>

        {graphQuery.isLoading || identitiesQuery.isLoading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Skeleton className="h-56 w-80 rounded-[28px]" />
          </div>
        ) : graphQuery.isError ? (
          <EmptyGraphState
            title="Could not load the graph"
            body="The graph data could not be loaded from Supabase right now."
          />
        ) : requiresSelection && !hasSelectedVcs ? (
          <EmptyGraphState
            title="No VCs selected yet"
            body="Add a few venture accounts in Watchlist first. The graph only renders edges from your personal VC selection."
          />
        ) : !hasEdges ? (
          <EmptyGraphState
            title="No signal edges yet"
            body="Your selected VCs are saved, but there are no imported X follow events for them yet. Once sync jobs start writing activity events, the graph will light up automatically."
          />
        ) : (
          <ReactFlow
            nodes={built.nodes}
            edges={built.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.35}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
            }}
            onNodeDragStop={(_, node) => {
              setPositionOverrides((current) => ({
                ...current,
                [node.id]: node.position,
              }));
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--border))" />
            <Controls
              showInteractive={false}
              className="!bg-background !border !border-border !rounded-full !shadow-sm overflow-hidden !hidden md:!flex"
            />
          </ReactFlow>
        )}

        {!graphQuery.isLoading && (!requiresSelection || hasSelectedVcs) && (
          <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4 z-10 space-y-2">
            <div className="rounded-full border border-border bg-background px-4 py-2 shadow-sm text-xs">
              <div className="flex items-center gap-3">
                <span>
                  {graph?.vcs.length ?? 0} {viewMode === "all" ? "visible VCs" : "selected VCs"}
                </span>
                <span>/</span>
                <span>{viewMode === "all" ? "all mode" : "selected mode"}</span>
                <span>/</span>
                <span>{graph?.people.length ?? 0} connected people</span>
                <span>/</span>
                <span>{graph?.edges.length ?? 0} active edges</span>
              </div>
            </div>
            {showingFallback && (
              <div className="max-w-md rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm">
                No direct edges were found for your current watchlist, so Anytrace is temporarily showing valid legacy VC-follow connections while the live VC mapping catches up.
              </div>
            )}
            {!showingFallback && (graph?.orphanedEventCount ?? 0) > 0 && (
              <div className="max-w-md rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm">
                {graph?.orphanedEventCount} event{graph?.orphanedEventCount === 1 ? "" : "s"} still point to deleted VC rows and were filtered out of the graph.
              </div>
            )}
          </div>
        )}

        {!graphQuery.isLoading && (selectedPerson || selectedVc) && (
          <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4 z-10 w-[340px] max-w-[calc(100vw-1.5rem)] rounded-[28px] border border-border bg-background p-5 shadow-xl">
            {graphIsPartial && (
              <div className="mb-4 rounded-2xl bg-surface-sunken px-3 py-2 text-[11px] text-muted-foreground">
                {showingFallback
                  ? "This node is rendered from fallback graph data while live watchlist edges are being repaired."
                  : "This node is partially backed by live data. Some orphaned VC events were filtered out."}
              </div>
            )}
            {selectedPerson && (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <EntityAvatar
                      name={selectedPerson.fullName}
                      githubUsername={identityFor(identities, selectedPerson.id, "github")?.handle}
                      size={44}
                      rounded="xl"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{selectedPerson.fullName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedPerson.roleTitle}
                        {selectedPerson.company ? ` / ${selectedPerson.company}` : ""}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectedNodeId(null)}>
                    Close
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{selectedPerson.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {selectedPersonIdentities.map((identity) => (
                    <a key={identity.id} href={identity.profileUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                      {identity.platform}
                    </a>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {selectedPersonEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl bg-surface-sunken px-3 py-2">
                      <div className="text-xs font-medium">{event.headline}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {event.eventType}
                        {event.vcSourceId &&
                        graph?.edges.some(
                          (edge) =>
                            edge.sourceId === event.vcSourceId &&
                            edge.targetId === selectedPerson.id &&
                            edge.graphSource === "fallback",
                        )
                          ? " / fallback edge"
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full gap-1.5"
                  onClick={() => navigate(`/connections/${selectedPerson.id}`)}
                >
                  Open full profile <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {selectedVc && !selectedPerson && (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{selectedVc.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedVc.country}
                      {selectedVc.sizeLabel ? ` / ${selectedVc.sizeLabel}` : ""}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectedNodeId(null)}>
                    Close
                  </Button>
                </div>
                {selectedVc.sectorFocus && (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{selectedVc.sectorFocus}</p>
                )}
                <div className="mt-4 text-xs text-muted-foreground">
                  {selectedVcConnections.length} connected people
                  {selectedVc.twitterUrl ? " / X tracked" : ""}
                </div>
                <div className="mt-3 space-y-2">
                  {selectedVcConnections.slice(0, 4).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-2xl bg-surface-sunken px-3 py-2 text-left hover:bg-surface-sunken/80"
                      onClick={() => setSelectedNodeId(person.id)}
                    >
                      <EntityAvatar name={person.fullName} size={34} rounded="xl" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{person.fullName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{person.company || person.roleTitle}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ProductGate>
  );
}

export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
