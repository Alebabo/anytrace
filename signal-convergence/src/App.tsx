import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/converge/AppLayout";
import Index from "./pages/Index.tsx";
import Watchlist from "./pages/Watchlist.tsx";
import FounderDetail from "./pages/FounderDetail.tsx";
import Settings from "./pages/Settings.tsx";
import Explore from "./pages/Explore.tsx";
import Signals from "./pages/Signals.tsx";
import Recommended from "./pages/Recommended.tsx";
import Connections from "./pages/Connections.tsx";
import Anytrace from "./pages/Anytrace.tsx";
import Dossier from "./pages/Dossier.tsx";
import DossiersList from "./pages/DossiersList.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/recommended" element={<Recommended />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/founder/:founderId" element={<FounderDetail />} />
            <Route path="/connections/:id" element={<Connections />} />
            <Route path="/anytrace" element={<Anytrace />} />
            <Route path="/dossier" element={<DossiersList />} />
            <Route path="/dossier/:dossierId" element={<Dossier />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
