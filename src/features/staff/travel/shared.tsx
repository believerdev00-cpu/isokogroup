import { Link } from "react-router-dom";
import { Check, CreditCard, LayoutDashboard, MoreHorizontal, Plane, Inbox, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/features/services/api";
import { NEED_LABEL, STATUS_LABEL, type Need, type TripStatus } from "@/features/travel/data";
import { ContactButtons, Pill, SubNav } from "../common";

export type StaffTrip = {
  id: string; reference: string; access_token: string; destination: string; travelling_from: string | null;
  arrival_date: string; departure_date: string; travelers: number; needs: Need[]; package_id: string | null;
  customer_name: string; customer_phone: string; customer_email: string; message: string | null;
  status: TripStatus; quote_total: number | null; currency: string; quote_sent_at: string | null; accepted_at: string | null;
  completed_at: string | null; change_request: string | null; change_requested_at: string | null;
  staff_notes: string; assigned_to: string | null; created_at: string;
};

export const TRAVEL_NAV = [
  { to: "/staff/travel", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/staff/travel/requests", label: "Requests", icon: Inbox },
  { to: "/staff/travel/trips", label: "Trips", icon: Plane },
  { to: "/staff/travel/customers", label: "Customers", icon: Users },
  { to: "/staff/travel/payments", label: "Payments", icon: CreditCard },
  { to: "/staff/travel/more", label: "More", icon: MoreHorizontal },
];
export const TravelNav = () => <SubNav items={TRAVEL_NAV} />;

const TONE: Record<TripStatus, "new" | "done" | "wait" | "off" | "work"> = {
  new: "new", planning: "work", quoted: "wait", changes_requested: "wait", confirmed: "done", completed: "off", cancelled: "off",
};
export const TripStatusPill = ({ status }: { status: TripStatus }) => <Pill tone={TONE[status]}>{STATUS_LABEL[status]}</Pill>;

/** A trip request as staff see it in lists: who, where, when, what they need. */
export function TripCard({ t }: { t: StaffTrip }) {
  return (
    <article className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{t.customer_name}</h3>
          <p className="text-sm">{t.travelling_from ? `${t.travelling_from} → ` : ""}{t.destination}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(t.arrival_date, t.departure_date)} · {t.travelers} {t.travelers === 1 ? "traveler" : "travelers"}
          </p>
        </div>
        <TripStatusPill status={t.status} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {t.needs.map((n) => (
          <li key={n} className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" />{NEED_LABEL[n]}</li>
        ))}
      </ul>
      {t.status === "changes_requested" && t.change_request && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Change: “{t.change_request}”</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild className="bg-emerald-700 text-white hover:bg-emerald-800">
          <Link to={`/staff/travel/trip/${t.id}`}>Open</Link>
        </Button>
        <ContactButtons compact phone={t.customer_phone} email={t.customer_email} name={t.customer_name} reference={t.reference} />
      </div>
    </article>
  );
}
