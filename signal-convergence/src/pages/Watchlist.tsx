import { useEffect, useMemo, useState } from "react";
import { Github, Linkedin, Plus, Search, Trash2, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFounders } from "@/hooks/useApi";
import { useOfflineFallback } from "@/hooks/useOfflineFallback";
import { EntityAvatar } from "@/components/converge/EntityAvatar";
import type { Founder } from "@/data/types";
import { countryFlag, countryName, resolveCountryCode } from "@/lib/country";

function linkedinFor(f: Founder): { href: string; isDirect: boolean } {
  if (f.linkedinUrl) return { href: f.linkedinUrl, isDirect: true };
  const keywords = [f.name, f.company ?? ""].filter(Boolean).join(" ").trim();
  const href = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    keywords || f.name,
  )}`;
  return { href, isDirect: false };
}

export default function Watchlist() {
  const foundersQuery = useFounders();
  const offline = useOfflineFallback(foundersQuery);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const live = (offline.data?.founders ?? foundersQuery.data) as Founder[] | undefined;
    if (live) setFounders(live);
  }, [foundersQuery.data, offline.data]);

  const isLoading = foundersQuery.isLoading && !offline.data;
  const isError = foundersQuery.isError && !offline.data;

  const contacts: Founder[] = useMemo(
    () => founders.filter((f) => !removed.has(f.id)),
    [founders, removed],
  );

  const founderCode = (f: Founder) => resolveCountryCode(f.location);

  const countryOptions = useMemo(() => {
    const codes = new Set<string>();
    let hasUnknown = false;
    for (const f of contacts) {
      const code = founderCode(f);
      if (code) codes.add(code);
      else hasUnknown = true;
    }
    const list = Array.from(codes)
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { list, hasUnknown };
  }, [contacts]);

  const filtered = contacts.filter((f) => {
    if (countryFilter !== "all") {
      const code = founderCode(f);
      if (countryFilter === "unknown") {
        if (code) return false;
      } else if (code !== countryFilter) {
        return false;
      }
    }
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      (f.headline ?? "").toLowerCase().includes(q) ||
      (f.company ?? "").toLowerCase().includes(q)
    );
  });

  const handleAdd = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    const newFounder: Founder = {
      id: `fnd-${Date.now()}`,
      name,
      headline: String(data.get("headline") || "Founder"),
      location: String(data.get("location") || ""),
      company: String(data.get("company") || "") || undefined,
      linkedinUrl: String(data.get("linkedin") || "") || undefined,
      twitterHandle: String(data.get("twitter") || "").replace("@", "") || undefined,
      githubUsername: String(data.get("github") || "") || undefined,
      initials: name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
      avatarColor: "243 84% 60%",
    };
    setFounders((curr) => [newFounder, ...curr]);
    setOpen(false);
    form.reset();
  };

  return (
    <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-10">
        <div>
          <h2 className="font-serif text-5xl leading-[1.05]">VC Watchlist</h2>
          <p className="text-sm text-muted-foreground mt-3 text-pretty max-w-xl leading-relaxed">
            Founders you're tracking across LinkedIn, X, and GitHub. Add or remove to tune signal quality.
          </p>
        </div>
        <div className="flex items-center gap-8 text-right">
          <Stat label="Tracked" value={contacts.length} />
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Founder
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Founder</DialogTitle>
              <DialogDescription>
                Add a founder to your watchlist. We'll monitor their public activity on
                Twitter, LinkedIn, and GitHub for convergence with other watchlist members.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd(e.currentTarget);
              }}
              className="grid gap-3 pt-1"
            >
              <Field name="name" label="Full name" placeholder="Jane Doe" required />
              <Field name="headline" label="Headline" placeholder="Founder & CEO" />
              <Field name="company" label="Company (optional)" placeholder="Acme Inc." />
              <Field name="location" label="Location" placeholder="Berlin, DE" />
              <Field name="linkedin" label="LinkedIn URL" placeholder="https://linkedin.com/in/…" icon={<Linkedin className="h-3.5 w-3.5" />} />
              <Field name="twitter" label="Twitter handle" placeholder="@username" icon={<Twitter className="h-3.5 w-3.5" />} />
              <Field name="github" label="GitHub username" placeholder="username" icon={<Github className="h-3.5 w-3.5" />} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Add founder
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      {isLoading && (
        <div className="space-y-2 animate-fade-in">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      )}
      {isError && (
        <div className="rounded-3xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">Couldn't load watchlist.</p>
          <p className="text-xs text-muted-foreground mt-1.5">{String(foundersQuery.error)}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button size="sm" onClick={() => foundersQuery.refetch()}>Retry</Button>
            {offline.canEnable && (
              <Button size="sm" variant="outline" onClick={offline.enable}>Use offline data</Button>
            )}
          </div>
        </div>
      )}
      {!isLoading && !isError && (
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-border text-[11px] font-medium text-muted-foreground">
          <div className="col-span-5">Founder</div>
          <div className="col-span-3">Location</div>
          <div className="col-span-3">Handles</div>
          <div className="col-span-1 text-right" />
        </div>
        {filtered.map((f) => (
          <div
            key={f.id}
            className="grid grid-cols-12 gap-3 px-5 py-3.5 border-b border-border last:border-b-0 items-center hover:bg-surface-sunken/60 transition-colors"
          >
            <div className="col-span-5 flex items-center gap-3 min-w-0">
              <EntityAvatar
                githubUsername={f.githubUsername}
                name={f.name}
                size={32}
                rounded="xl"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {f.headline || f.company || "Founder"}
                </div>
              </div>
            </div>
            <div className="col-span-3">
              {(() => {
                const code = founderCode(f);
                if (!code) {
                  return <span className="text-xs text-muted-foreground">{f.location || "—"}</span>;
                }
                return (
                  <div className="inline-flex items-center gap-1.5 text-xs text-foreground" title={countryName(code)}>
                    <span className="text-base leading-none">{countryFlag(code)}</span>
                    <span>{countryName(code)}</span>
                  </div>
                );
              })()}
            </div>
            <div className="col-span-3 flex items-center gap-3">
              {(() => {
                const { href, isDirect } = linkedinFor(f);
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`hover:text-signal-linkedin ${
                      isDirect ? "text-muted-foreground" : "text-muted-foreground/50"
                    }`}
                    title={isDirect ? href : `Search LinkedIn for ${f.name}`}
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                );
              })()}
              {f.twitterHandle && (
                <a
                  href={`https://x.com/${f.twitterHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                >
                  <Twitter className="h-4 w-4" />
                  <span className="hidden lg:inline">@{f.twitterHandle}</span>
                </a>
              )}
              {f.githubUsername && (
                <a
                  href={`https://github.com/${f.githubUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                >
                  <Github className="h-4 w-4" />
                  <span className="hidden lg:inline">{f.githubUsername}</span>
                </a>
              )}
            </div>
            <div className="col-span-1 flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setRemoved((prev) => new Set(prev).add(f.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">No matches.</div>
        )}
      </div>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
  icon,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</div>
        )}
        <Input
          id={name}
          name={name}
          placeholder={placeholder}
          required={required}
          className={`h-9 text-sm ${icon ? "pl-9" : ""}`}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <div className="font-serif text-4xl tabular-nums leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1.5">
        {label}
      </div>
    </div>
  );
}
