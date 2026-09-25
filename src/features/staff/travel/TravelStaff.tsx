import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { db, errorText, formatDate, formatDateRange, formatMoney, PAYMENT_METHOD_LABEL, rpc, todayIso, unwrap } from "@/features/services/api";
import { usePendingSubmissions } from "@/features/finance/api";
import type { Package } from "@/features/travel/data";
import { AttentionTile, ContactButtons, EmptyState, Panel, Pill, StaffPage } from "../common";
import { ActivityFeed } from "@/components/motion";
import { CheckCircle2, Inbox as InboxIcon, Send } from "lucide-react";
import { TravelNav, TripCard, TripStatusPill, type StaffTrip } from "./shared";

export function useTrips() {
  return useQuery({
    queryKey: ["staff_trips"],
    queryFn: async () => unwrap<StaffTrip[]>(await db.from("travel_trips").select("*").order("created_at", { ascending: false }).limit(1000)),
    refetchInterval: 60_000,
  });
}

const usePendingPayments = () => usePendingSubmissions("travel");

const OPEN_REQUEST = ["new", "planning", "changes_requested"];

// ============== DASHBOARD ==============
/** What happened lately across all trips, newest first (refreshes every minute). */
function recentActivity(trips: StaffTrip[]) {
  const events: { id: string; at: string; text: React.ReactNode; tone: string; icon: typeof Send }[] = [];
  for (const t of trips) {
    events.push({ id: `${t.id}-new`, at: t.created_at, text: <><b>{t.customer_name}</b> requested a trip ({formatDateRange(t.arrival_date, t.departure_date)})</>, tone: "bg-sky-500", icon: InboxIcon });
    if (t.quote_sent_at) events.push({ id: `${t.id}-quote`, at: t.quote_sent_at, text: <>Quote sent to <b>{t.customer_name}</b>{t.quote_total != null && <> · {formatMoney(t.quote_total, t.currency)}</>}</>, tone: "bg-amber-500", icon: Send });
    if (t.accepted_at) events.push({ id: `${t.id}-accepted`, at: t.accepted_at, text: <><b>{t.customer_name}</b> accepted the trip</>, tone: "bg-emerald-500", icon: CheckCircle2 });
  }
  return events
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6)
    .map((e) => ({ id: e.id, text: e.text, tone: e.tone, time: new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }));
}

export function TravelDashboard() {
  const trips = useTrips();
  const payments = usePendingPayments();
  const today = todayIso();
  const all = trips.data ?? [];
  const active = all.filter((t) => t.status === "confirmed");
  const n = trips.data
    ? {
        newRequests: all.filter((t) => t.status === "new").length,
        quotes: all.filter((t) => t.status === "quoted").length,
        changes: all.filter((t) => t.status === "changes_requested").length,
        arriving: active.filter((t) => t.arrival_date === today).length,
        leaving: active.filter((t) => t.departure_date === today).length,
      }
    : undefined;
  const fresh = all.filter((t) => t.status === "new" || t.status === "changes_requested").slice(0, 6);

  return (
    <StaffPage title="Travel" nav={<TravelNav />}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Needs attention</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AttentionTile tone="alert" count={n?.newRequests} label="New requests" to="/staff/travel/requests" />
        {(n?.changes ?? 0) > 0 && <AttentionTile tone="alert" count={n?.changes} label="Changes requested" to="/staff/travel/requests" />}
        <AttentionTile count={n?.quotes} label="Quotes waiting" to="/staff/travel/trips?show=quoted" />
        <AttentionTile tone="alert" count={payments.data?.length} label="Payments pending" to="/staff/travel/payments" />
        <AttentionTile count={n?.arriving} label="Travelers arriving today" to="/staff/travel/trips?show=arriving" />
        <AttentionTile count={n?.leaving} label="Travelers leaving today" to="/staff/travel/trips?show=leaving" />
      </div>

      <Panel title="Recent activity" className="mt-6">
        <ActivityFeed items={recentActivity(all)} empty="No activity yet." />
      </Panel>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New requests</h2>
        <Link to="/staff/travel/requests" className="text-sm text-muted-foreground hover:text-foreground">All requests</Link>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {trips.isLoading ? <p className="text-muted-foreground">Loading…</p> : fresh.length === 0 ? <EmptyState>No new requests. 🎉</EmptyState> : fresh.map((t) => <TripCard key={t.id} t={t} />)}
      </div>
    </StaffPage>
  );
}

