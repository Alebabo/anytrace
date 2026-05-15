import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Settings,
  Menu,
  Network,
  Activity,
  Sparkles,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import anytraceLogo from "@/assets/anytrace-logo.png";
import { AccessBadge } from "@/components/anytrace/AccessBadge";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Sparkles;
};

const nav: NavItem[] = [
  { to: "/triage", label: "Founder Pipeline", icon: Sparkles },
  { to: "/activities", label: "Source History", icon: Activity },
  { to: "/graph", label: "Graph", icon: Network },
  { to: "/watchlist", label: "Watchlist", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const active = nav.find((item) => (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)));

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const NavList = ({
    onItemClick,
    collapsed = false,
  }: {
    onItemClick?: () => void;
    collapsed?: boolean;
  }) => (
    <nav className="flex flex-1 flex-col space-y-0.5 px-3 py-2">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={onItemClick}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            `group flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
              isActive
                ? "bg-sidebar-accent font-medium text-foreground"
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
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? "w-[84px]" : "w-72"
        }`}
      >
        <div className="flex h-full w-full flex-col">
          <div className={`border-b border-sidebar-border ${sidebarCollapsed ? "px-3 py-4" : "px-5 py-5"}`}>
            <div className={`flex items-start ${sidebarCollapsed ? "justify-center" : "justify-between"} gap-3`}>
              <Link
                to="/"
                className={`min-w-0 ${sidebarCollapsed ? "flex items-center justify-center" : "flex flex-1 items-center"}`}
                aria-label="Anytrace"
              >
                <img
                  src={anytraceLogo}
                  alt="Anytrace"
                  className={`${sidebarCollapsed ? "h-10" : "h-14"} w-auto shrink-0 object-contain [filter:invert(1)_brightness(0.15)]`}
                />
              </Link>
              {!sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-label="Collapse sidebar"
                  className="h-9 w-9 shrink-0 rounded-full border border-sidebar-border bg-background/70"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              )}
            </div>

            {sidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label="Expand sidebar"
                className="mt-3 h-9 w-9 rounded-full border border-sidebar-border bg-background/70"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "px-2 py-4" : "px-4 py-5"}`}>
            <NavList collapsed={sidebarCollapsed} />
          </div>

          <div className={`${sidebarCollapsed ? "px-2 pb-4" : "px-4 pb-5"}`}>
            {!sidebarCollapsed ? (
              <div className="rounded-2xl border border-sidebar-border bg-background/70 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-sidebar-foreground/60">Status</div>
                <div className="mt-2 text-sm text-sidebar-foreground">Founder pipeline ready. Evidence loaded.</div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-sidebar-border bg-background/70 text-[10px] font-semibold tracking-[0.22em] text-sidebar-foreground/70">
                  AT
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background px-3 md:h-16 md:gap-4 md:px-8">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
              <Link to="/" className="flex h-20 items-center justify-center px-4" aria-label="Anytrace">
                <img
                  src={anytraceLogo}
                  alt="Anytrace"
                  className="h-12 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
                />
              </Link>
              <NavList onItemClick={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground md:flex-none">
            {active?.label ?? "Anytrace"}
          </h1>
          <div className="hidden sm:block">
            <AccessBadge />
          </div>
          <div className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-xs font-medium text-background">
            AT
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <div className="border-b border-border bg-background px-3 py-2 sm:hidden">
            <AccessBadge />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
