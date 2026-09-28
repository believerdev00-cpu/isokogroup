import { Navigate, Route, Routes } from "react-router-dom";
import StaffLayout from "./StaffLayout";
import { TravelCustomers, TravelDashboard, TravelMore, TravelPayments, TravelRequests, TravelTrips } from "./travel/TravelStaff";
import TripBuilder from "./travel/TripBuilder";
import { ConsultancyDashboard, ConsultancyDetail, ConsultancyRequests, ConsultancyServices } from "./consultancy/ConsultancyStaff";
import { DataDashboard, DataDetail, DataProjects, DataServices } from "./data/DataStaff";
import {
  MediaCategories, MediaEvents, MediaFashion, MediaFilms, MediaLive, MediaOverview, MediaPeople, MediaPodcasts, MediaWork,
} from "./media/MediaAdmin";

/** /staff/*: the Isoko Workspace for Travel, Consultancy, Data Analysis and Media staff. */
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
        <Route path="media" element={<MediaOverview />} />
        <Route path="media/films" element={<MediaFilms />} />
        <Route path="media/podcasts" element={<MediaPodcasts />} />
        <Route path="media/people" element={<MediaPeople />} />
        <Route path="media/work" element={<MediaWork />} />
        <Route path="media/fashion" element={<MediaFashion />} />
        <Route path="media/live" element={<MediaLive />} />
        <Route path="media/events" element={<MediaEvents />} />
        <Route path="media/categories" element={<MediaCategories />} />
      </Route>
    </Routes>
  );
}
