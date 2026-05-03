import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, ChevronRight, ExternalLink, Filter, Flame, Search, Users2 } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessState, useGraphData, usePersonIdentities } from "@/hooks/useAnytrace";
import type { ActivityPlatform, IdentityPlatform, PersonIdentity, TrackedPerson, VcSource } from "@/data/anytrace";
import { avatarSourcesForPerson, avatarSourcesForVc } from "@/lib/avatarSources";

type GraphNodeData =
  | { kind: "vc"; vc: VcSource; highlight: boolean; dim: boolean; imageUrls: string[] }
  | { kind: "person"; person: TrackedPerson; highlight: boolean; dim: boolean; topPick: boolean; imageUrls: string[] };

type GraphPosition = { x: number; y: number };

function getVcSizeBucket(sizeLabel?: string | null) {
  const normalized = (sizeLabel ?? "").toLowerCase();

  if (normalized.includes("mittel")) return "medium";
  if (normalized.includes("klein")) return "small";
  if (normalized.includes("gross") || normalized.includes("gro") || normalized.includes("large")) return "large";
  return "medium";
}

function getVcNodeSize(sizeLabel?: string | null) {
  const bucket = getVcSizeBucket(sizeLabel);

  if (bucket === "large") return 78;
  if (bucket === "small") return 34;
  return 56;
}

function identityFor(
  identities: PersonIdentity[],
  personId: string,
  platform: PersonIdentity["platform"],
) {
  return identities.find((identity) => identity.personId === personId && identity.platform === platform);
}

