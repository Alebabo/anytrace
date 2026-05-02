import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Settings, Bell, Network, Newspaper, Menu, Rocket, PanelLeftClose, PanelLeftOpen, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import anytraceLogo from "@/assets/anytrace-logo.png";
import { LiveStatus } from "@/components/converge/LiveStatus";
import yellowLogo from "@/assets/yellow-logo.svg";
import projectALogo from "@/assets/project-a-logo.png";

type LatestSignal = {
  id: string;
  title: string;
  person_name: string;
  observed_at: string;
  source_url: string;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  dividerAfter?: boolean;
  pinBottom?: boolean;
};

const nav: NavItem[] = [
  { to: "/", label: "Today's Outreach", icon: LayoutDashboard, badge: "" },
  { to: "/explore", label: "Explore Graph", icon: Network },
  { to: "/signals", label: "Signals", icon: Newspaper, dividerAfter: true },
  { to: "/recommended", label: "Recommended", icon: Rocket },
  { to: "/dossier", label: "Founder Dossiers", icon: FileText },
  { to: "/watchlist", label: "VC Watchlist", icon: Users, dividerAfter: true },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/anytrace", label: "Anytrace", icon: Sparkles, pinBottom: true },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const active = nav.find((n) => (n.to === "/" ? pathname === "/" || pathname.startsWith("/founder") : pathname.startsWith(n.to)));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const latestSignalQuery = useQuery({
    queryKey: ["bell-latest-signal"],
    queryFn: async (): Promise<LatestSignal | null> => {
      const { data, error } = await supabase
        .from("signals")
        .select("id, title, person_name, observed_at, source_url")
        .order("observed_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as LatestSignal) ?? null;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const latest = latestSignalQuery.data;

  // Static older notification — Anton Osika's repo going viral.
  const antonNotif = {
    headline: "Anton Osika's repo lovable just went viral — 32k stars",
    sub: "GitHub trending",
    href: "https://github.com/lovable-dev/lovable",
  };
  const latestNotif = latest
    ? {
        headline: latest.person_name
          ? `${latest.person_name} — ${latest.title}`
          : latest.title,
        sub: `New signal · ${timeAgo(latest.observed_at)}`,
        href: latest.source_url || "/signals",
      }
    : null;

  // Notify graph (and other listeners) so they can re-center after the layout shifts.
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("app:sidebar-toggle"));
    }, 220);
    return () => clearTimeout(t);
  }, [sidebarCollapsed]);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const NavList = ({ onItemClick, collapsed = false }: { onItemClick?: () => void; collapsed?: boolean }) => (
    <nav className="flex-1 flex flex-col px-3 py-2 space-y-0.5">
      {nav.filter((i) => !i.pinBottom).map((item) => (
        <div key={item.to}>
          <NavLink
            to={item.to}
            end={item.to === "/"}
            onClick={onItemClick}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `group flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2 px-3 py-2 rounded-full text-sm transition-colors ${
                isActive || (item.to === "/" && pathname.startsWith("/founder"))
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              }`
            }
          >
            <span className="flex items-center gap-2.5">
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              {!collapsed && item.label}
            </span>
            {!collapsed && item.badge !== undefined && (
              <span className="h-2 w-2 rounded-full bg-[hsl(48_96%_60%)] shrink-0" aria-hidden />
            )}
          </NavLink>
          {item.dividerAfter && (
            <div className="my-2 mx-3 border-t border-sidebar-border/70" />
          )}
        </div>
      ))}

      {/* Pinned-to-bottom items */}
      <div className="mt-auto pt-2 space-y-0.5">
        <div className="mb-2 mx-3 border-t border-sidebar-border/70" />
        {nav.filter((i) => i.pinBottom).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onItemClick}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `group flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2 px-3 py-2 rounded-full text-sm transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              }`
            }
          >
            <span className="flex items-center gap-2.5">
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              {!collapsed && item.label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`hidden md:flex ${sidebarCollapsed ? "w-16" : "w-60"} shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 sticky top-0 h-screen overflow-hidden`}
      >
        <div className="relative flex items-center justify-center px-2 h-20">
          <Link to="/" className="flex items-center justify-center" aria-label="Anytrace">
            <img
              src={anytraceLogo}
              alt="Anytrace · Graph Insights"
              className={`${sidebarCollapsed ? "h-8" : "h-16"} w-auto object-contain [filter:invert(1)_brightness(0.15)] transition-all`}
            />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute top-2 right-2 h-7 w-7"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <NavList collapsed={sidebarCollapsed} />

        {!sidebarCollapsed && (
        <div className="p-4">
          <div className="flex items-center justify-center gap-3 px-2 py-3">
            <img
              src={yellowLogo}
              alt="Yellow"
              className="h-5 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
            />
            <span className="text-muted-foreground text-sm">×</span>
            <img
              src={projectALogo}
              alt="Project A"
              className="h-5 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
            />
          </div>
        </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 border-b border-border bg-background flex items-center px-3 md:px-8 gap-2 md:gap-4 sticky top-0 z-20">
          {/* Mobile menu trigger */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden shrink-0" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col bg-sidebar">
              <Link to="/" className="flex items-center justify-center px-4 h-20" aria-label="Anytrace">
                <img
                  src={anytraceLogo}
                  alt="Anytrace"
                  className="h-14 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
                />
              </Link>
              <NavList onItemClick={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <h1 className="text-sm font-medium text-muted-foreground truncate">{active?.label ?? "Anytrace"}</h1>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 relative shrink-0 ml-auto" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-accent-indigo" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notifications
                </p>
              </div>
              {latestNotif && (
                <a
                  href={latestNotif.href}
                  target={latestNotif.href.startsWith("http") ? "_blank" : undefined}
                  rel={latestNotif.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="flex gap-3 px-4 py-3 hover:bg-muted/60 transition-colors border-b border-border"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-accent-indigo shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug font-medium">
                      {latestNotif.headline}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{latestNotif.sub}</p>
                  </div>
                </a>
              )}
              <a
                href={antonNotif.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 px-4 py-3 hover:bg-muted/60 transition-colors"
              >
                <span className="mt-1 h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm leading-snug font-medium">
                    {antonNotif.headline}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{antonNotif.sub}</p>
                </div>
              </a>
            </PopoverContent>
          </Popover>
          <LiveStatus />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className="h-9 w-9 rounded-full bg-foreground grid place-items-center text-background text-xs font-medium shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                VC
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">VC</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Signed in
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
