import { useMemo, useState } from "react";
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
import { Filter, Flame, Github, Linkedin, Search, Twitter } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState, useGraphData, usePersonIdentities } from "@/hooks/useAnytrace";
import type { ActivityPlatform, PersonIdentity, TrackedPerson, VcSource } from "@/data/anytrace";

type GraphNodeData =
  | { kind: "vc"; vc: VcSource; highlight: boolean; dim: boolean }
  | { kind: "person"; person: TrackedPerson; githubUsername?: string; highlight: boolean; dim: boolean; topPick: boolean };

function identityFor(identities: PersonIdentity[], personId: string, platform: PersonIdentity["platform"]) {
  return identities.find((identity) => identity.personId === personId && identity.platform === platform);
}

function VcNode({ data }: NodeProps<Node<GraphNodeData>>) {
  if (data.kind !== "vc") return null;
  return (
    <div
      className={`rounded-full bg-background ring-1 ring-border p-1 transition-all ${
        data.highlight ? "ring-2 ring-accent-indigo shadow-md scale-110" : ""
      } ${data.dim ? "opacity-30" : ""}`}
    >
      <EntityAvatar name={data.vc.name} githubUsername={data.vc.githubUsername ?? undefined} size={48} />
    </div>
  );
}

function PersonNode({ data }: NodeProps<Node<GraphNodeData>>) {
  if (data.kind !== "person") return null;
  return (
    <div
      className={`relative rounded-2xl transition-all ${
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

function GraphInner() {
  const navigate = useNavigate();
  const { access } = useAccessState();
  const graphQuery = useGraphData(access.isAuthenticated);
  const identitiesQuery = usePersonIdentities(access.isAuthenticated);
  const [query, setQuery] = useState("");
  const [showOnlyTop, setShowOnlyTop] = useState(false);

  const graph = graphQuery.data;
  const identities = identitiesQuery.data ?? [];

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

    graph.vcs.forEach((vc, index) => {
      const angle = (index / Math.max(graph.vcs.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const radius = 180;
      vcNodes.push({
        id: vc.id,
        type: "vc",
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: {
          kind: "vc",
          vc,
          highlight: vcIds.has(vc.id),
          dim: !vcIds.has(vc.id) && personIds.size > 0,
        },
      });
    });

    filteredPeople.forEach((person, index) => {
      const angle = (index / Math.max(filteredPeople.length, 1)) * Math.PI * 2 + Math.PI / 5;
      const radius = topPickIds.has(person.id) ? 360 : 300;
      personNodes.push({
        id: person.id,
        type: "person",
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
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
      edges.push({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        animated: edge.isTopPick,
        style: {
          stroke: platformColor(edge.platform),
          strokeWidth: Math.min(4, Math.max(1.25, edge.eventCount * 1.3)),
          opacity: edge.isTopPick ? 0.9 : 0.4,
        },
      });
    });

    return { nodes: [...vcNodes, ...personNodes], edges };
  }, [graph, identities, query, showOnlyTop]);

  return (
    <ProductGate
      title="Graph"
      description="The original Anytrace graph stays in place, now redrawn from the new Supabase model and focused on VCs to people."
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
            <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              VCs → people
            </div>
          </div>
        </div>

        {graphQuery.isLoading || identitiesQuery.isLoading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Skeleton className="h-56 w-80 rounded-[28px]" />
          </div>
        ) : graphQuery.isError ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="rounded-[28px] border border-border bg-card p-8 text-sm text-muted-foreground">
              Could not load the graph.
            </div>
          </div>
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
            onNodeClick={(_, node) => {
              if (node.id && graph?.people.some((person) => person.id === node.id)) {
                navigate(`/connections/${node.id}`);
              }
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--border))" />
            <Controls
              showInteractive={false}
              className="!bg-background !border !border-border !rounded-full !shadow-sm overflow-hidden !hidden md:!flex"
            />
          </ReactFlow>
        )}

        {!graphQuery.isLoading && built.nodes.length > 0 && (
          <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4 z-10 rounded-full border border-border bg-background px-4 py-2 shadow-sm text-xs">
            <div className="flex items-center gap-3">
              <span>{graph?.vcs.length ?? 0} VCs</span>
              <span>·</span>
              <span>{graph?.people.length ?? 0} people</span>
              <span>·</span>
              <span>{graph?.edges.length ?? 0} active edges</span>
            </div>
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