function VcNode({ data }: NodeProps<Node<GraphNodeData>>) {
  if (data.kind !== "vc") return null;
  const nodeSize = getVcNodeSize(data.vc.sizeLabel);

  return (
    <div className="relative">
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-foreground"
      />
      <div
        className={`cursor-pointer rounded-full bg-background ring-1 ring-border p-1.5 transition-all ${
          data.highlight ? "ring-2 ring-accent-indigo shadow-md scale-110" : ""
        } ${data.dim ? "opacity-30" : ""}`}
      >
        <EntityAvatar name={data.vc.name} imageUrls={data.imageUrls} size={nodeSize} />
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
        imageUrls={data.imageUrls}
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
  const largestVcSize = vcs.reduce((largest, vc) => Math.max(largest, getVcNodeSize(vc.sizeLabel)), 52);
  const vcRadius = Math.max(320, vcCount * 34 + largestVcSize * 1.8);

  vcs.forEach((vc, index) => {
    const angle = (index / vcCount) * Math.PI * 2 - Math.PI / 2;
    const sizeOffset = getVcNodeSize(vc.sizeLabel) - 52;
    positions.set(vc.id, {
      x: Math.cos(angle) * (vcRadius + sizeOffset),
      y: Math.sin(angle) * (vcRadius + sizeOffset),
    });
  });

  const incomingByPerson = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incomingByPerson.get(edge.targetId) ?? [];
    list.push(edge.sourceId);
    incomingByPerson.set(edge.targetId, list);
  }

  const personSourceIds = new Map<string, string[]>();
  for (const person of people) {
    personSourceIds.set(person.id, Array.from(new Set(incomingByPerson.get(person.id) ?? [])));
  }

  const corePeople = people.filter((person) => (personSourceIds.get(person.id)?.length ?? 0) > 1);
  const singleConnectionPeople = people.filter((person) => (personSourceIds.get(person.id)?.length ?? 0) === 1);
  const zeroConnectionPeople = people.filter((person) => (personSourceIds.get(person.id)?.length ?? 0) === 0);

  corePeople
    .sort((left, right) => {
      const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
      if (topDiff !== 0) return topDiff;
      return left.fullName.localeCompare(right.fullName);
    })
    .forEach((person, index) => {
      const sourceIds = personSourceIds.get(person.id) ?? [];
      const anchors = sourceIds
        .map((sourceId) => positions.get(sourceId))
        .filter((point): point is GraphPosition => !!point);
      const baseAngle =
        anchors.length > 0
          ? Math.atan2(
              anchors.reduce((sum, point) => sum + point.y, 0) / anchors.length,
              anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length,
            )
          : (index / Math.max(corePeople.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const innerRadius = topPickIds.has(person.id)
        ? Math.max(86, vcRadius * 0.31 + (index % 2) * 20)
        : Math.max(136, vcRadius * 0.48 + (index % 2) * 26);
      const angleOffset = ((index % 3) - 1) * 0.24;
      positions.set(person.id, {
        x: Math.cos(baseAngle + angleOffset) * innerRadius,
        y: Math.sin(baseAngle + angleOffset) * innerRadius,
      });
    });

  const singleBySource = new Map<string, TrackedPerson[]>();
  singleConnectionPeople.forEach((person) => {
    const sourceId = personSourceIds.get(person.id)?.[0];
    if (!sourceId) return;
    const list = singleBySource.get(sourceId) ?? [];
    list.push(person);
    singleBySource.set(sourceId, list);
  });

  singleBySource.forEach((sourcePeople, sourceId) => {
    const anchor = positions.get(sourceId);
    if (!anchor) return;

    const baseAngle = Math.atan2(anchor.y, anchor.x);
    sourcePeople
      .sort((left, right) => {
        const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
        if (topDiff !== 0) return topDiff;
        return left.fullName.localeCompare(right.fullName);
      })
      .forEach((person, index) => {
        const centeredIndex = index - (sourcePeople.length - 1) / 2;
        const angleOffset = centeredIndex * 0.2;
        const outerRadius = vcRadius + 205 + Math.abs(centeredIndex) * 24;
        positions.set(person.id, {
          x: Math.cos(baseAngle + angleOffset) * outerRadius,
          y: Math.sin(baseAngle + angleOffset) * outerRadius,
        });
      });
  });

  zeroConnectionPeople
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .forEach((person, index) => {
      const baseAngle = (index / Math.max(zeroConnectionPeople.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const outerRadius = vcRadius + 290 + Math.floor(index / Math.max(vcCount, 1)) * 96;
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
  const reactFlow = useReactFlow();
  const isMobile = useIsMobile();
  const { access } = useAccessState();
  const graphQuery = useGraphData(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const [query, setQuery] = useState("");
  const [showOnlyTop, setShowOnlyTop] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<"all" | IdentityPlatform>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, GraphPosition>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const graph = graphQuery.data;
  const identities = useMemo(() => identitiesQuery.data ?? [], [identitiesQuery.data]);
  const identitiesByPerson = useMemo(() => {
    const grouped = new Map<string, PersonIdentity[]>();
    for (const identity of identities) {
      const list = grouped.get(identity.personId) ?? [];
      list.push(identity);
      grouped.set(identity.personId, list);
    }
    return grouped;
  }, [identities]);
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
    const filteredEdges = graph.edges.filter((edge) => {
      if (!personIds.has(edge.targetId)) return false;
      if (platformFilter === "all") return true;
      return edge.platform === platformFilter;
    });
    const vcIds = new Set(filteredEdges.map((edge) => edge.sourceId));
    const activeNodeId = selectedNodeId;
    const visibleVcs = graph.vcs;
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
          dim: false,
          imageUrls: avatarSourcesForVc(vc),
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
          highlight: topPickIds.has(person.id),
          dim: false,
          topPick: topPickIds.has(person.id),
          imageUrls: avatarSourcesForPerson(person, identitiesByPerson.get(person.id) ?? []),
        },
      });
    });

    filteredEdges.forEach((edge) => {
      const siblingIndex = siblingOrderByEdgeId.get(edge.id) ?? 0;
      const siblingCount = siblingCountBySource.get(edge.sourceId) ?? 1;
      const isSelectedConnection = !!activeNodeId && (edge.sourceId === activeNodeId || edge.targetId === activeNodeId);
      const dimUnselectedEdges = !!activeNodeId && !isSelectedConnection;

      edges.push({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        type: "straight",
        animated: edge.isTopPick,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        zIndex: edge.isTopPick ? 2 : 1,
        style: {
          stroke: platformColor(edge.platform),
          strokeWidth: Math.min(4, Math.max(1.25, edge.eventCount * 1.3 + (siblingCount > 1 ? siblingIndex * 0.05 : 0))),
          opacity: dimUnselectedEdges ? 0.12 : edge.isTopPick ? 0.95 : 0.56,
        },
      });
    });

    return { nodes: [...vcNodes, ...personNodes], edges };
  }, [graph, identitiesByPerson, platformFilter, positionOverrides, query, selectedNodeId, showOnlyTop]);

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = built.nodes.find((entry) => entry.id === nodeId);
      if (!node) return;

      const size =
        node.data.kind === "vc"
          ? getVcNodeSize(node.data.vc.sizeLabel) + 12
          : node.data.topPick
            ? 64
            : 48;

      reactFlow.setCenter(node.position.x + size / 2, node.position.y + size / 2, {
        zoom: isMobile ? 0.68 : 0.82,
        duration: 500,
      });
    },
    [built.nodes, isMobile, reactFlow],
  );

  const overviewPeople = useMemo(() => {
    if (!graph) return [];
    const topPickIds = new Set(graph.weeklyPicks.map((pick) => pick.person.id));

    return [...graph.people].sort((left, right) => {
      const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
      if (topDiff !== 0) return topDiff;
      return left.fullName.localeCompare(right.fullName);
    });
  }, [graph]);

  const hasEdges = (graph?.edges.length ?? 0) > 0;
  const hasRenderableNodes = (graph?.vcs.length ?? 0) > 0 || (graph?.people.length ?? 0) > 0;
  const usingEventConnections = graph?.graphSource === "event";
  const graphIsPartial = usingEventConnections || (graph?.filteredConnectionCount ?? 0) > 0;

  return (
    <ProductGate
      title="Graph"
      description="Der Graph bleibt als UI erhalten, zeigt aber aktuell bewusst keine Verbindungen mehr."
    >
      <div className="relative h-[calc(100vh-7rem)] overflow-hidden bg-surface-sunken/40 sm:h-[calc(100vh-6.5rem)] md:h-[calc(100vh-4rem)]">
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-3 pointer-events-none md:top-4 md:left-4 md:right-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="pointer-events-auto flex w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm xl:max-w-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a person, company, or city"
              className="border-0 bg-transparent h-auto p-0 focus-visible:ring-0"
            />
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <Button
              variant={showOnlyTop ? "default" : "outline"}
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setShowOnlyTop((value) => !value)}
            >
              <Flame className="h-3.5 w-3.5" />
              Top picks
            </Button>
            <div className="flex w-full flex-wrap items-center gap-1 rounded-[20px] border border-border bg-background p-1 shadow-sm md:w-auto md:rounded-full">
              {([
                ["all", "All"],
                ["x", "X"],
                ["github", "GitHub"],
                ["linkedin", "LinkedIn"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  variant={platformFilter === value ? "default" : "ghost"}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setPlatformFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="hidden xl:flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {usingEventConnections ? "Event-derived connections" : "Snapshot-backed connections"}
            </div>
          </div>
        </div>

        {!graphQuery.isLoading && hasRenderableNodes && !isMobile && (
          <div
            className={`absolute left-3 top-16 bottom-3 z-10 pointer-events-auto transition-all duration-300 md:left-4 md:top-20 md:bottom-4 ${
              sidebarOpen ? "w-[320px]" : "w-12"
            }`}
          >
            <div className="flex h-full">
              <div
                className={`h-full overflow-hidden rounded-[28px] border border-border bg-background/95 shadow-xl backdrop-blur transition-all duration-300 ${
                  sidebarOpen ? "w-[272px] p-4" : "w-0 p-0 border-0"
                }`}
              >
                {sidebarOpen && (
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Users2 className="h-4 w-4" />
                          People overview
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Click a person to focus them in the graph.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 overflow-y-auto pr-1">
                      {overviewPeople.map((person) => {
                        const personIdentities = identitiesByPerson.get(person.id) ?? [];
                        const isSelected = selectedNodeId === person.id;

                        return (
                          <button
                            key={person.id}
                            type="button"
                            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                              isSelected ? "bg-surface-sunken ring-1 ring-border" : "hover:bg-surface-sunken/70"
                            }`}
                            onClick={() => {
                              setSelectedNodeId((current) => (current === person.id ? null : person.id));
                              if (selectedNodeId !== person.id) {
                                focusNode(person.id);
                              }
                            }}
                          >
                            <EntityAvatar
                              name={person.fullName}
                              imageUrls={avatarSourcesForPerson(person, personIdentities)}
                              size={36}
                              rounded="xl"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{person.fullName}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {person.company || person.roleTitle}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="ml-2 mt-3 h-10 w-10 shrink-0 rounded-full border border-border bg-background shadow-sm"
                onClick={() => setSidebarOpen((current) => !current)}
                aria-label={sidebarOpen ? "Collapse people sidebar" : "Expand people sidebar"}
              >
                {sidebarOpen ? <ChevronLeft className="mx-auto h-4 w-4" /> : <ChevronRight className="mx-auto h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {graphQuery.isLoading || identitiesQuery.isLoading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Skeleton className="h-56 w-80 rounded-[28px]" />
          </div>
        ) : graphQuery.isError ? (
          <EmptyGraphState
            title="Could not load the graph"
            body="The graph data is unavailable."
          />
        ) : !hasRenderableNodes ? (
          <EmptyGraphState
            title="Graph reset complete"
            body="Alle bisherigen Verbindungen, Snapshots und Fallback-Daten wurden entfernt. Der Graph wartet jetzt auf das neue Datenmodell."
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
              setSelectedNodeId((current) => {
                const next = current === node.id ? null : node.id;
                if (next) focusNode(node.id);
                return next;
              });
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

        {!graphQuery.isLoading && (
          <div className="absolute bottom-3 left-3 right-3 z-10 space-y-2 md:bottom-4 md:left-4 md:right-auto">
            <div className="rounded-2xl border border-border bg-background px-4 py-2 shadow-sm text-xs md:rounded-full">
              <div className="flex items-center gap-3">
                <span>{graph?.vcs.length ?? 0} visible VCs</span>
                <span>/</span>
                <span>{platformFilter === "all" ? "all connections" : `${platformFilter} only`}</span>
                <span>/</span>
                <span>{graph?.people.length ?? 0} connected people</span>
                <span>/</span>
                <span>{graph?.edges.length ?? 0} active edges</span>
              </div>
            </div>
            {!hasEdges && (
              <div className="max-w-md rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm">
                Es gibt aktuell keine Graph-Knoten oder Kanten.
              </div>
            )}
            {usingEventConnections && (
              <div className="max-w-md rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm">
                Snapshot observations are not populated for these edges yet, so the graph is temporarily bootstrapping from historical follow events.
              </div>
            )}
            {!usingEventConnections && (graph?.filteredConnectionCount ?? 0) > 0 && (
              <div className="max-w-md rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm">
                {graph?.filteredConnectionCount} snapshot connection{graph?.filteredConnectionCount === 1 ? "" : "s"} could not be matched to a visible VC or person yet and were filtered out.
              </div>
            )}
          </div>
        )}

        {!graphQuery.isLoading && (selectedPerson || selectedVc) && (
          <div className="absolute bottom-3 left-3 right-3 z-10 max-h-[42vh] overflow-y-auto rounded-[28px] border border-border bg-background p-5 shadow-xl md:bottom-4 md:left-auto md:right-4 md:w-[340px] md:max-w-[calc(100vw-2rem)]">
            {graphIsPartial && (
              <div className="mb-4 rounded-2xl bg-surface-sunken px-3 py-2 text-[11px] text-muted-foreground">
                {usingEventConnections
                  ? "This node is currently rendered from event-derived edges while snapshot observations are still catching up."
                  : "Some snapshot connections could not be matched to a visible VC or tracked person and were filtered out."}
              </div>
            )}
            {selectedPerson && (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <EntityAvatar
                      name={selectedPerson.fullName}
                      imageUrls={avatarSourcesForPerson(selectedPerson, selectedPersonIdentities)}
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
                  <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={() => setSelectedNodeId(null)}>
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
                      <div className="mt-1 text-[11px] text-muted-foreground">{event.eventType}</div>
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
                  <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={() => setSelectedNodeId(null)}>
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
                      onClick={() => {
                        setSelectedNodeId(person.id);
                        focusNode(person.id);
                      }}
                    >
                      <EntityAvatar
                        name={person.fullName}
                        imageUrls={avatarSourcesForPerson(
                          person,
                          identitiesByPerson.get(person.id) ?? [],
                        )}
                        size={34}
                        rounded="xl"
                      />
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
