import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/anytrace/AppLayout";

const MainDashboard = lazy(() => import("@/pages/Index"));
const GraphPage = lazy(() => import("@/pages/Explore"));
const ActivitiesPage = lazy(() => import("@/pages/Activities"));
const WatchlistPage = lazy(() => import("@/pages/Watchlist"));
const TopPicksPage = lazy(() => import("@/pages/TopPicks"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const ConnectionDetail = lazy(() => import("@/pages/Connections"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AppFallback = () => (
  <div className="min-h-screen bg-background px-4 py-8 md:px-8">
    <div className="mx-auto max-w-6xl space-y-4">
      <Skeleton className="h-14 w-40 rounded-full" />
      <Skeleton className="h-40 w-full rounded-[28px]" />
      <Skeleton className="h-64 w-full rounded-[28px]" />
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<AppFallback />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<MainDashboard />} />
              <Route path="/graph" element={<GraphPage />} />
              <Route path="/activities" element={<ActivitiesPage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/top-picks" element={<TopPicksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/connections/:id" element={<ConnectionDetail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
