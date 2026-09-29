import kigali from "@/assets/travel/kigali.webp";
import akagera from "@/assets/travel/akagera.webp";
import musanze from "@/assets/travel/musanze.webp";
import volcanoes from "@/assets/hero/travel.webp";
import nyungwe from "@/assets/travel/nyungwe.webp";
import lakeKivu from "@/assets/travel/lake-kivu.webp";
import { BedDouble, Car, Compass, HeartHandshake, Home, PlaneLanding, PlaneTakeoff, type LucideIcon } from "lucide-react";

export type Need = "airport_pickup" | "hotel" | "bnb" | "transport" | "activities" | "airport_dropoff" | "plan_everything";

export const NEEDS: { key: Need; label: string; description: string; icon: LucideIcon }[] = [
  { key: "airport_pickup", label: "Airport Pickup", description: "We meet you at the airport.", icon: PlaneLanding },
  { key: "hotel", label: "Hotel", description: "A hotel that fits your budget.", icon: BedDouble },
  { key: "bnb", label: "B&B", description: "A cosy bed & breakfast or guesthouse.", icon: Home },
  { key: "transport", label: "Transport", description: "A private car and driver.", icon: Car },
  { key: "activities", label: "Tours & Activities", description: "Parks, gorillas, city tours and more.", icon: Compass },
  { key: "airport_dropoff", label: "Airport Drop-off", description: "We take you back for your flight.", icon: PlaneTakeoff },
];
export const PLAN_EVERYTHING = {
  key: "plan_everything" as const,
  label: "I need help planning everything",
  description: "Not sure what you need? Tell us and we plan the whole trip.",
  icon: HeartHandshake,
};
export const NEED_LABEL: Record<Need, string> = {
  ...Object.fromEntries(NEEDS.map((n) => [n.key, n.label])),
  plan_everything: "Help planning everything",
} as Record<Need, string>;

export type Section = "arrival" | "hotel" | "transport" | "experience" | "departure";
export const SECTIONS: { key: Section; title: string; item: string; included: string; icon: LucideIcon }[] = [
  { key: "arrival", title: "Arrival", item: "Airport Pickup", included: "Airport pickup", icon: PlaneLanding },
  { key: "hotel", title: "Hotel", item: "Hotel", included: "Hotel", icon: BedDouble },
  { key: "transport", title: "Transport", item: "Private Transport", included: "Private transport", icon: Car },
  { key: "experience", title: "Experiences", item: "Tours / Activities", included: "Tours & activities", icon: Compass },
  { key: "departure", title: "Departure", item: "Airport Drop-off", included: "Airport drop-off", icon: PlaneTakeoff },
];
export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<Section, (typeof SECTIONS)[number]>;

export type TripStatus = "new" | "planning" | "quoted" | "changes_requested" | "confirmed" | "completed" | "cancelled";
export const STATUS_LABEL: Record<TripStatus, string> = {
  new: "New request",
  planning: "Planning",
  quoted: "Quote sent",
  changes_requested: "Changes requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Photos: Unsplash (no credit required) or Flickr/Wikimedia under CC BY / CC BY-SA,
// credited on the card as their licences ask.
export const DESTINATIONS = [
  { name: "Kigali", text: "Rwanda's clean, green capital: culture, food, art and history.", tag: "City", image: kigali,
    credit: { by: "Unsplash", license: "Unsplash License", url: "https://unsplash.com/photos/the-sun-is-setting-over-a-city-with-tall-buildings-b-HnOOPRfTI" } },
  { name: "Akagera", text: "Savannah safaris with lions, elephants, giraffes and rhinos.", tag: "Safari", image: akagera,
    credit: { by: "Unsplash", license: "Unsplash License", url: "https://unsplash.com/photos/giraffe-on-brown-grass-field-during-daytime-yyndnnjmS-c" } },
  { name: "Musanze", text: "The gateway to the volcanoes, caves and mountain villages.", tag: "Mountains", image: musanze,
    credit: { by: "Thomson Safaris", license: "CC BY 2.0", url: "https://www.flickr.com/photos/52278382@N06/6583316045" } },
  { name: "Volcanoes", text: "Trek to meet the mountain gorillas in their forest home.", tag: "Gorillas", image: volcanoes,
    credit: { by: "Emmanuel Kwizera", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/w/index.php?curid=92779696" } },
  { name: "Nyungwe", text: "Ancient rainforest, chimpanzees and the canopy walkway.", tag: "Rainforest", image: nyungwe,
    credit: { by: "François Terrier", license: "CC BY 2.0", url: "https://www.flickr.com/photos/59728762@N03/5700560655" } },
  { name: "Lake Kivu", text: "Beaches, boat trips and sunsets on one of Africa's great lakes.", tag: "Lakeside", image: lakeKivu,
    credit: { by: "Unsplash", license: "Unsplash License", url: "https://unsplash.com/photos/a-scenic-view-of-a-lake-and-a-highway-WnGwfbViulY" } },
];

export type Package = { id: string; name: string; days: number; summary: string; includes: string[]; from_price: number | null; currency: string; is_active: boolean; sort: number };

/** The customer-facing trip, as returned by travel_trip_view. */
export type TripItem = {
  id: string; section: Section; title: string; details: string; location: string | null;
  start_date: string | null; end_date: string | null; start_time: string | null; pickup_time: string | null;
  driver_name: string | null; driver_phone: string | null; status: "planned" | "confirmed";
};
export type TripView = {
  reference: string; destination: string; travelling_from: string | null;
  arrival_date: string; departure_date: string; travelers: number; needs: Need[];
  customer_name: string; status: TripStatus; currency: string; quote_total: number | null;
  quote_sent_at: string | null; accepted_at: string | null;
  change_request: string | null; change_requested_at: string | null; today: string;
  items: TripItem[]; paid: number; pending_payment: number;
  payments: { amount: number; method: string; status: string; created_at: string }[];
  documents: { id: string; kind: "passport" | "visa" | "other"; label: string; status: "required" | "received" | "approved" }[];
};
