import { useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, ExternalLink, Search, Sparkles, FileText, Trophy, Banknote, Github, Rocket, RefreshCw, Loader2, Linkedin, Twitter, Globe, Mic, Newspaper, Zap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  CONFIDENCE_LEVELS,
  DATE_RANGES,
  GEOGRAPHIES,
  SIGNAL_KINDS,
  type FeedSignal,
  type SignalConfidence,
  type SignalKind,
} from "@/data/signals";
import { formatRelative } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useInvestors } from "@/hooks/useApi";
import type { Investor } from "@/data/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PplxPlatform = "twitter" | "linkedin" | "github" | "web" | "podcast" | "news" | "other";
interface PplxSignal {
  platform: PplxPlatform;
  action: string;
  target: string;
  url: string;
  occurredAt: string | null;
  evidence: string;
}
interface PplxResponse {
  investorName: string;
  recency: string;
  summary: string;
  signals: PplxSignal[];
  citations: string[];
  generatedAt: string;
}

const platformIcon: Record<PplxPlatform, typeof Twitter> = {
  twitter: Twitter,
  linkedin: Linkedin,
  github: Github,
  web: Globe,
  podcast: Mic,
  news: Newspaper,
  other: Zap,
};

const kindIcon: Record<SignalKind, typeof Trophy> = {
  "Hackathon winner": Trophy,
  "Seed round": Banknote,
  "Pre-seed round": Banknote,
  Publication: FileText,
  "Open source traction": Github,
  "Product launch": Rocket,
};

const confidenceLabel: Record<SignalConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

function withinRange(iso: string, range: string): boolean {
  if (range === "All time") return true;
  const diffDays = (Date.now() - +new Date(iso)) / 86400000;
  if (range === "24h") return diffDays <= 1;
  if (range === "7d") return diffDays <= 7;
  if (range === "30d") return diffDays <= 30;
  return true;
}

