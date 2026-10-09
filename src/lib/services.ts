import {
  BarChart3, Box, Briefcase, CalendarCheck, Code2, Film, GraduationCap, MapPin, Network, Package, Plane,
  ShoppingBag, ShoppingCart, Store, Truck, BookOpen, BookOpenCheck, type LucideIcon,
} from "lucide-react";

// Every Isoko service in one place. The Service Hub, the header menu, search,
// breadcrumbs and the homepage all read this list, so they never disagree.

export type CategoryKey = "logistics" | "shopping" | "business" | "learning" | "travel";

export const CATEGORIES: { key: CategoryKey; title: string; blurb: string; icon: LucideIcon; tint: string }[] = [
  { key: "logistics", title: "Logistics & Supply", blurb: "Move, pack and source goods.", icon: Truck, tint: "from-red-600 to-rose-700" },
  { key: "shopping", title: "Shopping", blurb: "Buy from local sellers, or sell your own.", icon: ShoppingBag, tint: "from-orange-500 to-red-600" },
  { key: "business", title: "Business Services", blurb: "Advice, data and software for organizations.", icon: Briefcase, tint: "from-slate-700 to-blue-900" },
  { key: "learning", title: "Learning & Media", blurb: "Courses, books and entertainment.", icon: GraduationCap, tint: "from-indigo-600 to-violet-800" },
  { key: "travel", title: "Travel", blurb: "Your trip, anywhere in the world, taken care of.", icon: Plane, tint: "from-emerald-700 to-teal-800" },
];

export type Service = {
  id: string;
  name: string;
  description: string;
  category: CategoryKey;
  icon: LucideIcon;
  path: string;
  /** The one thing most people come to do */
  action: { label: string; path: string };
  /** Extra words people might search for */
  keywords: string;
};

export const SERVICES: Service[] = [
  {
    id: "logistics", name: "Logistics & Delivery", category: "logistics", icon: Truck, path: "/logistics",
    description: "Pickup and delivery worldwide, with live tracking.",
    action: { label: "Request a delivery", path: "/logistics/delivery" },
    keywords: "delivery courier transport send package parcel driver moto truck shipping",
  },
  {
    id: "track", name: "Track a Shipment", category: "logistics", icon: MapPin, path: "/track",
    description: "See where your package is with your tracking number.",
    action: { label: "Track now", path: "/track" },
    keywords: "tracking number where is my order status parcel",
  },
  {
    id: "packaging", name: "Packaging", category: "logistics", icon: Box, path: "/logistics/packaging",
    description: "Kraft, polythene and branded packaging for shops and businesses.",
    action: { label: "Order packaging", path: "/logistics/packaging" },
    keywords: "bags paper bags boxes branded kraft polythene wrap",
  },
  {
    id: "sourcing", name: "Sourcing & Procurement", category: "logistics", icon: ShoppingCart, path: "/logistics/sourcing",
    description: "We find and buy goods for you, locally and internationally.",
    action: { label: "Request sourcing", path: "/logistics/sourcing" },
    keywords: "buy for me import procurement suppliers china dubai",
  },
  {
    id: "supply-chain", name: "Supply Chain", category: "logistics", icon: Network, path: "/logistics/supply-chain",
    description: "Bonded shipments, customs, taxes and multi-stage tracking.",
    action: { label: "Explore supply chain", path: "/logistics/supply-chain" },
    keywords: "customs clearance import export bonded warehouse tax",
  },
  {
    id: "marketplace", name: "Marketplace", category: "shopping", icon: ShoppingBag, path: "/marketplace",
    description: "Buy from trusted local sellers, delivered by Isoko.",
    action: { label: "Start shopping", path: "/marketplace" },
    keywords: "shop buy products store market cart order",
  },
  {
    id: "sell", name: "Sell on Isoko", category: "shopping", icon: Store, path: "/become-seller",
    description: "Open your shop online and reach more customers.",
    action: { label: "Become a seller", path: "/become-seller" },
    keywords: "seller vendor open shop sell my products business",
  },
  {
    id: "consultancy", name: "Consultancy", category: "business", icon: Briefcase, path: "/consultancy",
    description: "Strategy, operations and technology advice for your organization.",
    action: { label: "Request consultancy", path: "/consultancy/request" },
    keywords: "advice consultant business strategy operations project management research",
  },
  {
    id: "data", name: "Data Analysis", category: "business", icon: BarChart3, path: "/data-analysis",
    description: "Turn your data into clear insights, reports and dashboards.",
    action: { label: "Request data analysis", path: "/data-analysis/request" },
    keywords: "data survey excel statistics dashboard report analytics cleaning",
  },
  {
    id: "software", name: "Software Development", category: "business", icon: Code2, path: "/software",
    description: "Websites, apps and systems built by the Isoko team.",
    action: { label: "See what we build", path: "/software" },
    keywords: "website app mobile system developer programming",
  },
  {
    id: "software-booking", name: "Book a Software Project", category: "business", icon: CalendarCheck, path: "/software/booking",
    description: "Tell us about your project and book a session.",
    action: { label: "Book a project", path: "/software/booking" },
    keywords: "booking meeting quote project website",
  },
  {
    id: "training", name: "Training Center", category: "learning", icon: GraduationCap, path: "/training-center",
    description: "Practical programs in tech, design and business, with certificates.",
    action: { label: "See programs", path: "/training-center/programs" },
    keywords: "course class school learn apply intake certificate student",
  },
  {
    id: "library", name: "E-Library", category: "learning", icon: BookOpen, path: "/e-library",
    description: "Read books, guides and study material anywhere.",
    action: { label: "Open the library", path: "/e-library" },
    keywords: "books read ebook pdf study",
  },
  {
    id: "research", name: "Information Hub", category: "learning", icon: BookOpenCheck, path: "/research",
    description: "Research, statistics, reports and findings from around the world.",
    action: { label: "Search the hub", path: "/research" },
    keywords: "research statistics data reports studies findings worldwide global rwanda information knowledge",
  },
  {
    id: "entertainment", name: "Entertainment", category: "learning", icon: Film, path: "/entertainment",
    description: "Isoko Studioz films, shorts and podcasts.",
    action: { label: "Watch now", path: "/entertainment" },
    keywords: "movies films videos podcast studio watch",
  },
  {
    id: "travel", name: "Travel Agency", category: "travel", icon: Plane, path: "/travel",
    description: "Airport pickup, hotel, transport and tours, one team for your whole trip.",
    action: { label: "Plan my trip", path: "/travel/plan" },
    keywords: "trip tourism hotel tour safari gorilla airport pickup visit worldwide international rwanda kigali",
  },
];

