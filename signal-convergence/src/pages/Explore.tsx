import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Search,
  X,
  ExternalLink,
  Maximize2,
  Users,
  Zap,
  Flame,
  ChevronDown,
  Filter,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  Github,
  Linkedin,
  Twitter,
  Network,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/format";
import { useAlerts, useFounders, useInvestors, useGraph } from "@/hooks/useApi";
import { useOfflineFallback } from "@/hooks/useOfflineFallback";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConvergenceAlert, Founder, Investor, InvestorTier, Signal, SignalPlatform } from "@/data/types";
import { SignalIcon, platformLabel } from "@/components/converge/SignalIcon";
import { TierBadge } from "@/components/converge/InvestorAvatar";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import { Badge } from "@/components/ui/badge";
import { countryFlag, countryName } from "@/lib/country";
import { investorCountryCode, investorIndustries } from "@/lib/investorTags";
import { linkedinLinkFor } from "@/lib/socialLinks";

/* ---------- Layout: tier-clustered, organic placement ----------
 * Big funds (VCs) form a tight central cluster, micro-VCs sit mid-distance,
 * angels orbit further out. Founders are scattered around the field; the
 * top pick lands further from center because its many new connections
 * pull it outward. No node is forced to the exact center.
 */
const CENTER = { x: 0, y: 0 };
const TIER_RADIUS: Record<InvestorTier, number> = {
  vc: 160,
  microvc: 320,
  angel: 480,
};
const FOUNDER_BASE_RADIUS = 260;
const FOUNDER_RADIUS_PER_CONNECTION = 22;
const FOUNDER_MAX_RADIUS = 600;

type InvestorNodeData = {
  kind: "investor";
  investor: Investor;
  signalCount: number;
  dim: boolean;
  highlight: boolean;
};

type FounderNodeData = {
  kind: "founder";
  founder: Founder;
  signalCount: number;
  investorCount: number;
  dim: boolean;
  highlight: boolean;
  isTopPick: boolean;
};

type AnyNode = Node<InvestorNodeData | FounderNodeData>;

/* ---------- Custom node renderers ---------- */

function InvestorNode({ data }: NodeProps<Node<InvestorNodeData>>) {
  const { investor, signalCount, dim, highlight } = data;
  // Tier-driven sizing: VC = large fund, microvc = mid, angel = small
  const tierStyle: Record<
    typeof investor.tier,
    { px: number; ring: string; label: string }
  > = {
    vc: { px: 56, ring: "ring-2 ring-foreground/15", label: "VC" },
    microvc: { px: 44, ring: "ring-1 ring-border", label: "μVC" },
    angel: { px: 32, ring: "ring-1 ring-border", label: "Angel" },
  };
  const t = tierStyle[investor.tier];
  return (
    <div
      className={`relative rounded-full transition-all cursor-pointer ${t.ring} ${
        highlight
          ? "!ring-2 !ring-accent-indigo/60 shadow-md scale-110"
          : "hover:scale-105"
      } ${dim ? "opacity-20" : "opacity-100"}`}
      style={{ width: t.px, height: t.px }}
      aria-label={`${investor.name}, ${t.label}, ${signalCount} signals`}
    >
      <EntityAvatar
        githubUsername={investor.githubUsername}
        name={investor.name}
        size={t.px}
      />
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0" />
    </div>
  );
}

function FounderNode({ data }: NodeProps<Node<FounderNodeData>>) {
  const { founder, signalCount, investorCount, dim, highlight, isTopPick } = data;
  const sizePx = isTopPick ? 64 : 44;
  const ringClasses = isTopPick
    ? "ring-4 ring-[hsl(var(--destructive))]/40 shadow-lg animate-pulse-ring"
    : highlight
    ? "ring-2 ring-accent-indigo/40 shadow-md"
    : "hover:ring-2 hover:ring-foreground/20";
  return (
    <div
      className={`relative rounded-xl transition-all cursor-pointer hover:scale-105 ${ringClasses} ${
        dim ? "opacity-20" : "opacity-100"
      }`}
      style={{ width: sizePx, height: sizePx }}
      aria-label={`${founder.name}, ${investorCount} investors, ${signalCount} signals`}
    >
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />
      <EntityAvatar
        githubUsername={founder.githubUsername}
        name={founder.name}
        size={sizePx}
        rounded="xl"
      />
      {isTopPick && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] text-[8px] uppercase tracking-wider font-medium shadow-sm border border-background">
          Top
        </span>
      )}
    </div>
  );
}

