import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Flame, Info, RefreshCw, RotateCcw, Search, SlidersHorizontal, Users2, X } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { ActivityLine } from "@/components/anytrace/ActivityLine";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessState, useGraphData, usePersonIdentities, useRefreshAnytraceData } from "@/hooks/useAnytrace";
import type { ActivityPlatform, GraphEdge, PersonIdentity, TrackedPerson, VcSource } from "@/data/anytrace";
import { avatarSourcesForPerson, avatarSourcesForVc } from "@/lib/avatarSources";
import { personDisplayLabel } from "@/lib/personLabels";

type GraphNodeData =
  | { kind: "vc"; vc: VcSource; highlight: boolean; dim: boolean; imageUrls: string[] }
  | { kind: "person"; person: TrackedPerson; highlight: boolean; dim: boolean; topPick: boolean; imageUrls: string[] };

type GraphPosition = { x: number; y: number };
type StaticFocusNode = {
  id: string;
  label: string;
  sublabel: string;
  imageUrls: string[];
  kind: "vc" | "person";
  rounded?: "full" | "xl";
};

function getVcSizeBucket(sizeLabel?: string | null) {
  const normalized = (sizeLabel ?? "").toLowerCase();

  if (normalized.includes("mittel")) return "medium";
  if (normalized.includes("klein")) return "small";
  if (normalized.includes("gross") || normalized.includes("gro") || normalized.includes("large")) return "large";
  return "medium";
}

function getVcNodeSize(sizeLabel?: string | null) {
  const bucket = getVcSizeBucket(sizeLabel);

  if (bucket === "large") return 124;
  if (bucket === "small") return 64;
  return 92;
}

