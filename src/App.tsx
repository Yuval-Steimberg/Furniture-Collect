import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { PageTransition } from "@/components/PageTransition";
import { SetupScreen } from "@/components/SetupScreen";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";
import NewApartment from "./pages/NewApartment";
import ApartmentDetail from "./pages/ApartmentDetail";
import Statistics from "./pages/Statistics";
import SustainabilityReport from "./pages/SustainabilityReport";
import GlobalStatistics from "./pages/GlobalStatistics";
import ProjectUsers from "./pages/ProjectUsers";
import UserManagement from "./pages/UserManagement";
import AcceptInvitation from "./pages/AcceptInvitation";
import DataExplorer from "./pages/DataExplorer";
import ManagerDashboard from "./pages/ManagerDashboard";
import CollectionPrep from "./pages/CollectionPrep";
import LiveReport from "./pages/LiveReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Routes wrapped in AnimatePresence so each navigation fades the exiting
// page and animates the new one in. Keyed by pathname so sibling routes
// trigger the animation; sub-routes of the same pattern re-use the same
// tree (no unnecessary remount).
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<AppLayout><PageTransition><Dashboard /></PageTransition></AppLayout>} />
        <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
        <Route path="/accept-invitation" element={<PageTransition><AcceptInvitation /></PageTransition>} />
        <Route path="/projects" element={<AppLayout><PageTransition><Projects /></PageTransition></AppLayout>} />
        <Route path="/projects/new" element={<AppLayout><PageTransition><NewProject /></PageTransition></AppLayout>} />
        <Route path="/projects/:projectId" element={<AppLayout><PageTransition><ProjectDetail /></PageTransition></AppLayout>} />
        <Route path="/projects/:projectId/apartments/new" element={<AppLayout><PageTransition><NewApartment /></PageTransition></AppLayout>} />
        <Route path="/projects/:projectId/apartments/:apartmentId" element={<AppLayout><PageTransition><ApartmentDetail /></PageTransition></AppLayout>} />
        <Route path="/projects/:projectId/statistics" element={<AppLayout><PageTransition><Statistics /></PageTransition></AppLayout>} />
        <Route path="/projects/:projectId/report" element={<PageTransition><SustainabilityReport /></PageTransition>} />
        <Route path="/share/:projectId" element={<PageTransition><LiveReport /></PageTransition>} />
        <Route path="/projects/:projectId/users" element={<AppLayout><PageTransition><ProjectUsers /></PageTransition></AppLayout>} />
        <Route path="/projects/:projectId/preparation" element={<AppLayout><PageTransition><CollectionPrep /></PageTransition></AppLayout>} />
        <Route path="/global-statistics" element={<AppLayout><PageTransition><GlobalStatistics /></PageTransition></AppLayout>} />
        <Route path="/data-explorer" element={<AppLayout><PageTransition><DataExplorer /></PageTransition></AppLayout>} />
        <Route path="/manager-dashboard" element={<AppLayout><PageTransition><ManagerDashboard /></PageTransition></AppLayout>} />
        <Route path="/user-management" element={<AppLayout><PageTransition><UserManagement /></PageTransition></AppLayout>} />
        <Route path="*" element={<AppLayout><PageTransition><NotFound /></PageTransition></AppLayout>} />
      </Routes>
    </AnimatePresence>
  );
}

const App = () => {
  // Short-circuit to a friendly setup screen if env is missing — avoids
  // a white-screen crash when the Supabase client stub is used.
  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