const nodeTypes = { investor: InvestorNode, founder: FounderNode };

/* ---------- Build the graph from mock data ---------- */

type GraphSelection =
  | { kind: "investor"; investor: Investor }
  | { kind: "founder"; founder: Founder }
  | null;

interface BuildArgs {
  query: string;
  platforms: Record<SignalPlatform, boolean>;
  selectedId: string | null;
  topPickId: string;
  tiers: Record<InvestorTier, boolean>;
  highlightTopPick: boolean;
  alerts: ConvergenceAlert[];
  founders: Founder[];
  investors: Investor[];
  investorById: (id: string) => Investor;
}

function platformEdgeColor(p: SignalPlatform) {
  // Use semantic tokens
  const map: Record<SignalPlatform, string> = {
    twitter: "hsl(var(--foreground))",
    linkedin: "hsl(var(--signal-linkedin))",
    github: "hsl(var(--foreground))",
  };
  return map[p];
}

function buildGraph({
  query,
  platforms,
  selectedId,
  topPickId,
  tiers,
  highlightTopPick,
  alerts,
  founders,
  investors,
  investorById,
}: BuildArgs) {
  const q = query.trim().toLowerCase();

  // Collect all signals from alerts
  const allSignals: Signal[] = alerts.flatMap((a) =>
    a.signals.map((s) => ({ ...s, _founderId: a.founder.id } as Signal & { _founderId: string }))
  );
  const visibleSignals = allSignals.filter(
    (s) => platforms[s.platform] && tiers[investorById(s.investorId).tier]
  );

  const visibleInvestors = investors.filter((i) => tiers[i.tier]);

  // Per-investor / per-founder signal counts (over visible signals)
  const investorSignalCount = new Map<string, number>();
  const founderSignalCount = new Map<string, number>();
  const founderInvestors = new Map<string, Set<string>>();
  visibleSignals.forEach((s) => {
    investorSignalCount.set(s.investorId, (investorSignalCount.get(s.investorId) ?? 0) + 1);
    const fid = (s as Signal & { _founderId: string })._founderId;
    founderSignalCount.set(fid, (founderSignalCount.get(fid) ?? 0) + 1);
    if (!founderInvestors.has(fid)) founderInvestors.set(fid, new Set());
    founderInvestors.get(fid)!.add(s.investorId);
  });

  // Decide which ids match the search query
  const matchInvestor = (i: Investor) =>
    !q ||
    i.name.toLowerCase().includes(q) ||
    (i.firm ?? "").toLowerCase().includes(q) ||
    i.group.toLowerCase().includes(q) ||
    i.tier.toLowerCase().includes(q);

  const matchFounder = (f: Founder) =>
    !q ||
    f.name.toLowerCase().includes(q) ||
    (f.company ?? "").toLowerCase().includes(q) ||
    f.location.toLowerCase().includes(q);

  const matchedInvestorIds = new Set(investors.filter(matchInvestor).map((i) => i.id));
  const matchedFounderIds = new Set(founders.filter(matchFounder).map((f) => f.id));

  // Which IDs are "in focus" (selection wins, otherwise search match wins)
  const focusInvestorIds = new Set<string>();
  const focusFounderIds = new Set<string>();
  if (selectedId) {
    const sel =
      investors.find((i) => i.id === selectedId) ??
      founders.find((f) => f.id === selectedId);
    if (sel) {
      if ("tier" in sel) {
        focusInvestorIds.add(sel.id);
        visibleSignals.forEach((s) => {
          if (s.investorId === sel.id)
            focusFounderIds.add((s as Signal & { _founderId: string })._founderId);
        });
      } else {
        focusFounderIds.add(sel.id);
        visibleSignals.forEach((s) => {
          if ((s as Signal & { _founderId: string })._founderId === sel.id)
            focusInvestorIds.add(s.investorId);
        });
      }
    }
  } else if (q) {
    matchedInvestorIds.forEach((id) => focusInvestorIds.add(id));
    matchedFounderIds.forEach((id) => focusFounderIds.add(id));
  }

  const hasFocus = focusInvestorIds.size + focusFounderIds.size > 0;

  // ---- Layout ----
  const polar = (radius: number, angle: number) => ({
    x: CENTER.x + radius * Math.cos(angle),
    y: CENTER.y + radius * Math.sin(angle),
  });
  // Deterministic pseudo-random jitter per id so positions are stable across rebuilds
  const jitter = (id: string, range: number) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((h % 1000) / 1000 - 0.5) * range;
  };

  const nodes: AnyNode[] = [];

  // Investors clustered by tier, distributed around a full circle within each tier
  const tierBuckets: Record<InvestorTier, Investor[]> = { vc: [], microvc: [], angel: [] };
  visibleInvestors.forEach((i) => tierBuckets[i.tier].push(i));
  (Object.keys(tierBuckets) as InvestorTier[]).forEach((tier) => {
    const bucket = tierBuckets[tier];
    const baseRadius = TIER_RADIUS[tier];
    const offset = tier === "vc" ? -Math.PI / 2 : tier === "microvc" ? 0.6 : Math.PI / 5;
    bucket.forEach((inv, i) => {
      const dim = hasFocus && !focusInvestorIds.has(inv.id);
      const highlight = focusInvestorIds.has(inv.id);
      const angle = offset + (i / Math.max(bucket.length, 1)) * Math.PI * 2;
      const radius = baseRadius + jitter(inv.id, 60);
      const { x, y } = polar(radius, angle + jitter(inv.id, 0.25));
      nodes.push({
        id: inv.id,
        type: "investor",
        position: { x, y },
        data: {
          kind: "investor",
          investor: inv,
          signalCount: investorSignalCount.get(inv.id) ?? 0,
          dim,
          highlight,
        },
        draggable: true,
      });
    });
  });

  // Founders scattered around the cluster — those with more connections pushed outward
  founders.forEach((f, i) => {
    const dim = hasFocus && !focusFounderIds.has(f.id);
    const highlight = focusFounderIds.has(f.id);
    const conn = founderInvestors.get(f.id)?.size ?? 0;
    const radius = Math.min(
      FOUNDER_MAX_RADIUS,
      FOUNDER_BASE_RADIUS + conn * FOUNDER_RADIUS_PER_CONNECTION + jitter(f.id, 80)
    );
    const angle =
      (i / Math.max(founders.length, 1)) * Math.PI * 2 + jitter(f.id, 0.6);
    const { x, y } = polar(radius, angle);
    nodes.push({
      id: f.id,
      type: "founder",
      position: { x, y },
      data: {
        kind: "founder",
        founder: f,
        signalCount: founderSignalCount.get(f.id) ?? 0,
        investorCount: conn,
        dim,
        highlight,
        isTopPick: highlightTopPick && f.id === topPickId,
      },
      draggable: true,
      zIndex: highlightTopPick && f.id === topPickId ? 1000 : 1,
    });
  });

  // Edges — one per signal (deduped by inv↔founder↔platform to limit clutter)
  const edgeMap = new Map<string, Edge & { _signals: Signal[] }>();
  visibleSignals.forEach((s) => {
    const fid = (s as Signal & { _founderId: string })._founderId;
    const key = `${s.investorId}-${fid}-${s.platform}`;
    const dim =
      hasFocus && !(focusInvestorIds.has(s.investorId) && focusFounderIds.has(fid));
    const lit = focusInvestorIds.has(s.investorId) && focusFounderIds.has(fid);
    const isTopEdge = highlightTopPick && fid === topPickId;
    const isRecent = (Date.now() - +new Date(s.occurredAt)) < 7 * 24 * 3600 * 1000;
    if (edgeMap.has(key)) {
      edgeMap.get(key)!._signals.push(s);
      return;
    }
    edgeMap.set(key, {
      id: key,
      source: s.investorId,
      target: fid,
      type: "straight",
      animated: lit || isTopEdge || isRecent,
      style: {
        stroke: isTopEdge ? "hsl(var(--destructive))" : platformEdgeColor(s.platform),
        strokeWidth: lit ? 2 : 1,
        opacity: dim ? 0.08 : lit ? 0.95 : isTopEdge ? 0.7 : 0.3,
      },
      data: { platform: s.platform },
      zIndex: isTopEdge ? 999 : 0,
      _signals: [s],
    });
  });

  // bump width by stacked-signal count
  const edges: Edge[] = Array.from(edgeMap.values()).map((e) => ({
    ...e,
    style: {
      ...e.style,
      strokeWidth: Math.max(1, Math.min(4, e._signals.length * (e.animated ? 1.6 : 1))),
    },
  }));

  return { nodes, edges };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface-sunken p-3">
      <div className="font-serif text-2xl tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