/** The service the homepage leads with. */
export const FEATURED_SERVICE_ID = "logistics";

/** Popular shortcuts shown first in the Service Hub and search. */
export const QUICK_ACCESS = ["track", "logistics", "marketplace", "travel", "training", "consultancy"];

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id);

/** Simple, forgiving search: every word must appear in the name, description or keywords. */
export function searchServices(query: string): Service[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (s: Service) => {
    const name = s.name.toLowerCase();
    const text = `${name} ${s.description} ${s.keywords} ${s.action.label}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) return 0;
    return words.reduce((n, w) => n + (name.startsWith(w) ? 4 : name.includes(w) ? 2 : 1), 0);
  };
  return SERVICES.map((s) => [s, score(s)] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
}

// ============== BREADCRUMBS ==============
const EXTRA_TRAIL: Record<string, string> = {
  "/about": "About",
  "/login": "Sign in",
  "/cart": "Cart",
  "/my-orders": "My orders",
  "/dashboard": "My dashboard",
  "/insights": "Insights",
  "/seller": "Seller dashboard",
  "/subscription": "Subscription",
  "/admin": "Admin",
  "/driver": "Driver",
  "/services": "Services",
  "/logistics/delivery": "Request a delivery",
  "/logistics/history": "Delivery history",
  "/travel/plan": "Plan my trip",
  "/consultancy/request": "Request",
  "/data-analysis/request": "Request",
  "/research/search": "Search",
  "/training-center/programs": "Programs",
  "/training-center/intakes": "Intakes",
  "/training-center/apply": "Apply",
  "/training-center/about": "About",
  "/training-center/contact": "Contact",
  "/training-center/login": "Portal sign in",
  "/training-center/application-status": "Application status",
  "/training-center/verify": "Verify a certificate",
};

export type Crumb = { label: string; path?: string };

/** Home › Services › Category › Service › page, from the current address. */
export function breadcrumbsFor(pathname: string): Crumb[] {
  if (pathname === "/") return [];
  const path = pathname.replace(/\/+$/, "") || "/";
  const service = [...SERVICES].sort((a, b) => b.path.length - a.path.length)
    .find((s) => path === s.path || path.startsWith(`${s.path}/`));
  const trail: Crumb[] = [{ label: "Home", path: "/" }];
  if (service) {
    const cat = CATEGORIES.find((c) => c.key === service.category)!;
    trail.push({ label: "Services", path: "/services" }, { label: cat.title, path: `/services#${cat.key}` });
    trail.push({ label: service.name, path: service.path });
    if (path !== service.path) {
      const label = EXTRA_TRAIL[path] ?? (/\/(trip|r)\/[0-9a-f]{20,}/.test(path) ? "Your request" : null)
        // the Information Hub's country, topic and item pages
        ?? (path.startsWith("/research/countries/") ? "Country" : path.startsWith("/research/topics/") ? "Topic" : path.startsWith("/research/") ? "Information" : null);
      if (label) trail.push({ label });
    }
  } else if (EXTRA_TRAIL[path]) {
    trail.push({ label: EXTRA_TRAIL[path] });
  } else {
    return [];
  }
  // The last crumb is the current page: no link
  const last = trail[trail.length - 1];
  trail[trail.length - 1] = { label: last.label };
  return trail;
}
