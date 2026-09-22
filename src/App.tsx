import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { SubscriptionProvider } from "@/lib/subscription";
import { ThemeProvider } from "@/lib/theme";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Logistics from "./pages/Logistics";
import LogisticsDelivery from "./pages/LogisticsDelivery";
import LogisticsHistory from "./pages/LogisticsHistory";
import Packaging from "./pages/Packaging";
import LogisticsSourcing from "./pages/LogisticsSourcing";
import LogisticsSupplyChain from "./pages/LogisticsSupplyChain";
import Software from "./pages/Software";
import SoftwareBooking from "./pages/SoftwareBooking";
// The Training Center is a whole app (public pages and portals); loaded on demand
const TrainingApp = lazy(() => import("./training/TrainingApp"));

// Travel Agency, Consultancy and Data Analysis: public pages, request forms, the
// customer's private request pages, and the staff workspace
const Services = lazy(() => import("./pages/Services"));
const TravelHome = lazy(() => import("./features/travel/TravelHome"));
const PlanTrip = lazy(() => import("./features/travel/PlanTrip"));
const TripPage = lazy(() => import("./features/travel/TripPage"));
const ConsultancyHome = lazy(() => import("./features/consultancy/ConsultancyHome"));
const ConsultancyRequest = lazy(() => import("./features/consultancy/ConsultancyRequest"));
const ConsultancyPage = lazy(() => import("./features/consultancy/ConsultancyPage"));
const DataHome = lazy(() => import("./features/data/DataHome"));
const DataRequest = lazy(() => import("./features/data/DataRequest"));
const DataPage = lazy(() => import("./features/data/DataPage"));
const StaffRoutes = lazy(() => import("./features/staff/StaffRoutes"));
const page = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>;
import Marketplace from "./pages/Marketplace";
import ELibrary from "./pages/ELibrary";
import Entertainment from "./pages/Entertainment";
import Login from "./pages/Login";
import BecomeSeller from "./pages/BecomeSeller";
import Admin from "./pages/Admin";
import SellerDashboard from "./pages/SellerDashboard";
import Subscription from "./pages/Subscription";
import Cart from "./pages/Cart";
import BuyerOrders from "./pages/BuyerOrders";
import Track from "./pages/Track";
import NotFound from "./pages/NotFound";
import About from "./pages/About";
import CustomerDashboard from "./pages/CustomerDashboard";
import DriverDashboard from "./pages/DriverDashboard";
import Insights from "./pages/Insights";

import PageTransition from "./components/PageTransition";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <PageTransition>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/become-seller" element={<BecomeSeller />} />
                  <Route path="/subscription" element={<Subscription />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/logistics" element={<ProtectedRoute><Logistics /></ProtectedRoute>} />
                  <Route path="/logistics/delivery" element={<ProtectedRoute><LogisticsDelivery /></ProtectedRoute>} />
                  <Route path="/logistics/history" element={<ProtectedRoute><LogisticsHistory /></ProtectedRoute>} />
                  <Route path="/logistics/packaging" element={<ProtectedRoute><Packaging /></ProtectedRoute>} />
                  <Route path="/logistics/sourcing" element={<ProtectedRoute><LogisticsSourcing /></ProtectedRoute>} />
                  <Route path="/logistics/supply-chain" element={<ProtectedRoute><LogisticsSupplyChain /></ProtectedRoute>} />
                  <Route path="/packaging" element={<Navigate to="/logistics/packaging" replace />} />
                  <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
                  <Route path="/e-library" element={<ProtectedRoute><ELibrary /></ProtectedRoute>} />
                  <Route path="/entertainment" element={<ProtectedRoute><Entertainment /></ProtectedRoute>} />
                  <Route path="/software" element={<Software />} />
                  <Route path="/software/booking" element={<SoftwareBooking />} />
                  <Route path="/training-center/*" element={<Suspense fallback={null}><TrainingApp /></Suspense>} />
                  <Route path="/software/academy" element={<Navigate to="/training-center" replace />} />
                  <Route path="/services" element={page(<Services />)} />
                  <Route path="/travel" element={page(<TravelHome />)} />
                  <Route path="/travel/plan" element={page(<PlanTrip />)} />
                  <Route path="/travel/trip/:token" element={page(<TripPage />)} />
                  <Route path="/consultancy" element={page(<ConsultancyHome />)} />
                  <Route path="/consultancy/request" element={page(<ConsultancyRequest />)} />
                  <Route path="/consultancy/r/:token" element={page(<ConsultancyPage />)} />
                  <Route path="/data-analysis" element={page(<DataHome />)} />
                  <Route path="/data-analysis/request" element={page(<DataRequest />)} />
                  <Route path="/data-analysis/r/:token" element={page(<DataPage />)} />
                  <Route path="/staff/*" element={page(<StaffRoutes />)} />
                  <Route path="/seller" element={<ProtectedRoute><SellerDashboard /></ProtectedRoute>} />
                  <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
                  <Route path="/my-orders" element={<ProtectedRoute><BuyerOrders /></ProtectedRoute>} />
                  <Route path="/dashboard" element={<ProtectedRoute><CustomerDashboard /></ProtectedRoute>} />
                  <Route path="/driver" element={<ProtectedRoute><DriverDashboard /></ProtectedRoute>} />
                  <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
                  
                  <Route path="/track" element={<Track />} />
                  <Route path="/track/:trackingNumber" element={<Track />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </PageTransition>
              </BrowserRouter>
            </TooltipProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
