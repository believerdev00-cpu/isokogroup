import { Navigate, Route, Routes } from "react-router-dom";
import StaffLayout from "./StaffLayout";
import { TravelCustomers, TravelDashboard, TravelMore, TravelPayments, TravelRequests, TravelTrips } from "./travel/TravelStaff";
import TripBuilder from "./travel/TripBuilder";
import { ConsultancyDashboard, ConsultancyDetail, ConsultancyRequests, ConsultancyServices } from "./consultancy/ConsultancyStaff";
import { DataDashboard, DataDetail, DataProjects, DataServices } from "./data/DataStaff";
import {
  MediaCategories, MediaEvents, MediaFashion, MediaFilms, MediaLive, MediaOverview, MediaPeople, MediaPodcasts, MediaSeries, MediaWork,
} from "./media/MediaAdmin";
import { MediaFashionHub, MediaFashionRequests } from "./media/FashionHubAdmin";
import { ResearchCountries, ResearchItems, ResearchOverview, ResearchQuestions, ResearchRegions, ResearchTopics } from "./research/ResearchAdmin";
import { ResearchImports, ResearchReview } from "./research/ResearchFeeds";

/** /staff/*: the Isoko Workspace for Travel, Consultancy, Data Analysis, the Information Hub and Media staff. */
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
        <Route path="research" element={<ResearchOverview />} />
        <Route path="research/items" element={<ResearchItems />} />
        <Route path="research/review" element={<ResearchReview />} />
        <Route path="research/imports" element={<ResearchImports />} />
        <Route path="research/topics" element={<ResearchTopics />} />
        <Route path="research/countries" element={<ResearchCountries />} />
        <Route path="research/regions" element={<ResearchRegions />} />
        <Route path="research/questions" element={<ResearchQuestions />} />
        <Route path="media" element={<MediaOverview />} />
        <Route path="media/films" element={<MediaFilms />} />
        <Route path="media/series" element={<MediaSeries />} />
        <Route path="media/podcasts" element={<MediaPodcasts />} />
        <Route path="media/people" element={<MediaPeople />} />
        <Route path="media/work" element={<MediaWork />} />
        <Route path="media/fashion" element={<MediaFashion />} />
        <Route path="media/fashion-hub" element={<MediaFashionHub />} />
        <Route path="media/fashion-hub/requests" element={<MediaFashionRequests />} />
        <Route path="media/live" element={<MediaLive />} />
        <Route path="media/events" element={<MediaEvents />} />
        <Route path="media/categories" element={<MediaCategories />} />
      </Route>
    </Routes>
  );
}