/* ---------- Inner (uses ReactFlow context) ---------- */

function ContactProfile({
  selection,
  alerts,
  investorById,
  onBack,
  onOpenConnections,
  onOpenDossier,
}: {
  selection: NonNullable<GraphSelection>;
  alerts: ConvergenceAlert[];
  investorById: (id: string) => Investor;
  onBack: () => void;
  onOpenConnections: (id: string) => void;
  onOpenDossier: (id: string) => void;
}) {
  const isFounder = selection.kind === "founder";
  const entity = isFounder ? selection.founder : selection.investor;

  const signalsForInvestor = useMemo(() => {
    if (isFounder) return [];
    return alerts.flatMap((a) =>
      a.signals
        .filter((s) => s.investorId === selection.investor.id)
        .map((s) => ({ ...s, founder: a.founder })),
    );
  }, [alerts, isFounder, selection]);

  const founderAlert = useMemo(() => {
    if (!isFounder) return undefined;
    return alerts.find((a) => a.founder.id === selection.founder.id);
  }, [alerts, isFounder, selection]);
  const founderSignals = founderAlert?.signals ?? [];
  const founderInvolved = useMemo(
    () => Array.from(new Set(founderSignals.map((s) => s.investorId))).map(investorById),
    [founderSignals, investorById],
  );

  const recent = (isFounder
    ? founderSignals.map((s) => ({ ...s, founder: selection.founder }))
    : signalsForInvestor
  )
    .slice()
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));

  const githubUsername = entity.githubUsername;
  const twitterHandle = (entity as Founder).twitterHandle;
  const linkedin = linkedinLinkFor({
    name: entity.name,
    linkedinUrl: (entity as Founder).linkedinUrl,
    company: isFounder ? selection.founder.company : undefined,
    firm: !isFounder ? selection.investor.firm : undefined,
    title: !isFounder ? selection.investor.title : selection.founder.headline,
  });

  return (
    <div className="flex-1 overflow-y-auto animate-fade-in">
      <div className="px-4 py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 -ml-2 mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to contacts
        </Button>

        <div className="flex items-start gap-3">
          <EntityAvatar
            githubUsername={githubUsername}
            name={entity.name}
            size={56}
            rounded={isFounder ? "xl" : "full"}
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl leading-tight truncate">{entity.name}</h1>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {isFounder
                ? selection.founder.headline
                : `${selection.investor.title}${
                    selection.investor.firm ? ` · ${selection.investor.firm}` : ""
                  }`}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {!isFounder && <TierBadge tier={selection.investor.tier} />}
              {!isFounder && (() => {
                const code = investorCountryCode(selection.investor);
                if (!code) return null;
                return (
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <span className="text-sm leading-none">{countryFlag(code)}</span>
                    <span>{countryName(code)}</span>
                  </Badge>
                );
              })()}
              {!isFounder &&
                investorIndustries(selection.investor).map((ind) => (
                  <Badge key={ind} variant="outline" className="font-normal">
                    {ind}
                  </Badge>
                ))}
              {isFounder && (
                <span className="text-[11px] text-muted-foreground">
                  {selection.founder.location}
                </span>
              )}
              <a
                href={linkedin.href}
                target="_blank"
                rel="noreferrer"
                title={linkedin.isDirect ? "Open LinkedIn profile" : `Search LinkedIn for ${entity.name}`}
                className={`hover:text-signal-linkedin ${
                  linkedin.isDirect ? "text-muted-foreground" : "text-muted-foreground/50"
                }`}
              >
                <Linkedin className="h-4 w-4" />
              </a>
              {twitterHandle && (
                <a
                  href={`https://x.com/${twitterHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-signal-twitter"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {githubUsername && (
                <a
                  href={`https://github.com/${githubUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-signal-github"
                >
                  <Github className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          {isFounder ? (
            <>
              <Stat label="Investors engaged" value={founderInvolved.length} />
              <Stat label="Signals" value={founderSignals.length} />
            </>
          ) : (
            <>
              <Stat
                label="Founders touched"
                value={new Set(signalsForInvestor.map((s) => s.founder.id)).size}
              />
              <Stat label="Signals" value={signalsForInvestor.length} />
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            onClick={() => onOpenConnections(entity.id)}
            size="sm"
            className="gap-1.5 w-full"
          >
            <Network className="h-3.5 w-3.5" /> View connections graph
          </Button>
          {isFounder && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDossier(selection.founder.id)}
              className="gap-1.5 w-full"
            >
              Open dossier <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {isFounder && founderInvolved.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Watchlist members involved
            </h3>
            <ul className="space-y-1.5">
              {founderInvolved.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-sunken"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <EntityAvatar
                      githubUsername={inv.githubUsername}
                      name={inv.name}
                      size={28}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{inv.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {inv.firm ?? inv.title}
                      </div>
                    </div>
                  </div>
                  <TierBadge tier={inv.tier} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 pb-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Recent activity
          </h3>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">No signals yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.slice(0, 12).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 p-2 rounded-xl bg-surface-sunken text-xs"
                >
                  <SignalIcon platform={s.platform} className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-muted-foreground truncate flex-1">
                    {s.action}{" "}
                    <span className="text-foreground">
                      {isFounder ? s.target : (s as { founder: Founder }).founder.name}
                    </span>
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
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ExploreInner() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [platforms, setPlatforms] = useState<Record<SignalPlatform, boolean>>({
    twitter: true,
    linkedin: true,
    github: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Record<InvestorTier, boolean>>({
    vc: true,
    microvc: true,
    angel: true,
  });
  const [highlightTopPick, setHighlightTopPick] = useState(true);
  const [contactsOpen, setContactsOpen] = useState(
    typeof window === "undefined" ? true : window.innerWidth >= 768
  );
  const [contactsQuery, setContactsQuery] = useState("");
  const [contactsTab, setContactsTab] = useState<"investors" | "founders">("investors");
  // When set, the main area shows the focused profile view instead of the graph.
  const [profileId, setProfileId] = useState<string | null>(null);

  // ---- Live data ----
  const investorsQuery = useInvestors();
  const foundersQuery = useFounders();
  const alertsQuery = useAlerts();
  const graphQuery = useGraph();
  const offline = useOfflineFallback(alertsQuery);

  const investors = (offline.data?.investors ?? investorsQuery.data ?? []) as Investor[];
  const founders = (offline.data?.founders ?? foundersQuery.data ?? []) as Founder[];
  const alerts = (offline.data?.alerts ?? alertsQuery.data ?? []) as ConvergenceAlert[];

  const investorById = useMemo(() => {
    const map = new Map(investors.map((i) => [i.id, i]));
    return (id: string): Investor =>
      map.get(id) ?? {
        id,
        name: "Unknown",
        title: "",
        tier: "vc",
        avatarColor: "0 0% 50%",
        group: "",
      };
  }, [investors]);

  const isLoading =
    (investorsQuery.isLoading || foundersQuery.isLoading || alertsQuery.isLoading) &&
    !offline.data;
  const isError =
    (investorsQuery.isError || foundersQuery.isError || alertsQuery.isError) &&
    !offline.data;

  // "Graph refreshed" toast on subsequent updates
  const lastGraphUpdate = graphQuery.dataUpdatedAt;
  useEffect(() => {
    if (!lastGraphUpdate) return;
    const prev = (window as unknown as { __lastGraphUpdate?: number }).__lastGraphUpdate;
    (window as unknown as { __lastGraphUpdate?: number }).__lastGraphUpdate = lastGraphUpdate;
    if (prev && lastGraphUpdate > prev) {
      const n = graphQuery.data?.edges?.length ?? 0;
      toast(`Graph refreshed · ${n} edges`);
    }
  }, [lastGraphUpdate, graphQuery.data]);

  // Top pick = founder with the most distinct investors signaling (matches Dashboard)
  const topPickId = useMemo(() => {
    const ranked = alerts
      .slice()
      .sort((a, b) => {
        const sa = new Set(a.signals.map((s) => s.investorId)).size * 10 + a.signals.length;
        const sb = new Set(b.signals.map((s) => s.investorId)).size * 10 + b.signals.length;
        return sb - sa;
      });
    return ranked[0]?.founder.id ?? founders[0]?.id ?? "";
  }, [alerts, founders]);

  const { nodes: builtNodes, edges: builtEdges } = useMemo(
    () =>
      buildGraph({
        query,
        platforms,
        selectedId,
        topPickId,
        tiers,
        highlightTopPick,
        alerts,
        founders,
        investors,
        investorById,
      }),
    [query, platforms, selectedId, topPickId, tiers, highlightTopPick, alerts, founders, investors, investorById]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(builtEdges);

  // When inputs change, rebuild but keep user-dragged positions
  useEffect(() => {
    setNodes((curr) => {
      const posMap = new Map(curr.map((n) => [n.id, n.position]));
      return builtNodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }));
    });
    setEdges(builtEdges);
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  const { fitView, setCenter, getNode } = useReactFlow();

  // Small zoom-in on the top pick when it's activated.
  const focusTopPick = useCallback(() => {
    if (!topPickId) return;
    requestAnimationFrame(() => {
      const node = getNode(topPickId);
      if (!node) return;
      const w = node.width ?? 64;
      const h = node.height ?? 64;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: 1.15,
        duration: 450,
      });
    });
  }, [topPickId, getNode, setCenter]);

  // Re-fit graph whenever the contacts side panel opens/closes,
  // or when the global app sidebar dispatches a layout-change event.
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 320);
    return () => clearTimeout(t);
  }, [contactsOpen, fitView]);

  useEffect(() => {
    const onLayout = () => {
      setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 220);
    };
    window.addEventListener("app:sidebar-toggle", onLayout);
    return () => window.removeEventListener("app:sidebar-toggle", onLayout);
  }, [fitView]);

  const onNodeClick = useCallback((_: MouseEvent, n: Node) => {
    navigate(`/connections/${n.id}`);
  }, [navigate]);

  // Selecting a contact from the sidebar opens the inline profile view.
  const openContact = useCallback((id: string) => {
    setSelectedId(id);
    setProfileId(id);
  }, []);

  const profileSelection: GraphSelection = useMemo(() => {
    if (!profileId) return null;
    const inv = investors.find((i) => i.id === profileId);
    if (inv) return { kind: "investor", investor: inv };
    const f = founders.find((x) => x.id === profileId);
    if (f) return { kind: "founder", founder: f };
    return null;
  }, [profileId, investors, founders]);

  const togglePlatform = (p: SignalPlatform) =>
    setPlatforms((s) => ({ ...s, [p]: !s[p] }));

  const toggleTier = (t: InvestorTier) =>
    setTiers((s) => ({ ...s, [t]: !s[t] }));

  const tierMeta: Record<InvestorTier, { label: string; dot: string }> = {
    vc: { label: "Big VC", dot: "bg-foreground" },
    microvc: { label: "μVC", dot: "bg-foreground/60" },
    angel: { label: "Angel", dot: "bg-accent-indigo" },
  };

  // Contacts side panel: search across all investors + founders
  const filteredContactInvestors = useMemo(() => {
    const q = contactsQuery.trim().toLowerCase();
    return investors
      .filter((i) => !q ||
        i.name.toLowerCase().includes(q) ||
        (i.firm ?? "").toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contactsQuery, investors]);
  const filteredContactFounders = useMemo(() => {
    const q = contactsQuery.trim().toLowerCase();
    return founders
      .filter((f) => !q ||
        f.name.toLowerCase().includes(q) ||
        (f.company ?? "").toLowerCase().includes(q) ||
        f.location.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contactsQuery, founders]);

  const totalNodes = investors.length + founders.length;
  const totalEdges = edges.length;

  return (
    <div className="relative h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] bg-surface-sunken/40 flex">
      {/* Google-Maps style contacts side panel */}
      <aside
        className={`z-30 bg-background border-border shadow-sm flex flex-col transition-transform duration-300 ease-out
          fixed inset-y-0 left-0 w-[85vw] max-w-[320px] border-r
          ${contactsOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0 md:transition-[width] md:h-full md:border-r
          ${contactsOpen ? "md:w-[300px]" : "md:w-0"}`}
      >
        {contactsOpen && (
          <>
            <div className="px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-lg leading-none">Contacts</h2>
                <button
                  onClick={() => setContactsOpen(false)}
                  className="h-7 w-7 grid place-items-center rounded-full hover:bg-surface-sunken text-muted-foreground"
                  title="Collapse panel"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={contactsQuery}
                  onChange={(e) => setContactsQuery(e.target.value)}
                  placeholder="Search contacts…"
                  className="w-full h-9 pl-9 pr-3 rounded-full bg-surface-sunken border-0 outline-none text-sm placeholder:text-muted-foreground"
                />
              </div>
              {!profileSelection && (
              <div className="mt-3 flex items-center gap-1 bg-surface-sunken rounded-full p-1">
                {(["investors", "founders"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setContactsTab(tab)}
                    className={`flex-1 text-xs px-3 py-1 rounded-full capitalize transition-colors ${
                      contactsTab === tab
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab} ({tab === "investors" ? filteredContactInvestors.length : filteredContactFounders.length})
                  </button>
                ))}
              </div>
              )}
            </div>

            {profileSelection ? (
              <ContactProfile
                selection={profileSelection}
                alerts={alerts}
                investorById={investorById}
                onBack={() => { setProfileId(null); setSelectedId(null); }}
                onOpenConnections={(id) => navigate(`/connections/${id}`)}
                onOpenDossier={(id) => navigate(`/founder/${id}`)}
              />
            ) : (
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {contactsTab === "investors" &&
                filteredContactInvestors.map((inv) => {
                  const isActive = selectedId === inv.id;
                  return (
                    <button
                      key={inv.id}
                      onClick={() => openContact(inv.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                        isActive
                          ? "bg-accent-indigo-soft"
                          : "hover:bg-surface-sunken"
                      }`}
                    >
                      <EntityAvatar
                        githubUsername={inv.githubUsername}
                        name={inv.name}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{inv.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {inv.firm ?? inv.title}
                        </div>
                      </div>
                      <TierBadge tier={inv.tier} />
                    </button>
                  );
                })}
              {contactsTab === "founders" &&
                filteredContactFounders.map((f) => {
                  const isActive = selectedId === f.id;
                  const isTop = f.id === topPickId && highlightTopPick;
                  return (
                    <button
                      key={f.id}
                      onClick={() => openContact(f.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                        isActive
                          ? "bg-accent-indigo-soft"
                          : "hover:bg-surface-sunken"
                      }`}
                    >
                      <div className={isTop ? "ring-2 ring-[hsl(var(--destructive))] rounded-xl" : ""}>
                        <EntityAvatar
                          githubUsername={f.githubUsername}
                          name={f.name}
                          size={36}
                          rounded="xl"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {f.name}
                          {isTop && (
                            <span className="text-[8px] uppercase tracking-wider font-medium px-1 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]">
                              Top
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {f.company ?? f.location}
                        </div>
                      </div>
                    </button>
                  );
                })}
              {((contactsTab === "investors" && filteredContactInvestors.length === 0) ||
                (contactsTab === "founders" && filteredContactFounders.length === 0)) && (
                <div className="text-center text-xs text-muted-foreground py-8">
                  No contacts.
                </div>
              )}
            </div>
            )}
          </>
        )}
      </aside>

      {/* Mobile backdrop when contacts open */}
      {contactsOpen && (
        <button
          aria-label="Close contacts"
          onClick={() => setContactsOpen(false)}
          className="md:hidden fixed inset-0 z-20 bg-foreground/30 animate-fade-in"
        />
      )}

      {!contactsOpen && (
        <button
          onClick={() => setContactsOpen(true)}
          className="absolute top-3 left-3 md:top-4 md:left-4 z-30 h-9 w-9 grid place-items-center rounded-full bg-background border border-border shadow-sm text-foreground hover:bg-surface-sunken"
          title="Show contacts"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div className="relative flex-1 min-w-0">
      {/* Floating toolbar */}
      <div className="absolute top-3 left-3 right-3 md:top-4 md:left-4 md:right-4 z-10 flex items-start justify-between gap-2 md:gap-3 pointer-events-none">
        <div />

        <div className="pointer-events-auto flex items-center gap-1.5 md:gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 text-xs px-2.5 md:px-3 py-1.5 rounded-full border border-border bg-background text-foreground hover:bg-surface-sunken transition-colors"
                title="Filter signal platforms"
              >
                <Filter className="h-3 w-3" />
                <span className="hidden md:inline">Platforms</span>
                <span className="text-muted-foreground tabular-nums hidden md:inline">
                  ({(["twitter", "linkedin", "github"] as SignalPlatform[]).filter((p) => platforms[p]).length}/3)
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:inline" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                Filter by platform
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["twitter", "linkedin", "github"] as SignalPlatform[]).map((p) => (
                <DropdownMenuCheckboxItem
                  key={p}
                  checked={platforms[p]}
                  onCheckedChange={() => togglePlatform(p)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  <SignalIcon platform={p} className="mr-2 h-3 w-3" />
                  {platformLabel(p)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 text-xs px-2.5 md:px-3 py-1.5 rounded-full border border-border bg-background text-foreground hover:bg-surface-sunken transition-colors"
                title="Filter investor tiers"
              >
                <Users className="h-3 w-3" />
                <span className="hidden md:inline">Investors</span>
                <span className="text-muted-foreground tabular-nums hidden md:inline">
                  ({(["vc", "microvc", "angel"] as InvestorTier[]).filter((t) => tiers[t]).length}/3)
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:inline" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                Filter by tier
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["vc", "microvc", "angel"] as InvestorTier[]).map((t) => (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={tiers[t]}
                  onCheckedChange={() => toggleTier(t)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  <span
                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${tierMeta[t].dot}`}
                  />
                  {tierMeta[t].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() =>
              setHighlightTopPick((v) => {
                const next = !v;
                if (next) focusTopPick();
                return next;
              })
            }
            title={
              highlightTopPick
                ? "Show top pick in normal color"
                : "Highlight top pick in red"
            }
            className={`flex items-center gap-1.5 text-xs px-2.5 md:px-3 py-1.5 rounded-full border transition-colors ${
              highlightTopPick
                ? "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] border-[hsl(var(--destructive))]"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <Flame className="h-3 w-3" />
            <span className="hidden md:inline">Top pick</span>
          </button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 hidden md:inline-flex"
            onClick={() => fitView({ padding: 0.2, duration: 400 })}
          >
            <Maximize2 className="h-3.5 w-3.5" /> Fit
          </Button>
        </div>
      </div>

      {/* Stats footer */}
      <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4 z-10 bg-background border border-border rounded-full shadow-sm flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">{totalNodes}</span>
          <span className="text-muted-foreground hidden sm:inline">nodes</span>
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">{totalEdges}</span>
          <span className="text-muted-foreground hidden sm:inline">edges</span>
        </span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedId(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--border))" />
        <Controls
          showInteractive={false}
          className="!bg-background !border !border-border !rounded-full !shadow-sm overflow-hidden !hidden md:!flex"
        />
      </ReactFlow>

      {isLoading ? (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken/40 z-[5] animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-40 w-72 rounded-2xl" />
            <p className="text-xs text-muted-foreground">Loading the convergence graph…</p>
          </div>
        </div>
      ) : isError ? (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken/40 z-[5] animate-fade-in">
          <div className="text-center max-w-sm px-4">
            <p className="text-sm font-medium">Couldn't reach the backend.</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {String(alertsQuery.error ?? investorsQuery.error ?? foundersQuery.error)}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => { alertsQuery.refetch(); investorsQuery.refetch(); foundersQuery.refetch(); }}>Retry</Button>
              {offline.canEnable && (
                <Button size="sm" variant="outline" onClick={offline.enable}>Use offline data</Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

export default function Explore() {
  return (
    <ReactFlowProvider>
      <ExploreInner />
    </ReactFlowProvider>
  );
}
