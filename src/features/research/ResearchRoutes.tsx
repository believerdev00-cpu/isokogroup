import { Route, Routes } from "react-router-dom";
import HubHome from "./pages/Home";
import HubSearch from "./pages/Search";
import HubItem from "./pages/Item";
import HubCountry from "./pages/Country";
import HubTopic from "./pages/Topic";

/** /research/*: the ISOKO Information Hub. Public to browse; the engine answers questions. */
export default function ResearchRoutes() {
  return (
    <Routes>
      <Route index element={<HubHome />} />
      <Route path="search" element={<HubSearch />} />
      <Route path="countries/:slug" element={<HubCountry />} />
      <Route path="topics/:slug" element={<HubTopic />} />
      <Route path=":slug" element={<HubItem />} />
    </Routes>
  );
}
