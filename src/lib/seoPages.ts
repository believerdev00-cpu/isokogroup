// What search engines and link previews see for each public page. Plain data, no
// React or browser code: the build (vite.config.ts) reads it too, to write a real
// HTML file per page with its own title, description, canonical address and a
// visible heading, so crawlers that don't run JavaScript still see the page.
// The app applies the same entries at run time (components/RouteSeo.tsx).
//
// Adding a page here also needs a rewrite in vercel.json; seoRouting.test.ts checks.

export const SITE_ORIGIN = "https://www.isokogroups.com";
export const SITE_NAME = "ISOKO GROUP";

/** The site-wide fallback, also in index.html (the test keeps them equal). */
export const DEFAULT_TITLE = "ISOKO GROUP: logistics, marketplace and training in Kigali";
export const DEFAULT_DESCRIPTION =
  "One group in Kigali for logistics and packaging, an online marketplace, software, travel, consultancy, data analysis and the ISOKO Training Center.";

export type SeoPage = {
  /** the address, exactly as routed in App.tsx */
  path: string;
  /** without the site name: it is added as "Title · ISOKO GROUP" */
  title: string;
  description: string;
  /** shown in the page's HTML before the app starts, and to crawlers */
  heading: string;
  summary: string;
  /** short label for the links between pages in the generated HTML */
  label: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

export const ORGANIZATION_JSONLD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/favicon.png`,
  address: { "@type": "PostalAddress", addressLocality: "Kigali", addressCountry: "RW" },
  sameAs: ["https://www.instagram.com/isokogrou"],
};

const WEBSITE_JSONLD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_ORIGIN,
};

export const SEO_PAGES: SeoPage[] = [
  {
    path: "/",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    heading: "ISOKO GROUP",
    summary:
      "ISOKO GROUP brings together trusted services — logistics, packaging, marketplace, e-library, entertainment, and ISOKO Training Center — in one smart and connected ecosystem. We create practical solutions that make it easier for people and businesses to connect, learn, trade, create, and grow.",
    label: "Home",
    jsonLd: [ORGANIZATION_JSONLD, WEBSITE_JSONLD],
  },
  {
    path: "/about",
    title: "About us: built in Kigali, serving the world",
    description:
      "ISOKO GROUP brings logistics, a marketplace, learning and digital services together, run by one team from one office in Kimironko, Kigali.",
    heading: "About ISOKO GROUP",
    summary:
      "ISOKO GROUPS started with a simple observation: customers were juggling separate apps and contacts to send a parcel, order a product, find a book or get a website built. We set out to bring those services together — operated by one team, from one office in Kimironko, with one set of standards.",
    label: "About",
  },
  {
    path: "/services",
    title: "All Isoko services in one place",
    description:
      "Find an Isoko service by name or by what you need to get done: logistics, marketplace, software, travel, consultancy, data analysis, training and more.",
    heading: "Everything Isoko does, in one place",
    summary: "Find a service by name or by what you need to get done.",
    label: "Services",
  },
  {
    path: "/software",
    title: "Websites and apps built with you",
    description: "Build your website or app with Isoko. Book a consultation and we turn your idea into a shipped product.",
    heading: "Build your dream website or app with us",
    summary: "Book a consultation — we turn ideas into shipped products.",
    label: "Software",
  },
  {
    path: "/software/booking",
    title: "Book a software consultation",
    description: "Tell us about your website or app project and we'll get back to you to schedule a meeting.",
    heading: "Book a consultation",
    summary: "Tell us about your project — we'll get back to you to schedule a meeting.",
    label: "Book a consultation",
  },
  {
    path: "/become-seller",
    title: "Become a seller on the Isoko marketplace",
    description: "Join our marketplace and reach thousands of buyers across Africa and the world.",
    heading: "Become a seller",
    summary: "Join our marketplace and reach thousands of buyers across Africa and the world.",
    label: "Become a seller",
  },
  {
    path: "/track",
    title: "Track your order",
    description: "Enter your Isoko tracking number to see real-time status updates for your delivery.",
    heading: "Track your order",
    summary: "Enter your tracking number to see real-time status updates.",
    label: "Track an order",
  },
  {
    path: "/travel",
    title: "Travel: your journey, our responsibility",
    description: "From airport pickup to your return flight, Isoko takes care of your trip, anywhere in the world.",
    heading: "Your journey. Our responsibility.",
    summary: "From airport pickup to your return flight, Isoko takes care of your trip, anywhere in the world.",
    label: "Travel",
  },
  {
    path: "/consultancy",
    title: "Consultancy: clear advice, practical results",
    description:
      "We help businesses and organizations understand their challenges, find opportunities and put workable plans into action.",
    heading: "Clear advice. Practical results.",
    summary:
      "We help businesses and organizations understand their challenges, find opportunities and put workable plans into action.",
    label: "Consultancy",
  },
  {
    path: "/data-analysis",
    title: "Data analysis: turn your data into decisions",
    description: "Send us your data and your question. We clean it, analyse it and give you results you can act on.",
    heading: "Turn your data into decisions.",
    summary: "Send us your data and your question. We clean it, analyse it and give you results you can act on.",
    label: "Data analysis",
  },
  {
    path: "/contact",
    title: "Contact us",
    description:
      "Questions, suggestions, complaints or business enquiries: write to ISOKO Groups and a person will read it. You do not need an account.",
    heading: "Contact ISOKO Groups",
    summary:
      "Questions, suggestions, complaints or business enquiries. Write to us here and a person will read it. You do not need an account.",
    label: "Contact",
  },
];

/**
 * Addresses search engines should not index: sign-in, accounts, staff desks and
 * private links. The app marks them noindex at run time.
 */
export const NOINDEX_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/admin",
  "/staff",
  "/seller",
  "/cart",
  "/my-orders",
  "/dashboard",
  "/driver",
  "/insights",
  "/messages",
  "/logistics",
  "/e-library",
  "/travel/trip/",
  "/consultancy/r/",
  "/data-analysis/r/",
];

/** "Title · ISOKO GROUP", unless the title already names the site */
export const fullTitle = (title: string) => (title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`);

/** "https://www.isokogroups.com/research/x" from "/research/x" (absolute addresses are kept) */
export const absoluteUrl = (pathOrUrl: string) =>
  /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE_ORIGIN}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

/** "/software/booking" -> "software-booking": the generated file is /seo/software-booking.html */
export const seoFileSlug = (path: string) => (path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-"));

export const isNoindexPath = (pathname: string) =>
  NOINDEX_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));

export const seoPageFor = (pathname: string) => {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SEO_PAGES.find((p) => p.path === clean);
};
