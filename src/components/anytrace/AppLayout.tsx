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
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import anytraceLogo from "@/assets/anytrace-logo.png";
import yellowLogo from "@/assets/yellow-logo.svg";
import projectALogo from "@/assets/project-a-logo.png";
import { AccessBadge } from "@/components/anytrace/AccessBadge";
import { useAccessState, useSignOut } from "@/hooks/useAnytrace";

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
  const signOut = useSignOut();
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
    <nav className="flex-1 flex flex-col px-3 py-2 space-y-0.5">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
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
    </nav>
  );

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside
        className={`hidden md:flex ${sidebarCollapsed ? "w-16" : "w-60"} shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 sticky top-0 h-screen overflow-hidden`}
      >
        <div className="relative flex items-center justify-center px-2 h-20">
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
            className="absolute top-2 right-2 h-7 w-7"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <NavList collapsed={sidebarCollapsed} />

        {!sidebarCollapsed && (
          <div className="p-4">
            <div className="rounded-2xl border border-sidebar-border bg-background/60 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Brand kept intact</p>
              <p className="text-xs text-sidebar-foreground mt-2 leading-relaxed">
                Same Anytrace identity, lighter product surface, tighter weekly signal review.
              </p>
              <div className="flex items-center justify-center gap-3 px-2 pt-4">
                <img
                  src={yellowLogo}
                  alt="Yellow"
                  className="h-5 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
                />
                <span className="text-muted-foreground text-sm">x</span>
                <img
                  src={projectALogo}
                  alt="Project A"
                  className="h-5 w-auto object-contain [filter:invert(1)_brightness(0.15)]"
                />
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 border-b border-border bg-background flex items-center px-3 md:px-8 gap-2 md:gap-4 sticky top-0 z-20">
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
          <AccessBadge />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className="h-9 w-9 rounded-full bg-foreground grid place-items-center text-background text-xs font-medium shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring ml-auto"
              >
                {session?.user.email?.slice(0, 2).toUpperCase() ?? "AT"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{session?.user.email ?? "Signed out"}</span>
                <span className="text-[11px] font-normal text-muted-foreground">Anytrace access</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!session || signOut.isPending} onClick={() => signOut.mutate()}>
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
