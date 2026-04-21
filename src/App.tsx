import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";
import NewApartment from "./pages/NewApartment";
import ApartmentDetail from "./pages/ApartmentDetail";
import Statistics from "./pages/Statistics";
import GlobalStatistics from "./pages/GlobalStatistics";
import ProjectUsers from "./pages/ProjectUsers";
import UserManagement from "./pages/UserManagement";
import AcceptInvitation from "./pages/AcceptInvitation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
          <Route path="/projects" element={<AppLayout><Projects /></AppLayout>} />
          <Route path="/projects/new" element={<AppLayout><NewProject /></AppLayout>} />
          <Route path="/projects/:projectId" element={<AppLayout><ProjectDetail /></AppLayout>} />
          <Route path="/projects/:projectId/apartments/new" element={<AppLayout><NewApartment /></AppLayout>} />
          <Route path="/projects/:projectId/apartments/:apartmentId" element={<AppLayout><ApartmentDetail /></AppLayout>} />
          <Route path="/projects/:projectId/statistics" element={<AppLayout><Statistics /></AppLayout>} />
          <Route path="/projects/:projectId/users" element={<AppLayout><ProjectUsers /></AppLayout>} />
          <Route path="/global-statistics" element={<AppLayout><GlobalStatistics /></AppLayout>} />
          <Route path="/user-management" element={<AppLayout><UserManagement /></AppLayout>} />
          <Route path="*" element={<AppLayout><NotFound /></AppLayout>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
