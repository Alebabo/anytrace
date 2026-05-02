import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, Github, Linkedin, Search, Twitter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDossiers, useFounders } from "@/hooks/useApi";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import type { DossierSummary, Founder } from "@/data/types";
import { countryFlag, countryName, resolveCountryCode } from "@/lib/country";

interface Row {
  dossier: DossierSummary;
  founder?: Founder;
}

export default function DossiersList() {
  const dossiersQ = useDossiers();
  const foundersQ = useFounders();
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  const isLoading = dossiersQ.isLoading || foundersQ.isLoading;
  const isError = dossiersQ.isError || foundersQ.isError;

  const rows: Row[] = useMemo(() => {
    const dossiers = (dossiersQ.data ?? []).filter(
      (d) => d.classification === "founder",
    );
    const founders = foundersQ.data ?? [];
    const byId = new Map(founders.map((f) => [f.id, f]));
    const byName = new Map(founders.map((f) => [f.name.toLowerCase(), f]));
    return dossiers.map((d) => ({
      dossier: d,
      founder:
        byId.get(d.target_person_id) ??
        byName.get(d.target_name.toLowerCase()),
    }));
  }, [dossiersQ.data, foundersQ.data]);

  const founderCode = (r: Row) =>
    r.founder ? resolveCountryCode(r.founder.location) : undefined;

  const countryOptions = useMemo(() => {
    const codes = new Set<string>();
    let hasUnknown = false;
    for (const r of rows) {
      const code = founderCode(r);
      if (code) codes.add(code);
      else hasUnknown = true;
    }
    const list = Array.from(codes)
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { list, hasUnknown };
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (countryFilter !== "all") {
      const code = founderCode(r);
      if (countryFilter === "unknown") {
        if (code) return false;
      } else if (code !== countryFilter) {
        return false;
      }
    }
    const q = query.toLowerCase();
    if (!q) return true;
    const name = r.dossier.target_name.toLowerCase();
    const headline = (r.founder?.headline ?? "").toLowerCase();
    const company = (r.founder?.company ?? "").toLowerCase();
    return name.includes(q) || headline.includes(q) || company.includes(q);
  });

  return (
    <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-10">
        <div>
          <h2 className="font-serif text-5xl leading-[1.05]">
            Founder Dossiers <span className="text-muted-foreground">case files</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-3 text-pretty max-w-xl leading-relaxed">
            Vetted, evidence-grounded case files on founders. Every claim links to a primary source.
          </p>
        </div>
        <div className="flex items-center gap-8 text-right">
          <Stat label="Dossiers" value={rows.length} />
          <Stat label="Countries" value={countryOptions.list.length} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by name, company, or headline…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-10 rounded-full bg-surface-sunken border-transparent text-sm focus-visible:bg-background"
            />
          </div>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="h-10 w-[180px] rounded-full bg-surface-sunken border-transparent text-sm">
              <SelectValue placeholder="All countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countryOptions.list.map(({ code, name }) => (
                <SelectItem key={code} value={code}>
                  <span className="inline-flex items-center gap-2">
                    <span>{countryFlag(code)}</span>
                    <span>{name}</span>
                  </span>
                </SelectItem>
              ))}
              {countryOptions.hasUnknown && (
                <SelectItem value="unknown">Unknown</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2 animate-fade-in">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-3xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">Couldn't load dossiers.</p>
          <p className="text-xs text-muted-foreground mt-1.5">{String(dossiersQ.error ?? foundersQ.error)}</p>
          <Button size="sm" className="mt-4" onClick={() => dossiersQ.refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-3xl border border-border bg-card p-12 text-center">
          <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">No founder dossiers yet.</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="rounded-3xl border border-border bg-card overflow-hidden animate-fade-in">
          <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-border text-[11px] font-medium text-muted-foreground">
            <div className="col-span-5">Founder</div>
            <div className="col-span-3">Location</div>
            <div className="col-span-3">Handles</div>
            <div className="col-span-1 text-right" />
          </div>
          {filtered.map((r) => {
            const f = r.founder;
            const d = r.dossier;
            const code = founderCode(r);
            return (
              <Link
                key={d.id}
                to={`/dossier/${d.id}`}
                className="grid grid-cols-12 gap-3 px-5 py-3.5 border-b border-border last:border-b-0 items-center hover:bg-surface-sunken/60 transition-colors"
              >
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <EntityAvatar
                    githubUsername={f?.githubUsername}
                    name={d.target_name}
                    size={32}
                    rounded="xl"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.target_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {f?.headline || f?.company || "Founder"}
                    </div>
                  </div>
                </div>
                <div className="col-span-3">
                  {code ? (
                    <div
                      className="inline-flex items-center gap-1.5 text-xs text-foreground"
                      title={countryName(code)}
                    >
                      <span className="text-base leading-none">{countryFlag(code)}</span>
                      <span>{countryName(code)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{f?.location || "—"}</span>
                  )}
                </div>
                <div className="col-span-3 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {f?.linkedinUrl && (
                    <a
                      href={f.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-signal-linkedin"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                  {f?.twitterHandle && (
                    <a
                      href={`https://twitter.com/${f.twitterHandle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Twitter className="h-4 w-4" />
                    </a>
                  )}
                  {f?.githubUsername && (
                    <a
                      href={`https://github.com/${f.githubUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Github className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="col-span-1 flex justify-end">
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <div className="font-serif text-4xl tabular-nums leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}