function getPersonNodeSize(topPick: boolean) {
  return topPick ? 80 : 58;
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
    <div className="relative z-20 pointer-events-auto">
      <Handle
        id="source-center"
        type="source"
        position={Position.Top}
        className="!left-1/2 !top-1/2 !h-1 !w-1 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
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
      className={`relative z-20 cursor-pointer rounded-2xl pointer-events-auto transition-all ${
        data.topPick ? "ring-4 ring-destructive/30 shadow-lg" : "ring-1 ring-border"
      } ${data.highlight ? "scale-110" : ""} ${data.dim ? "opacity-30" : ""}`}
    >
      <Handle
        id="source-center"
        type="source"
        position={Position.Top}
        className="!left-1/2 !top-1/2 !h-1 !w-1 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
      />
      <Handle
        id="target-center"
        type="target"
        position={Position.Top}
        className="!left-1/2 !top-1/2 !h-1 !w-1 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
      />
      <EntityAvatar
        name={data.person.fullName}
        imageUrls={data.imageUrls}
        size={getPersonNodeSize(data.topPick)}
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

const GRAPH_FILTER_PREFS_KEY = "anytrace-graph-filter-prefs";
const DEFAULT_GRAPH_PERSON_LIMIT = 40;
const DEFAULT_EDGES_PER_PERSON = 2;

type GraphPlatformFilter = "all" | "x" | "linkedin";

function edgeTimeValue(edge: Pick<GraphEdge, "firstObservedAt">) {
  const time = new Date(edge.firstObservedAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function platformColor(platform: ActivityPlatform) {
  if (platform === "linkedin") return "hsl(var(--signal-linkedin))";
  return "hsl(var(--foreground))";
}

function personConnectionLabel(person: TrackedPerson) {
  return personDisplayLabel(person);
}

function isManualLocalPerson(person: TrackedPerson) {
  return person.id.startsWith("local-person");
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
  const vcIds = new Set(vcs.map((vc) => vc.id));

  vcs.forEach((vc, index) => {
    const angle = (index / vcCount) * Math.PI * 2 - Math.PI / 2;
    const sizeOffset = getVcNodeSize(vc.sizeLabel) - 52;
    positions.set(vc.id, {
      x: Math.cos(angle) * (vcRadius + sizeOffset),
      y: Math.sin(angle) * (vcRadius + sizeOffset),
    });
  });

  const neighborsByPerson = new Map<string, string[]>();
  for (const edge of edges) {
    if (!vcIds.has(edge.sourceId)) {
      const sourceNeighbors = neighborsByPerson.get(edge.sourceId) ?? [];
      sourceNeighbors.push(edge.targetId);
      neighborsByPerson.set(edge.sourceId, sourceNeighbors);
    }
    if (!vcIds.has(edge.targetId)) {
      const targetNeighbors = neighborsByPerson.get(edge.targetId) ?? [];
      targetNeighbors.push(edge.sourceId);
      neighborsByPerson.set(edge.targetId, targetNeighbors);
    }
  }

  const personNeighborIds = new Map<string, string[]>();
  for (const person of people) {
    personNeighborIds.set(person.id, Array.from(new Set(neighborsByPerson.get(person.id) ?? [])));
  }

  const corePeople = people.filter((person) => (personNeighborIds.get(person.id)?.length ?? 0) > 1);
  const singleConnectionPeople = people.filter((person) => (personNeighborIds.get(person.id)?.length ?? 0) === 1);
  const zeroConnectionPeople = people.filter((person) => (personNeighborIds.get(person.id)?.length ?? 0) === 0);

  corePeople
    .sort((left, right) => {
      const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
      if (topDiff !== 0) return topDiff;
      return left.fullName.localeCompare(right.fullName);
    })
    .forEach((person, index) => {
      const neighborIds = personNeighborIds.get(person.id) ?? [];
      const anchors = neighborIds
        .map((neighborId) => positions.get(neighborId))
        .filter((point): point is GraphPosition => !!point);
      const connectionWeight = neighborIds.length;
      const baseAngle =
        anchors.length > 0
          ? Math.atan2(
              anchors.reduce((sum, point) => sum + point.y, 0) / anchors.length,
              anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length,
            )
          : (index / Math.max(corePeople.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const normalizedIndex = index / Math.max(corePeople.length - 1, 1);
      const minRadius = topPickIds.has(person.id) ? vcRadius * 0.18 : vcRadius * 0.24;
      const maxRadius = topPickIds.has(person.id) ? vcRadius * 0.52 : vcRadius * 0.72;
      const radialBand = minRadius + (maxRadius - minRadius) * Math.sqrt(normalizedIndex);
      const densityOffset = (index % 4) * 22 - 28;
      const connectionPull = Math.min(42, connectionWeight * 10);
      const innerRadius = Math.max(94, radialBand + densityOffset - connectionPull);
      const spiralOffset = ((index * 137.5) % 360) * (Math.PI / 180);
      const angleOffset = Math.sin(spiralOffset) * 0.34 + (((index % 5) - 2) * 0.07);
      positions.set(person.id, {
        x: Math.cos(baseAngle + angleOffset) * innerRadius,
        y: Math.sin(baseAngle + angleOffset) * innerRadius,
      });
    });

  const singleByAnchor = new Map<string, TrackedPerson[]>();
  singleConnectionPeople.forEach((person) => {
    const anchorId = personNeighborIds.get(person.id)?.[0];
    if (!anchorId) return;
    const list = singleByAnchor.get(anchorId) ?? [];
    list.push(person);
    singleByAnchor.set(anchorId, list);
  });

  const unresolvedSingles = new Map(singleByAnchor);
  for (let pass = 0; pass < Math.max(singleConnectionPeople.length, 1) && unresolvedSingles.size > 0; pass += 1) {
    let placedInPass = false;
    for (const [anchorId, anchorPeople] of [...unresolvedSingles.entries()]) {
      const anchor = positions.get(anchorId);
      if (!anchor) continue;

      const baseAngle = Math.atan2(anchor.y, anchor.x);
      const anchorRadius = Math.hypot(anchor.x, anchor.y);
      const anchorIsVc = vcIds.has(anchorId);
      const baseOuterRadius = Math.max(vcRadius + 190, anchorRadius + (anchorIsVc ? 205 : 120));

      anchorPeople
        .sort((left, right) => {
          const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
          if (topDiff !== 0) return topDiff;
          return left.fullName.localeCompare(right.fullName);
        })
        .forEach((person, index) => {
          const centeredIndex = index - (anchorPeople.length - 1) / 2;
          const angleOffset = centeredIndex * 0.2;
          const outerRadius = baseOuterRadius + Math.abs(centeredIndex) * 24;
          positions.set(person.id, {
            x: Math.cos(baseAngle + angleOffset) * outerRadius,
            y: Math.sin(baseAngle + angleOffset) * outerRadius,
          });
        });

      unresolvedSingles.delete(anchorId);
      placedInPass = true;
    }

    if (!placedInPass) {
      break;
    }
  }

  if (unresolvedSingles.size > 0) {
    const remainingSingles = [...unresolvedSingles.values()]
      .flat()
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
    remainingSingles.forEach((person, index) => {
      const baseAngle = (index / Math.max(remainingSingles.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const outerRadius = vcRadius + 230 + Math.floor(index / Math.max(vcCount, 1)) * 72;
      positions.set(person.id, {
        x: Math.cos(baseAngle) * outerRadius,
        y: Math.sin(baseAngle) * outerRadius,
      });
    });
  }

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

function buildStaticFocusOrbit(count: number, radius: number) {
  const positions: GraphPosition[] = [];
  const safeCount = Math.max(count, 1);

  for (let index = 0; index < safeCount; index += 1) {
    const angle = (index / safeCount) * Math.PI * 2 - Math.PI / 2;
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  return positions;
}

function GraphInner() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reactFlow = useReactFlow();
  const isMobile = useIsMobile();
  const { access } = useAccessState();
  const graphQuery = useGraphData(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const refreshData = useRefreshAnytraceData();
  const [query, setQuery] = useState("");
  const [overviewQuery, setOverviewQuery] = useState("");
  const [showOnlyTop, setShowOnlyTop] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<GraphPlatformFilter>("x");
  const [xSnapshotMode, setXSnapshotMode] = useState<"all" | "new" | "multi">("multi");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [networkFocusOpen, setNetworkFocusOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, GraphPosition>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const deferredOverviewQuery = useDeferredValue(overviewQuery);
  const focusVcId = searchParams.get("focusVc");
  const focusPersonId = searchParams.get("focusPerson");

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
  const selectedVcConnections = useMemo(() => {
    if (!selectedVc || !graph) return [];
    return graph.edges
      .filter((edge) => edge.sourceId === selectedVc.id)
      .map((edge) => graph.people.find((person) => person.id === edge.targetId))
      .filter((person): person is TrackedPerson => !!person);
  }, [graph, selectedVc]);
  const vcsById = useMemo(() => new Map((graph?.vcs ?? []).map((vc) => [vc.id, vc])), [graph?.vcs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(GRAPH_FILTER_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw) as {
        filtersOpen?: boolean;
        showSearchBar?: boolean;
      };
      setFiltersOpen(Boolean(prefs.filtersOpen));
      setShowSearchBar(Boolean(prefs.showSearchBar));
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      GRAPH_FILTER_PREFS_KEY,
      JSON.stringify({
        filtersOpen,
        showSearchBar,
      }),
    );
  }, [filtersOpen, showSearchBar]);

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

    const search = deferredQuery.trim().toLowerCase();
    const topPickIds = new Set(graph.weeklyPicks.map((pick) => pick.person.id));
    const vcNodes: Node<GraphNodeData>[] = [];
    const personNodes: Node<GraphNodeData>[] = [];
    const edges: Edge[] = [];
    const baseFilteredPeople = graph.people.filter((person) => {
      if (showOnlyTop && !topPickIds.has(person.id)) return false;
      if (!search) return true;
      return [person.fullName, person.company, person.location].join(" ").toLowerCase().includes(search);
    });
    const personIds = new Set(baseFilteredPeople.map((person) => person.id));
    const graphEdges = graph.edges.filter((edge) => edge.platform !== "github");
    const xEdges = graphEdges.filter((edge) => edge.platform === "x" && edge.graphSource === "snapshot");
    const multiFollowedTargetIds = new Set(
      xEdges
        .filter((edge) => (edge.followerCount ?? 0) > 1)
        .map((edge) => edge.targetId),
    );
    const isEventDerivedXEdge = (edge: (typeof graph.edges)[number]) => edge.platform === "x" && edge.graphSource === "event";
    const preFilteredEdges = graphEdges
      .filter((edge) => {
        if (!personIds.has(edge.targetId)) return false;
        if (platformFilter === "all") return true;
        return edge.platform === platformFilter;
      })
      .filter((edge) => {
        if (edge.platform !== "x") {
          return xSnapshotMode === "all";
        }
        if (isEventDerivedXEdge(edge)) return xSnapshotMode === "all";
        if (edge.graphSource !== "snapshot") return true;
        if (xSnapshotMode === "all") return true;
        if (xSnapshotMode === "new") return edge.isRecent === true;
        return multiFollowedTargetIds.has(edge.targetId);
      });

    const selectedPersonId =
      focusPersonId ||
      (selectedNodeId && graph.people.some((person) => person.id === selectedNodeId) ? selectedNodeId : null);
    const selectedVcId =
      focusVcId ||
      (selectedNodeId && graph.vcs.some((vc) => vc.id === selectedNodeId) ? selectedNodeId : null);
    const shouldLimitDefaultGraph = !search && !focusVcId && !focusPersonId && xSnapshotMode === "multi" && platformFilter === "x";
    const graphPersonLimit = isMobile ? 18 : DEFAULT_GRAPH_PERSON_LIMIT;
    const targetStats = new Map<string, { followerCount: number; latest: number; edgeCount: number }>();

    preFilteredEdges.forEach((edge) => {
      const stats = targetStats.get(edge.targetId) ?? { followerCount: 0, latest: 0, edgeCount: 0 };
      stats.followerCount = Math.max(stats.followerCount, edge.followerCount ?? 0);
      stats.latest = Math.max(stats.latest, edgeTimeValue(edge));
      stats.edgeCount += 1;
      targetStats.set(edge.targetId, stats);
    });

    const visibleTargetIds = shouldLimitDefaultGraph
      ? new Set(
          [...targetStats.entries()]
            .sort((left, right) => {
              const followerDiff = right[1].followerCount - left[1].followerCount;
              if (followerDiff !== 0) return followerDiff;
              const latestDiff = right[1].latest - left[1].latest;
              if (latestDiff !== 0) return latestDiff;
              return right[1].edgeCount - left[1].edgeCount;
            })
            .slice(0, graphPersonLimit)
            .map(([personId]) => personId),
        )
      : new Set(preFilteredEdges.map((edge) => edge.targetId));

    if (selectedPersonId) {
      visibleTargetIds.add(selectedPersonId);
    }

    if (selectedVcId && shouldLimitDefaultGraph) {
      preFilteredEdges
        .filter((edge) => edge.sourceId === selectedVcId)
        .slice(0, graphPersonLimit)
        .forEach((edge) => visibleTargetIds.add(edge.targetId));
    }

    let baseFilteredEdges = preFilteredEdges.filter((edge) => visibleTargetIds.has(edge.targetId));
    if (shouldLimitDefaultGraph) {
      const edgesByTarget = new Map<string, typeof baseFilteredEdges>();
      baseFilteredEdges.forEach((edge) => {
        const list = edgesByTarget.get(edge.targetId) ?? [];
        list.push(edge);
        edgesByTarget.set(edge.targetId, list);
      });
      baseFilteredEdges = [...edgesByTarget.values()].flatMap((targetEdges) =>
        [...targetEdges]
          .sort((left, right) => edgeTimeValue(left) - edgeTimeValue(right) || left.sourceId.localeCompare(right.sourceId))
          .slice(0, DEFAULT_EDGES_PER_PERSON),
      );
    }
    const connectedPersonIds = new Set(baseFilteredEdges.map((edge) => edge.targetId));
    const connectedVcIds = new Set(baseFilteredEdges.map((edge) => edge.sourceId));
    const hideDisconnectedSnapshotNodes = xSnapshotMode === "multi" || xSnapshotMode === "new";
    const filteredPeople =
      hideDisconnectedSnapshotNodes
        ? baseFilteredPeople.filter((person) => connectedPersonIds.has(person.id))
        : baseFilteredPeople.filter((person) => connectedPersonIds.has(person.id) || isManualLocalPerson(person));
    const filteredEdges =
      hideDisconnectedSnapshotNodes
        ? baseFilteredEdges.filter(
            (edge) => connectedPersonIds.has(edge.targetId) && connectedVcIds.has(edge.sourceId),
          )
        : baseFilteredEdges;
    const vcIds = new Set(filteredEdges.map((edge) => edge.sourceId));
    const activeNodeId = selectedNodeId;
    const visibleVcs = graph.vcs.filter((vc) => vcIds.has(vc.id));
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
        sourceHandle: "source-center",
        targetHandle: "target-center",
        zIndex: edge.isTopPick ? 2 : 1,
        style: {
          stroke: platformColor(edge.platform),
          strokeWidth: Math.min(3, Math.max(1, edge.eventCount * 1.1 + (siblingCount > 1 ? siblingIndex * 0.04 : 0))),
          opacity: dimUnselectedEdges ? 0.1 : edge.isTopPick ? 0.9 : shouldLimitDefaultGraph ? 0.34 : 0.54,
          pointerEvents: "none",
        },
        selectable: false,
        focusable: false,
        interactionWidth: 0,
      });
    });

    return { nodes: [...vcNodes, ...personNodes], edges };
  }, [deferredQuery, focusPersonId, focusVcId, graph, identitiesByPerson, isMobile, platformFilter, positionOverrides, selectedNodeId, showOnlyTop, xSnapshotMode]);

  const overviewVisiblePersonIds = useMemo(() => {
    return new Set(
      built.nodes
        .filter((node) => node.data.kind === "person")
        .map((node) => node.id),
    );
  }, [built.nodes]);

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = built.nodes.find((entry) => entry.id === nodeId);
      if (!node) return;

      const size =
        node.data.kind === "vc"
          ? getVcNodeSize(node.data.vc.sizeLabel) + 12
          : getPersonNodeSize(node.data.topPick);

      reactFlow.setCenter(node.position.x + size / 2, node.position.y + size / 2, {
        zoom: isMobile ? 0.52 : 0.68,
        duration: 500,
      });
    },
    [built.nodes, isMobile, reactFlow],
  );

  const resetGraphView = useCallback(() => {
    setSelectedNodeId(null);
    setNetworkFocusOpen(false);
    reactFlow.fitView({
      padding: 0.32,
      duration: 500,
      minZoom: 0.18,
      maxZoom: 1.8,
    });
  }, [reactFlow]);

  useEffect(() => {
    if (!focusVcId || built.nodes.length === 0) return;
    const node = built.nodes.find((entry) => entry.id === focusVcId && entry.data.kind === "vc");
    if (!node) return;

    setSelectedNodeId(focusVcId);
    focusNode(focusVcId);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("focusVc");
    setSearchParams(nextParams, { replace: true });
  }, [built.nodes, focusNode, focusVcId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!focusPersonId || built.nodes.length === 0) return;
    const node = built.nodes.find((entry) => entry.id === focusPersonId && entry.data.kind === "person");
    if (!node) return;

    setSelectedNodeId(focusPersonId);
    focusNode(focusPersonId);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("focusPerson");
    setSearchParams(nextParams, { replace: true });
  }, [built.nodes, focusNode, focusPersonId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (built.nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [built.nodes, selectedNodeId]);

  const overviewPeople = useMemo(() => {
    if (!graph) return [];
    const topPickIds = new Set(graph.weeklyPicks.map((pick) => pick.person.id));
    const normalizedOverviewQuery = deferredOverviewQuery.trim().toLowerCase();

    return [...graph.people]
      .filter((person) => {
        if (!overviewVisiblePersonIds.has(person.id)) {
          return false;
        }
        if (!normalizedOverviewQuery) return true;
        return [person.fullName, person.company, person.roleTitle, person.location]
          .join(" ")
          .toLowerCase()
          .includes(normalizedOverviewQuery);
      })
      .sort((left, right) => {
        const topDiff = Number(topPickIds.has(right.id)) - Number(topPickIds.has(left.id));
        if (topDiff !== 0) return topDiff;
        return left.fullName.localeCompare(right.fullName);
      });
  }, [deferredOverviewQuery, graph, overviewVisiblePersonIds]);

  const visibleStats = useMemo(() => {
    const vcIds = new Set<string>();
    const personIds = new Set<string>();

    for (const node of built.nodes) {
      if (node.data.kind === "vc") {
        vcIds.add(node.id);
      } else {
        personIds.add(node.id);
      }
    }

    return {
      visibleVcs: vcIds.size,
      visiblePeople: personIds.size,
      visibleEdges: built.edges.length,
    };
  }, [built.edges.length, built.nodes]);

  const graphIsLoading = graphQuery.isLoading || identitiesQuery.isLoading;
  const hasRawGraphData = (graph?.edges ?? []).some((edge) => edge.platform !== "github");
  const hasVisibleGraph = built.nodes.length > 0 && built.edges.length > 0;
  const usingEventConnections = graph?.graphSource === "event";
  const graphIsPartial = usingEventConnections || (graph?.filteredConnectionCount ?? 0) > 0;
  const selectedNodeLabel = selectedPerson?.fullName || selectedVc?.name || "Selected network";
  const selectedPersonConnectionEntries = useMemo(() => {
    if (!selectedPerson || !graph) return [];

    const uniqueVcIds = new Set(
      graph.edges
        .filter((edge) => edge.targetId === selectedPerson.id)
        .map((edge) => edge.sourceId),
    );

    return [...uniqueVcIds]
      .map((vcId) => graph.vcs.find((vc) => vc.id === vcId))
      .filter((vc): vc is VcSource => !!vc);
  }, [graph, selectedPerson]);
  const selectedNodeConnectionCount = selectedPerson ? selectedPersonConnectionEntries.length : selectedVcConnections.length;
  const staticFocusNodes = useMemo(() => {
    if (selectedPerson) {
      return selectedPersonConnectionEntries.map((vc) => ({
        id: vc.id,
        label: vc.name,
        sublabel: [vc.country, vc.sizeLabel].filter(Boolean).join(" / "),
        imageUrls: avatarSourcesForVc(vc),
        kind: "vc" as const,
        rounded: "full" as const,
      }));
    }

    if (selectedVc) {
      return selectedVcConnections.map((person) => ({
        id: person.id,
        label: person.fullName,
        sublabel: personConnectionLabel(person),
        imageUrls: avatarSourcesForPerson(person, identitiesByPerson.get(person.id) ?? []),
        kind: "person" as const,
        rounded: "xl" as const,
      }));
    }

    return [] as StaticFocusNode[];
  }, [identitiesByPerson, selectedPerson, selectedPersonConnectionEntries, selectedVc, selectedVcConnections]);
  const staticFocusOrbit = useMemo(
    () => buildStaticFocusOrbit(staticFocusNodes.length, staticFocusNodes.length > 5 ? 148 : 132),
    [staticFocusNodes.length],
  );
  const activeFilterCount =
    Number(showOnlyTop) + Number(platformFilter !== "x") + Number(xSnapshotMode !== "multi");
  const activeFilterSummary = [
    showOnlyTop ? "Top picks" : null,
    platformFilter !== "x" ? (platformFilter === "all" ? "All non-GitHub context" : `Platform: ${platformFilter}`) : null,
    xSnapshotMode === "all"
      ? "Full X snapshot"
      : xSnapshotMode === "new"
        ? "New X only"
        : "Qualified seed-follows",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ProductGate
      title="Graph"
      description="Local VC graph based on the current seed dataset and your local workspace additions."
    >
      <div className="relative h-[calc(100vh-7rem)] overflow-hidden bg-surface-sunken/40 sm:h-[calc(100vh-6.5rem)] md:h-[calc(100vh-4rem)]">
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-3 pointer-events-none md:top-4 md:left-4 md:right-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {showSearchBar && (
                <div className="flex w-full min-w-0 flex-1 items-center gap-2 rounded-full border border-border/80 bg-background px-3 py-2 shadow-sm sm:min-w-[260px] xl:max-w-sm">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search a person, company, or city"
                    className="h-auto border-0 bg-transparent p-0 focus-visible:ring-0"
                  />
                  <button
                    type="button"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
                    onClick={() => {
                      setShowSearchBar(false);
                      setQuery("");
                    }}
                    aria-label="Close search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {!showSearchBar && activeFilterSummary ? (
                <div className="rounded-full border border-border/80 bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
                  {activeFilterSummary}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showSearchBar ? "default" : "outline"}
                size="icon"
                className="h-9 w-9 rounded-full bg-background shadow-sm"
                onClick={() => setShowSearchBar((value) => !value)}
                aria-label={showSearchBar ? "Hide graph search" : "Show graph search"}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 bg-background shadow-sm"
                onClick={resetGraphView}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 bg-background shadow-sm"
                onClick={() => refreshData.mutate()}
                disabled={refreshData.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshData.isPending ? "animate-spin" : ""}`} />
                Reload
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 bg-background shadow-sm"
                onClick={() => setFiltersOpen((value) => !value)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">
                    {activeFilterCount}
                  </span>
                ) : null}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </Button>
            </div>
          </div>

          {filtersOpen && (
            <div className="pointer-events-auto ml-auto w-full max-w-[420px] max-h-[min(70vh,36rem)] overflow-y-auto rounded-[24px] border border-border/80 bg-background p-4 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Graph filters</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Use these controls to narrow the graph quickly.
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs text-muted-foreground"
                  onClick={() => {
                    setShowOnlyTop(false);
                    setPlatformFilter("x");
                    setXSnapshotMode("multi");
                  }}
                >
                  Reset
                </Button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-[18px] border border-border/70 p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Platform</div>
                  <div className="mt-1 text-sm text-foreground">Choose which signal source to show.</div>
                  <ToggleGroup
                    type="single"
                    value={platformFilter}
                    onValueChange={(value) => {
                      if (value) setPlatformFilter(value as GraphPlatformFilter);
                    }}
                    className="mt-3 flex flex-wrap justify-start gap-2"
                  >
                    <ToggleGroupItem value="x" variant="outline" size="sm" className="rounded-full">X</ToggleGroupItem>
                    <ToggleGroupItem value="all" variant="outline" size="sm" className="rounded-full">All context</ToggleGroupItem>
                    <ToggleGroupItem value="linkedin" variant="outline" size="sm" className="rounded-full">LinkedIn</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="rounded-[18px] border border-border/70 p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">X connections</div>
                  <div className="mt-1 text-sm text-foreground">Switch between qualified multi-follows and broader X snapshots.</div>
                  <ToggleGroup
                    type="single"
                    value={xSnapshotMode}
                    onValueChange={(value) => {
                      if (value) setXSnapshotMode(value as "all" | "new" | "multi");
                    }}
                    className="mt-3 flex flex-wrap justify-start gap-2"
                  >
                    <ToggleGroupItem value="multi" variant="outline" size="sm" className="rounded-full">Multi-followed</ToggleGroupItem>
                    <ToggleGroupItem value="new" variant="outline" size="sm" className="rounded-full">New only</ToggleGroupItem>
                    <ToggleGroupItem value="all" variant="outline" size="sm" className="rounded-full">Full snapshot</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="rounded-[18px] border border-border/70 p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">View</div>
                  <div className="mt-1 text-sm text-foreground">Focus on the strongest profiles when needed.</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant={showOnlyTop ? "default" : "outline"}
                      size="sm"
                      className="rounded-full gap-1.5"
                      onClick={() => setShowOnlyTop((value) => !value)}
                    >
                      <Flame className="h-3.5 w-3.5" />
                      {showOnlyTop ? "Showing top picks" : "Top picks only"}
                    </Button>
                    <div className="rounded-full border border-border/70 px-3 py-2 text-xs text-muted-foreground">
                      {usingEventConnections ? "Event-derived connections" : "Snapshot-backed connections"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!graphIsLoading && hasVisibleGraph && !isMobile && (
          <div
            className={`absolute left-3 top-16 bottom-3 z-10 pointer-events-auto transition-all duration-300 md:left-4 md:top-20 md:bottom-4 ${
              sidebarOpen ? "w-[320px]" : "w-12"
            }`}
          >
            <div className="flex h-full">
              <div
                className={`h-full overflow-hidden rounded-[28px] border border-border bg-background shadow-xl transition-all duration-300 ${
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

                    <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-surface-sunken/70 px-3 py-2">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={overviewQuery}
                        onChange={(event) => setOverviewQuery(event.target.value)}
                        placeholder="Search people overview"
                        className="h-auto border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                      />
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
                              <div className="truncate text-[11px] text-muted-foreground">{personConnectionLabel(person)}</div>
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

        {graphIsLoading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Skeleton className="h-56 w-80 rounded-[28px]" />
          </div>
        ) : graphQuery.isError ? (
          <EmptyGraphState
            title="Could not load the graph"
            body="The graph data is unavailable."
          />
        ) : !hasRawGraphData ? (
          <EmptyGraphState
            title="No graph connections yet"
              body="The local dataset currently has no connection edges yet. You can still manage investors and tracked people in the local workspace."
          />
        ) : !hasVisibleGraph ? (
          <EmptyGraphState
            title="No visible connections for these filters"
            body="Try the default X seed-follow view or clear your search. The backend has graph data, but the current filters hide every visible connection."
          />
        ) : (
          <ReactFlow
            className="anytrace-graph-flow"
            nodes={built.nodes}
            edges={built.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.32 }}
            minZoom={0.18}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable={!isMobile}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              focusNode(node.id);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setNetworkFocusOpen(false);
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

        <Dialog open={networkFocusOpen && !!selectedNodeId} onOpenChange={setNetworkFocusOpen}>
          <DialogContent className="max-w-[min(1100px,96vw)] rounded-[28px] border-border p-0">
            <DialogHeader className="border-b border-border px-4 py-4 text-left sm:px-6 sm:py-5">
              <DialogTitle className="pr-8">{selectedNodeLabel}</DialogTitle>
              <DialogDescription>
                Focused network view with {selectedNodeConnectionCount} direct connection{selectedNodeConnectionCount === 1 ? "" : "s"}.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="rounded-[24px] border border-border bg-surface-sunken/50 p-4 sm:p-5">
                  {selectedPerson ? (
                    <div>
                      <div className="flex items-start gap-3">
                        <EntityAvatar
                          name={selectedPerson.fullName}
                          imageUrls={avatarSourcesForPerson(selectedPerson, selectedPersonIdentities)}
                          size={48}
                          rounded="xl"
                        />
                        <div className="min-w-0">
                          <div className="text-base font-medium">{selectedPerson.fullName}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{personConnectionLabel(selectedPerson)}</div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                        {selectedPerson.summary || "No narrative summary available for this profile yet."}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {selectedPersonIdentities.map((identity) => (
                          <span key={identity.id} className="rounded-full border border-border bg-background px-3 py-1.5">
                            {identity.platform}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : selectedVc ? (
                    <div>
                      <div className="flex items-start gap-3">
                        <EntityAvatar
                          name={selectedVc.name}
                          imageUrls={avatarSourcesForVc(selectedVc)}
                          size={48}
                        />
                        <div className="min-w-0">
                          <div className="text-base font-medium">{selectedVc.name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {selectedVc.country}
                            {selectedVc.sizeLabel ? ` / ${selectedVc.sizeLabel}` : ""}
                          </div>
                        </div>
                      </div>
                      {selectedVc.sectorFocus && (
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{selectedVc.sectorFocus}</p>
                      )}
                      <div className="mt-4 rounded-2xl border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                        {selectedNodeConnectionCount} direct connection{selectedNodeConnectionCount === 1 ? "" : "s"} visible in the current graph filters.
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-border bg-background p-4 sm:p-5">
                  <div className="text-sm font-medium">Connection map</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {isMobile
                      ? "Mobile view shows a compact list of direct first-degree connections."
                      : "Static first-degree graph with the selected node centered."}
                  </div>

                  <div className="mt-4">
                    {!isMobile && staticFocusNodes.length > 0 ? (
                      <div className="rounded-[24px] border border-border bg-surface-sunken/30 p-4">
                        <div className="relative mx-auto h-[360px] max-w-[420px] overflow-hidden rounded-[20px] border border-border bg-[radial-gradient(circle_at_center,hsl(var(--background))_0%,hsl(var(--surface-sunken))_70%,transparent_100%)]">
                          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 420 360" aria-hidden="true">
                            {staticFocusOrbit.map((point, index) => (
                              <line
                                key={`edge-${staticFocusNodes[index]?.id ?? index}`}
                                x1="210"
                                y1="180"
                                x2={210 + point.x}
                                y2={180 + point.y}
                                stroke="hsl(var(--border-strong))"
                                strokeWidth="1.5"
                              />
                            ))}
                          </svg>

                          <div className="absolute left-1/2 top-1/2 z-10 w-32 -translate-x-1/2 -translate-y-1/2 text-center">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-border bg-background shadow-md">
                              {selectedPerson ? (
                                <EntityAvatar
                                  name={selectedPerson.fullName}
                                  imageUrls={avatarSourcesForPerson(selectedPerson, selectedPersonIdentities)}
                                  size={64}
                                  rounded="xl"
                                />
                              ) : selectedVc ? (
                                <EntityAvatar
                                  name={selectedVc.name}
                                  imageUrls={avatarSourcesForVc(selectedVc)}
                                  size={64}
                                />
                              ) : null}
                            </div>
                            <div className="mt-3 text-sm font-medium">
                              {selectedPerson?.fullName || selectedVc?.name}
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {selectedPerson
                                ? selectedPerson.company || selectedPerson.roleTitle
                                : [selectedVc?.country, selectedVc?.sizeLabel].filter(Boolean).join(" / ")}
                            </div>
                          </div>

                          {staticFocusNodes.map((node, index) => {
                            const point = staticFocusOrbit[index];
                            const left = 210 + point.x;
                            const top = 180 + point.y;

                            return (
                              <button
                                key={node.id}
                                type="button"
                                className="absolute z-10 w-28 -translate-x-1/2 -translate-y-1/2 text-center"
                                style={{ left, top }}
                                onClick={() => {
                                  setNetworkFocusOpen(false);
                                  setSelectedNodeId(node.id);
                                  focusNode(node.id);
                                }}
                              >
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] border border-border bg-background shadow-sm">
                                  <EntityAvatar
                                    name={node.label}
                                    imageUrls={node.imageUrls}
                                    size={44}
                                    rounded={node.rounded}
                                  />
                                </div>
                                <div className="mt-2 break-words text-xs font-medium leading-tight">{node.label}</div>
                                <div className="mt-1 break-words text-[10px] leading-tight text-muted-foreground">{node.sublabel}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : staticFocusNodes.length === 0 ? (
                      <div className="rounded-2xl border border-border bg-surface-sunken/40 px-3 py-3 text-sm text-muted-foreground">
                        No direct connections are visible for this node under the current filters.
                      </div>
                    ) : null}

                    {staticFocusNodes.length > 0 && (
                      <div className={`${isMobile ? "" : "mt-4"} grid gap-3`}>
                        {staticFocusNodes.map((node) => (
                          <div key={`list-${node.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface-sunken/40 px-3 py-3">
                            <EntityAvatar
                              name={node.label}
                              imageUrls={node.imageUrls}
                              size={40}
                              rounded={node.rounded}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{node.label}</div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">{node.sublabel}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full"
                              onClick={() => {
                                setNetworkFocusOpen(false);
                                setSelectedNodeId(node.id);
                                focusNode(node.id);
                              }}
                            >
                              Select
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {!graphIsLoading && graph && (
          <div className="absolute bottom-3 right-3 z-10 md:bottom-4 md:right-4">
            {statsOpen ? (
              <div className="w-[300px] max-w-[calc(100vw-1.5rem)] rounded-[24px] border border-border bg-background p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Graph info</div>
                    <div className="mt-2 text-sm">
                      {visibleStats.visibleVcs} visible VCs
                      <span className="px-2 text-muted-foreground">/</span>
                      {platformFilter === "all" ? "all connections" : `${platformFilter} only`}
                      <span className="px-2 text-muted-foreground">/</span>
                      {xSnapshotMode === "all" ? "full X snapshot" : xSnapshotMode === "new" ? "new X follows only" : "multi-followed only"}
                      <span className="px-2 text-muted-foreground">/</span>
                      {visibleStats.visiblePeople} connected people
                      <span className="px-2 text-muted-foreground">/</span>
                      {visibleStats.visibleEdges} active edges
                    </div>
                  </div>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setStatsOpen(false)}
                    aria-label="Close graph info"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {!hasVisibleGraph && (
                    <div className="rounded-2xl bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
                      No active VC-to-candidate edges are visible for the current filters.
                    </div>
                  )}
                  {usingEventConnections && (
                    <div className="rounded-2xl bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
                      Snapshot observations are not populated for these edges yet, so the graph is temporarily bootstrapping from historical follow events.
                    </div>
                  )}
                  {!usingEventConnections && (graph?.filteredConnectionCount ?? 0) > 0 && (
                    <div className="rounded-2xl bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
                      {graph?.filteredConnectionCount} snapshot connection{graph?.filteredConnectionCount === 1 ? "" : "s"} could not be matched to a visible VC or person yet and were filtered out.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-surface-sunken"
                onClick={() => setStatsOpen(true)}
                aria-label="Open graph info"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {!graphIsLoading && (selectedPerson || selectedVc) && (
          <div className="absolute bottom-14 left-3 right-3 z-10 max-h-[46vh] overflow-y-auto rounded-[28px] border border-border bg-background p-4 shadow-xl md:bottom-4 md:left-auto md:right-4 md:w-[340px] md:max-w-[calc(100vw-2rem)] md:p-5">
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
                      <div className="mt-1 text-xs text-muted-foreground">{personConnectionLabel(selectedPerson)}</div>
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
                    <ActivityLine
                      key={event.id}
                      event={event}
                      personName={selectedPerson.fullName}
                      vcsById={vcsById}
                      className="border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
                    />
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full gap-1.5"
                  onClick={() => setNetworkFocusOpen(true)}
                >
                  Explore connections <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 rounded-full gap-1.5"
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
                <div className="mt-4 text-xs text-muted-foreground">{selectedVcConnections.length} connected people</div>
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
                        <div className="text-[11px] text-muted-foreground truncate">{personConnectionLabel(person)}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full gap-1.5"
                  onClick={() => setNetworkFocusOpen(true)}
                >
                  Explore connections <ExternalLink className="h-3.5 w-3.5" />
                </Button>
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
