import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  Menu,
  Network,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import anytraceLogo from "@/assets/anytrace-logo.png";
import { AccessBadge } from "@/components/anytrace/AccessBadge";
import { useAccessState } from "@/hooks/useAnytrace";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const nav: NavItem[] = [
  { to: "/", label: "Main", icon: LayoutDashboard },
  { to: "/graph", label: "Graph", icon: Network },
  { to: "/watchlist", label: "Watchlist", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const { session } = useAccessState();
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
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="relative flex h-20 items-center justify-center px-2">
          <Link to="/" className="flex items-center justify-center" aria-label="Anytrace">
            <img
              src={anytraceLogo}
              alt="Anytrace"
              className={`${sidebarCollapsed ? "h-8" : "h-16"} w-auto object-contain [filter:invert(1)_brightness(0.15)] transition-all`}
            />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute right-2 top-2 h-7 w-7"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <NavList collapsed={sidebarCollapsed} />

        {!sidebarCollapsed && (
          <div className="p-4">
            <div className="rounded-2xl border border-sidebar-border bg-background/60 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Anytrace</p>
              <p className="mt-2 text-xs leading-relaxed text-sidebar-foreground">
                Live VC data from Supabase plus manual backend triggers for the X scraper.
              </p>
            </div>
          </div>
        )}
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
                  className="h-14 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-xs font-medium text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {session?.user.email?.slice(0, 2).toUpperCase() ?? "AT"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{session?.user.email ?? "local@anytrace.app"}</span>
                <span className="text-[11px] font-normal text-muted-foreground">Local workspace</span>
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
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