export default function Signals() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [range, setRange] = useState<string>("7d");
  const [geo, setGeo] = useState<string>("All");
  const [confidence, setConfidence] = useState<string>("all");
  const [active, setActive] = useState<FeedSignal | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [signals, setSignals] = useState<FeedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Perplexity investor search
  const investorsQuery = useInvestors();
  const investors = (investorsQuery.data ?? []) as Investor[];
  const [investorQuery, setInvestorQuery] = useState<string>("");
  const [investorPickerOpen, setInvestorPickerOpen] = useState(false);
  const [pplxRecency, setPplxRecency] = useState<"day" | "week" | "month" | "year">("month");
  const [pplxLoading, setPplxLoading] = useState(false);
  const [pplxResult, setPplxResult] = useState<PplxResponse | null>(null);

  const filteredInvestors = useMemo(() => {
    const q = investorQuery.trim().toLowerCase();
    if (!q) return investors.slice(0, 50);
    return investors
      .filter((i) =>
        [i.name, i.firm ?? "", i.title ?? ""].join(" ").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [investors, investorQuery]);

  const exactMatch = useMemo(() => {
    const q = investorQuery.trim().toLowerCase();
    if (!q) return null;
    return investors.find((i) => i.name.toLowerCase() === q) ?? null;
  }, [investors, investorQuery]);

  const runPplxSearch = async (name: string, context?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Type a name first", variant: "destructive" });
      return;
    }
    setInvestorPickerOpen(false);
    setPplxLoading(true);
    setPplxResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("investor-signal-search", {
        body: { investorName: trimmed, investorContext: context, recency: pplxRecency },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPplxResult(data as PplxResponse);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Search failed", description: msg, variant: "destructive" });
    } finally {
      setPplxLoading(false);
    }
  };

  const handleSearchClick = () => {
    const q = investorQuery.trim();
    if (!q) {
      toast({ title: "Type a name first", variant: "destructive" });
      return;
    }
    const match =
      investors.find((i) => i.name.toLowerCase() === q.toLowerCase()) ??
      investors.find((i) => i.name.toLowerCase().includes(q.toLowerCase()));
    if (match) {
      setInvestorQuery(match.name);
      runPplxSearch(match.name, [match.title, match.firm].filter(Boolean).join(", "));
    } else {
      runPplxSearch(q);
    }
  };

  const loadSignals = async () => {
    const { data, error } = await supabase
      .from("signals")
      .select("*")
      .order("observed_at", { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: "Failed to load signals", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapped: FeedSignal[] = (data ?? []).map((row: any) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      entity: row.entity,
      summary: row.summary,
      source: row.source,
      sourceUrl: row.source_url,
      observedAt: row.observed_at,
      confidence: row.confidence,
      geography: row.geography,
      tags: row.tags ?? [],
      evidence: row.evidence_snippet,
      whyItMatters: row.why_matters,
      personName: row.person_name ?? "",
      personRole: row.person_role ?? "",
      company: row.company ?? "",
      imageUrl: row.image_url ?? "",
    }));
    setSignals(mapped);
    setLoading(false);
  };

  useEffect(() => {
    loadSignals();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("signals-perplexity", {
        body: {},
      });
      if (error) throw error;
      const inserted = data?.total_inserted ?? 0;
      const fetched = data?.total_fetched ?? 0;
      toast({
        title: inserted > 0 ? "Signals refreshed" : "No new signals",
        description:
          inserted > 0
            ? `${inserted} fresh founder/maker signals from the last 7 days.`
            : "No new founder/maker signals surfaced this round. Try again in a bit.",
      });
      await loadSignals();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Refresh failed", description: msg, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return signals.filter((s) => {
      if (kind !== "all" && s.kind !== kind) return false;
      if (geo !== "All" && s.geography !== geo) return false;
      if (confidence !== "all" && s.confidence !== confidence) return false;
      if (!withinRange(s.observedAt, range)) return false;
      if (!q) return true;
      return (
        s.personName.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.entity.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q)
      );
    });
  }, [query, kind, range, geo, confidence, signals]);

  const toggleSave = (id: string) =>
    setSaved((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-5xl leading-[1.05]">Signals</h2>
          <p className="text-sm text-muted-foreground mt-3 text-pretty max-w-xl leading-relaxed">
            People-first feed: identified founders, makers, and hackathon winners across HN funding, Product Hunt, GitHub solo makers, and confirmed hackathon results.
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="gap-2 shrink-0">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {refreshing ? "Fetching…" : "Refresh"}
        </Button>
      </div>

      {/* Perplexity investor search */}
      <div className="rounded-3xl border border-border bg-[hsl(54_95%_88%)] p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-medium">Search investor activity</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Pick a watchlist investor — we scour Twitter, LinkedIn, GitHub, podcasts and news for what they've publicly engaged with recently.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={investorPickerOpen} onOpenChange={setInvestorPickerOpen}>
            <PopoverTrigger asChild>
              <div className="relative w-[280px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={investorQuery}
                  onChange={(e) => {
                    setInvestorQuery(e.target.value);
                    setInvestorPickerOpen(true);
                  }}
                  onFocus={() => setInvestorPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchClick();
                    }
                  }}
                  placeholder={
                    investorsQuery.isLoading
                      ? "Loading investors…"
                      : "Type a name — watchlist or anyone"
                  }
                  className="h-9 pl-9 pr-3 rounded-full bg-surface-sunken border-transparent text-xs focus-visible:bg-background"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent
              className="w-[300px] p-0"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="max-h-[260px] overflow-y-auto py-1">
                {filteredInvestors.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Watchlist
                    </div>
                    {filteredInvestors.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setInvestorQuery(i.name);
                          setInvestorPickerOpen(false);
                          runPplxSearch(i.name, [i.title, i.firm].filter(Boolean).join(", "));
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-sunken transition-colors"
                      >
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            investorQuery.trim().toLowerCase() === i.name.toLowerCase()
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <span className="truncate">
                          {i.name}
                          {i.firm && (
                            <span className="text-muted-foreground"> · {i.firm}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {investorQuery.trim() && !exactMatch && (
                  <>
                    {filteredInvestors.length > 0 && (
                      <div className="my-1 border-t border-border" />
                    )}
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Search the web
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runPplxSearch(investorQuery.trim())}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-sunken transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      <span className="truncate">
                        Search the web for{" "}
                        <span className="font-medium">"{investorQuery.trim()}"</span>
                      </span>
                    </button>
                  </>
                )}

                {!investorQuery.trim() && filteredInvestors.length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    Start typing to search…
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Select value={pplxRecency} onValueChange={(v) => setPplxRecency(v as typeof pplxRecency)}>
            <SelectTrigger className="h-9 w-[140px] rounded-full bg-surface-sunken border-transparent text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day" className="text-xs">Last 24h</SelectItem>
              <SelectItem value="week" className="text-xs">Last week</SelectItem>
              <SelectItem value="month" className="text-xs">Last month</SelectItem>
              <SelectItem value="year" className="text-xs">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSearchClick} disabled={pplxLoading || !investorQuery.trim()} size="sm" className="gap-2 rounded-full">
            {pplxLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {pplxLoading ? "Searching…" : "Search"}
          </Button>
        </div>

        {pplxResult && (
          <div className="mt-5 space-y-4 animate-fade-in">
            {/* Summary */}
            <div className="rounded-2xl bg-surface-sunken border border-border p-4">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                Summary · {pplxResult.investorName}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{pplxResult.summary}</p>
            </div>

            {/* Signal cards */}
            {pplxResult.signals.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                  {pplxResult.signals.length} signal{pplxResult.signals.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-2">
                  {pplxResult.signals.map((s, idx) => {
                    const Icon = platformIcon[s.platform] ?? Zap;
                    return (
                      <li key={idx} className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-start gap-3">
                          <span className="h-8 w-8 rounded-lg bg-secondary grid place-items-center shrink-0">
                            <Icon className="h-3.5 w-3.5 text-foreground" strokeWidth={1.6} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.platform}</span>
                              <span className="text-sm font-medium text-foreground">{s.action}</span>
                              <span className="text-sm text-foreground truncate">{s.target}</span>
                              {s.occurredAt && (
                                <span className="text-[11px] text-muted-foreground ml-auto">{formatRelative(s.occurredAt)}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.evidence}</p>
                            {s.url && (
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-foreground hover:underline mt-1.5"
                              >
                                Source <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Citations fallback */}
            {pplxResult.citations.length > 0 && pplxResult.signals.length === 0 && (
              <div className="rounded-2xl bg-surface-sunken border border-border p-4">
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Citations</div>
                <ul className="space-y-1.5">
                  {pplxResult.citations.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-foreground hover:underline inline-flex items-center gap-1">
                        {url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search founder, company, or source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-10 rounded-full bg-surface-sunken border-transparent text-sm focus-visible:bg-background"
          />
        </div>
        <FilterSelect value={kind} onChange={setKind} placeholder="All types" options={[{ value: "all", label: "All types" }, ...SIGNAL_KINDS.map((k) => ({ value: k, label: k }))]} />
        <FilterSelect value={range} onChange={setRange} placeholder="Date" options={DATE_RANGES.map((r) => ({ value: r, label: r }))} />
        <FilterSelect value={geo} onChange={setGeo} placeholder="Geo" options={GEOGRAPHIES.map((g) => ({ value: g, label: g }))} />
        <FilterSelect
          value={confidence}
          onChange={setConfidence}
          placeholder="Confidence"
          options={CONFIDENCE_LEVELS.map((c) => ({ value: c, label: c === "all" ? "Any confidence" : c }))}
        />
      </div>

      {/* Feed */}
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        {loading && (
          <div className="p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading signals…
          </div>
        )}
        {!loading && signals.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No signals yet. Click <span className="font-medium text-foreground">Refresh</span> to fetch the latest from HN, GitHub and hackathons.
          </div>
        )}
        {filtered.map((s, idx) => {
          const Icon = kindIcon[s.kind];
          const isSaved = !!saved[s.id];
          return (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              className={`w-full text-left grid grid-cols-12 gap-4 px-5 py-4 items-start hover:bg-surface-sunken/60 transition-colors ${
                idx !== filtered.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="col-span-12 md:col-span-1 flex md:justify-center">
                {s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    className="h-12 w-12 rounded-xl object-cover bg-secondary"
                  />
                ) : (
                  <span className="h-12 w-12 rounded-xl bg-secondary grid place-items-center">
                    <Icon className="h-4 w-4 text-foreground" strokeWidth={1.6} />
                  </span>
                )}
              </div>
              <div className="col-span-12 md:col-span-9 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    {s.kind}
                  </span>
                  {s.personName && (
                    <>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="text-[11px] font-medium text-foreground">{s.personName}</span>
                      {s.personRole && (
                        <span className="text-[11px] text-muted-foreground">{s.personRole}</span>
                      )}
                    </>
                  )}
                  {s.company && (
                    <>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="text-[11px] text-muted-foreground">{s.company}</span>
                    </>
                  )}
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground">{s.geography}</span>
                </div>
                <div className="text-sm font-medium text-foreground leading-snug">{s.title}</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{s.summary}</p>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {s.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="col-span-12 md:col-span-2 flex md:flex-col md:items-end items-center gap-2 justify-between">
                <ConfidenceBadge level={s.confidence} />
                <div className="text-[11px] text-muted-foreground">{s.source}</div>
                <div className="text-[11px] text-muted-foreground">{formatRelative(s.observedAt)}</div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSave(s.id);
                  }}
                  className="h-7 w-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label={isSaved ? "Unsave" : "Save"}
                >
                  {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                </span>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">No signals match these filters.</div>
        )}
      </div>

      {/* Details drawer */}
      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                {active.imageUrl && (
                  <img
                    src={active.imageUrl}
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    className="w-full h-44 rounded-2xl object-cover bg-secondary mb-4"
                  />
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    {active.kind}
                  </span>
                  <ConfidenceBadge level={active.confidence} />
                </div>
                <SheetTitle className="text-xl leading-snug text-left">{active.title}</SheetTitle>
                <SheetDescription className="text-left">
                  {active.personName ? `${active.personName}${active.personRole ? ` · ${active.personRole}` : ""} · ` : ""}
                  {active.company || active.entity} · {active.geography} · {formatRelative(active.observedAt)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <Section label="Source">
                  <a
                    href={active.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
                  >
                    {active.source}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Section>

                <Section label="Evidence">
                  <p className="text-sm text-foreground leading-relaxed bg-surface-sunken rounded-xl p-3 border border-border">
                    {active.evidence}
                  </p>
                </Section>

                <Section label="Why this matters">
                  <p className="text-sm text-muted-foreground leading-relaxed flex gap-2">
                    <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />
                    {active.whyItMatters}
                  </p>
                </Section>

                <Section label="Tags">
                  <div className="flex items-center gap-2 flex-wrap">
                    {active.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </Section>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant={saved[active.id] ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => toggleSave(active.id)}
                  >
                    {saved[active.id] ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    {saved[active.id] ? "Saved" : "Save"}
                  </Button>
                  <Button
                    variant={reviewed[active.id] ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setReviewed((prev) => ({ ...prev, [active.id]: !prev[active.id] }))
                    }
                  >
                    {reviewed[active.id] ? "Reviewed" : "Mark reviewed"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[120px] rounded-full bg-surface-sunken border-transparent text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ConfidenceBadge({ level }: { level: SignalConfidence }) {
  const styles: Record<SignalConfidence, string> = {
    high: "bg-success/15 text-success border-success/20",
    medium: "bg-warning/15 text-warning border-warning/20",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles[level]}`}>
      {confidenceLabel[level]}
    </span>
  );
}