// ============== REQUESTS ==============
export function TravelRequests() {
  const trips = useTrips();
  const list = (trips.data ?? []).filter((t) => OPEN_REQUEST.includes(t.status));
  return (
    <StaffPage title="Requests" subtitle="Trips still being planned" nav={<TravelNav />}>
      <div className="grid gap-3 lg:grid-cols-2">
        {trips.isLoading ? <p className="text-muted-foreground">Loading…</p> : list.length === 0 ? <EmptyState>Every request has a quote. Nothing to plan right now.</EmptyState> : list.map((t) => <TripCard key={t.id} t={t} />)}
      </div>
    </StaffPage>
  );
}

// ============== TRIPS ==============
const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "arriving", label: "Arriving today" },
  { key: "leaving", label: "Leaving today" },
  { key: "quoted", label: "Quote sent" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
] as const;

export function TravelTrips() {
  const trips = useTrips();
  const [params, setParams] = useSearchParams();
  const show = params.get("show") ?? "upcoming";
  const [search, setSearch] = useState("");
  const today = todayIso();
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (trips.data ?? [])
      .filter((t) => {
        switch (show) {
          case "upcoming": return t.status === "confirmed" && t.departure_date >= today;
          case "arriving": return t.status === "confirmed" && t.arrival_date === today;
          case "leaving": return t.status === "confirmed" && t.departure_date === today;
          case "quoted": return t.status === "quoted";
          case "completed": return t.status === "completed";
          default: return true;
        }
      })
      .filter((t) => !s || `${t.customer_name} ${t.reference} ${t.customer_email} ${t.customer_phone}`.toLowerCase().includes(s))
      .sort((a, b) => (show === "all" || show === "completed" ? b.arrival_date.localeCompare(a.arrival_date) : a.arrival_date.localeCompare(b.arrival_date)));
  }, [trips.data, show, search, today]);

  return (
    <StaffPage title="Trips" nav={<TravelNav />}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setParams(f.key === "upcoming" ? {} : { show: f.key })}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", show === f.key ? "border-transparent bg-foreground text-background" : "bg-card")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Input className="mb-4 max-w-sm" placeholder="Search name, reference, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {trips.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <EmptyState>No trips here.</EmptyState>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {list.map((t) => (
            <li key={t.id}>
              <Link to={`/staff/travel/trip/${t.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.customer_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateRange(t.arrival_date, t.departure_date)} · {t.travelers} pax · {t.reference}
                  </p>
                </div>
                {t.quote_total != null && <span className="hidden text-sm font-semibold tabular-nums sm:block">{formatMoney(t.quote_total, t.currency)}</span>}
                <TripStatusPill status={t.status} />
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StaffPage>
  );
}

// ============== CUSTOMERS ==============
export function TravelCustomers() {
  const trips = useTrips();
  const [search, setSearch] = useState("");
  const customers = useMemo(() => {
    const byEmail = new Map<string, { name: string; email: string; phone: string; trips: StaffTrip[] }>();
    for (const t of trips.data ?? []) {
      const c = byEmail.get(t.customer_email) ?? { name: t.customer_name, email: t.customer_email, phone: t.customer_phone, trips: [] };
      c.trips.push(t);
      byEmail.set(t.customer_email, c);
    }
    const s = search.trim().toLowerCase();
    return [...byEmail.values()].filter((c) => !s || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(s));
  }, [trips.data, search]);
  return (
    <StaffPage title="Customers" nav={<TravelNav />}>
      <Input className="mb-4 max-w-sm" placeholder="Search name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {customers.length === 0 ? (
        <EmptyState>No customers yet.</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {customers.map((c) => (
            <li key={c.email} className="rounded-2xl border bg-card p-4">
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.phone} · {c.email}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {c.trips.map((t) => (
                  <li key={t.id}>
                    <Link to={`/staff/travel/trip/${t.id}`} className="flex items-center gap-2 hover:underline">
                      {t.reference} · {formatDateRange(t.arrival_date, t.departure_date)} <TripStatusPill status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><ContactButtons compact phone={c.phone} email={c.email} name={c.name} reference={c.trips[0].reference} /></div>
            </li>
          ))}
        </ul>
      )}
    </StaffPage>
  );
}

// ============== PAYMENTS ==============
export function TravelPayments() {
  const payments = usePendingPayments();
  const qc = useQueryClient();
  const confirm = async (id: string) => {
    try {
      await rpc("finance_verify_submission", { p_submission_id: id });
      toast.success("Payment confirmed");
      qc.invalidateQueries({ queryKey: ["finance_pending"] });
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const list = payments.data ?? [];
  return (
    <StaffPage title="Payments" subtitle="Payments customers reported. Confirm once the money has arrived; to reject one or confirm a different amount, open the trip." nav={<TravelNav />}>
      {payments.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <EmptyState>No payments waiting for confirmation.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold tabular-nums">{formatMoney(p.amount, p.currency)}</p>
                <p className="text-sm text-muted-foreground">
                  {p.label} · {PAYMENT_METHOD_LABEL[p.method]} · Ref {p.reference} · {formatDate(p.created_at, { day: "numeric", month: "short" })} · Balance {formatMoney(p.balance, p.currency)}
                </p>
              </div>
              <Button asChild variant="outline"><Link to={`/staff/travel/trip/${p.entity_id}`}>Open trip</Link></Button>
              <Button onClick={() => confirm(p.id)}>Money arrived</Button>
            </li>
          ))}
        </ul>
      )}
    </StaffPage>
  );
}

// ============== MORE: PACKAGES ==============
const EMPTY_PKG = { name: "", days: 7, summary: "", includes: "", from_price: "", currency: "USD", is_active: true };

export function TravelMore() {
  const qc = useQueryClient();
  const packages = useQuery({
    queryKey: ["travel_packages", "staff"],
    queryFn: async () => unwrap<Package[]>(await db.from("travel_packages").select("*").order("sort")),
  });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_PKG);
  const start = (p?: Package) => {
    setEditing(p?.id ?? "new");
    setForm(p ? { name: p.name, days: p.days, summary: p.summary, includes: p.includes.join("\n"), from_price: p.from_price == null ? "" : String(p.from_price), currency: p.currency, is_active: p.is_active } : EMPTY_PKG);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const row = {
      name: form.name.trim(), days: Number(form.days), summary: form.summary.trim(),
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
      from_price: form.from_price === "" ? null : Number(form.from_price), currency: form.currency, is_active: form.is_active,
    };
    const { error } = editing === "new"
      ? await db.from("travel_packages").insert({ ...row, sort: (packages.data?.length ?? 0) * 10 + 10 })
      : await db.from("travel_packages").update(row).eq("id", editing);
    if (error) return toast.error(error.message);
    toast.success("Package saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["travel_packages"] });
  };
  return (
    <StaffPage title="More" nav={<TravelNav />}>
      <Panel title="Packages on the website" right={<Button size="sm" variant="outline" onClick={() => start()}><Plus className="mr-1 h-4 w-4" />Add package</Button>}>
        <p className="mb-3 text-sm text-muted-foreground">Optional shortcuts. Choosing one starts the same Plan My Trip request.</p>
        {editing && (
          <form onSubmit={save} className="mb-4 grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="flex gap-2">
              <Input type="number" min={1} max={60} aria-label="Days" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} required />
              <span className="self-center text-sm text-muted-foreground">days</span>
            </div>
            <Textarea className="sm:col-span-2" rows={2} placeholder="Short description" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            <Textarea className="sm:col-span-2" rows={4} placeholder={"What's included, one per line\nAirport pickup\nHotel"} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} />
            <div className="flex gap-2">
              <Input type="number" min={0} step="any" placeholder="From price (optional)" value={form.from_price} onChange={(e) => setForm({ ...form, from_price: e.target.value })} />
              <select className="h-10 rounded-md border bg-background px-2 text-sm" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {["USD", "RWF", "EUR"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /> Shown on the website</label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">Save package</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        )}
        <ul className="divide-y">
          {(packages.data ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name} <span className="font-normal text-muted-foreground">· {p.days} days</span></p>
                <p className="truncate text-sm text-muted-foreground">{p.from_price != null ? `From ${formatMoney(p.from_price, p.currency)}` : "Price on request"}</p>
              </div>
              {!p.is_active && <Pill tone="off">Hidden</Pill>}
              <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => start(p)}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </Panel>
    </StaffPage>
  );
}
