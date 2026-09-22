import { Navigate, Route, Routes } from "react-router-dom";
import StaffLayout from "./StaffLayout";
import { TravelCustomers, TravelDashboard, TravelMore, TravelPayments, TravelRequests, TravelTrips } from "./travel/TravelStaff";
import TripBuilder from "./travel/TripBuilder";
import { ConsultancyDashboard, ConsultancyDetail, ConsultancyRequests, ConsultancyServices } from "./consultancy/ConsultancyStaff";
import { DataDashboard, DataDetail, DataProjects, DataServices } from "./data/DataStaff";

/** /staff/*: the Isoko Workspace for Travel, Consultancy and Data Analysis staff. */
export default function StaffRoutes() {
  return (
    <Routes>
      <Route element={<StaffLayout />}>
        <Route index element={<Navigate to="travel" replace />} />
        <Route path="travel" element={<TravelDashboard />} />
        <Route path="travel/requests" element={<TravelRequests />} />
        <Route path="travel/trips" element={<TravelTrips />} />
        <Route path="travel/customers" element={<TravelCustomers />} />
        <Route path="travel/payments" element={<TravelPayments />} />
        <Route path="travel/more" element={<TravelMore />} />
        <Route path="travel/trip/:id" element={<TripBuilder />} />
        <Route path="consultancy" element={<ConsultancyDashboard />} />
        <Route path="consultancy/requests" element={<ConsultancyRequests />} />
        <Route path="consultancy/services" element={<ConsultancyServices />} />
        <Route path="consultancy/:id" element={<ConsultancyDetail />} />
        <Route path="data" element={<DataDashboard />} />
        <Route path="data/projects" element={<DataProjects />} />
        <Route path="data/services" element={<DataServices />} />
        <Route path="data/:id" element={<DataDetail />} />
      </Route>
    </Routes>
  );
}
