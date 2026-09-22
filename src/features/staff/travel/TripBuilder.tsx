import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { db, errorText, formatDate, formatDateRange, formatMoney, formatTime, openFile, unwrap } from "@/features/services/api";
import { NEED_LABEL, SECTIONS, type Section, type TripStatus } from "@/features/travel/data";
import { AssignSelect, ContactButtons, CustomerLinkButton, NotesPanel, Panel, PaymentsPanel, Pill, StaffPage } from "../common";
import { TravelNav, TripStatusPill, type StaffTrip } from "./shared";

type Item = {
  id: string; trip_id: string; section: Section; title: string; details: string; location: string | null;
  start_date: string | null; end_date: string | null; start_time: string | null; pickup_time: string | null;
  driver_name: string | null; driver_phone: string | null; price: number; supplier: string | null;
  internal_cost: number | null; internal_note: string | null; status: "planned" | "confirmed";
};
type Doc = { id: string; kind: "passport" | "visa" | "other"; label: string; status: "required" | "received" | "approved"; file_path: string | null; uploaded_at: string | null };

const blank = (section: Section, trip: StaffTrip) => ({
  title: SECTIONS.find((s) => s.key === section)!.item,
  details: "",
  location: section === "arrival" || section === "departure" ? "Kigali International Airport" : "",
  start_date: section === "departure" ? trip.departure_date : trip.arrival_date,
  end_date: section === "hotel" ? trip.departure_date : "",
  start_time: "",
  pickup_time: "",
  driver_name: "",
  driver_phone: "",
  price: "",
  supplier: "",
  internal_cost: "",
  internal_note: "",
  status: "planned" as "planned" | "confirmed",
});
type ItemForm = ReturnType<typeof blank>;

function ItemEditor({ trip, section, item, onDone }: { trip: StaffTrip; section: Section; item?: Item; onDone: () => void }) {
  const [f, setF] = useState<ItemForm>(
    item
      ? {
          title: item.title, details: item.details, location: item.location ?? "", start_date: item.start_date ?? "", end_date: item.end_date ?? "",
          start_time: item.start_time?.slice(0, 5) ?? "", pickup_time: item.pickup_time?.slice(0, 5) ?? "", driver_name: item.driver_name ?? "",
          driver_phone: item.driver_phone ?? "", price: String(item.price), supplier: item.supplier ?? "",
          internal_cost: item.internal_cost == null ? "" : String(item.internal_cost), internal_note: item.internal_note ?? "", status: item.status,
        }
      : blank(section, trip),
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const needsDriver = section !== "hotel";
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = {
      trip_id: trip.id, section, title: f.title.trim(), details: f.details.trim(), location: f.location.trim() || null,
      start_date: f.start_date || null, end_date: f.end_date || null, start_time: f.start_time || null, pickup_time: f.pickup_time || null,
      driver_name: f.driver_name.trim() || null, driver_phone: f.driver_phone.trim() || null, price: Number(f.price || 0),
      supplier: f.supplier.trim() || null, internal_cost: f.internal_cost === "" ? null : Number(f.internal_cost),
      internal_note: f.internal_note.trim() || null, status: f.status,
    };
    const { error } = item ? await db.from("travel_items").update(row).eq("id", item.id) : await db.from("travel_items").insert(row);
    if (!error && trip.status === "new") await db.from("travel_trips").update({ status: "planning" }).eq("id", trip.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    onDone();
  };
  return (
    <form onSubmit={save} className="mt-3 grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2"><span className="text-muted-foreground">What (the customer sees this)</span><Input className="mt-1" value={f.title} onChange={set("title")} required maxLength={160} /></label>
      <label className="text-sm"><span className="text-muted-foreground">Place</span><Input className="mt-1" value={f.location} onChange={set("location")} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm"><span className="text-muted-foreground">{section === "hotel" ? "Check-in" : "Date"}</span><Input className="mt-1" type="date" value={f.start_date} onChange={set("start_date")} /></label>
        {section === "hotel" ? (
          <label className="text-sm"><span className="text-muted-foreground">Check-out</span><Input className="mt-1" type="date" value={f.end_date} onChange={set("end_date")} /></label>
        ) : (
          <label className="text-sm"><span className="text-muted-foreground">{section === "arrival" ? "Flight lands" : "Time"}</span><Input className="mt-1" type="time" value={f.start_time} onChange={set("start_time")} /></label>
        )}
      </div>
      {needsDriver && (
        <>
          <label className="text-sm"><span className="text-muted-foreground">Pickup time</span><Input className="mt-1" type="time" value={f.pickup_time} onChange={set("pickup_time")} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm"><span className="text-muted-foreground">Driver / guide</span><Input className="mt-1" value={f.driver_name} onChange={set("driver_name")} /></label>
            <label className="text-sm"><span className="text-muted-foreground">Their phone</span><Input className="mt-1" type="tel" value={f.driver_phone} onChange={set("driver_phone")} /></label>
          </div>
        </>
      )}
      <label className="text-sm sm:col-span-2"><span className="text-muted-foreground">Details for the customer</span><Textarea className="mt-1" rows={2} value={f.details} onChange={set("details")} maxLength={2000} /></label>
      <label className="text-sm"><span className="text-muted-foreground">Price to customer ({trip.currency})</span><Input className="mt-1" type="number" min={0} step="any" value={f.price} onChange={set("price")} /></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={f.status === "confirmed"} onCheckedChange={(v) => setF({ ...f, status: v ? "confirmed" : "planned" })} /> Booked &amp; confirmed</label>
      <fieldset className="grid gap-2 rounded-lg border border-dashed p-3 sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">Internal only</legend>
        <Input placeholder="Supplier" value={f.supplier} onChange={set("supplier")} />
        <Input type="number" min={0} step="any" placeholder={`Our cost (${trip.currency})`} value={f.internal_cost} onChange={set("internal_cost")} />
        <Input placeholder="Note (booking ref…)" value={f.internal_note} onChange={set("internal_note")} />
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy || !f.title.trim()}>{item ? "Save" : "Add"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function SectionBlock({ trip, section, items, refresh }: { trip: StaffTrip; section: (typeof SECTIONS)[number]; items: Item[]; refresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const remove = async (i: Item) => {
    const { error } = await db.from("travel_items").delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    refresh();
  };
  return (
    <Panel title={section.title} right={!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add</Button>}>
      {items.length === 0 && !adding && <p className="text-sm text-muted-foreground">{section.item}: nothing added yet.</p>}
      <ul className="space-y-2">
        {items.map((i) =>
          editing === i.id ? (
            <li key={i.id}><ItemEditor trip={trip} section={section.key} item={i} onDone={() => { setEditing(null); refresh(); }} /></li>
          ) : (
            <li key={i.id} className="flex items-start gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{i.title}</p>
                <p className="text-sm text-muted-foreground">
                  {[i.start_date && (i.end_date ? formatDateRange(i.start_date, i.end_date) : formatDate(i.start_date, { day: "numeric", month: "short" })), formatTime(i.start_time), i.location].filter(Boolean).join(" · ")}
                </p>
                {(i.driver_name || i.pickup_time) && <p className="text-sm">{i.pickup_time && `Pickup ${formatTime(i.pickup_time)}`}{i.driver_name && ` · Driver ${i.driver_name}`}</p>}
                {(i.supplier || i.internal_cost != null) && (
                  <p className="text-xs text-muted-foreground">Internal: {[i.supplier, i.internal_cost != null && `cost ${formatMoney(i.internal_cost, trip.currency)}`, i.internal_note].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-semibold tabular-nums">{formatMoney(i.price, trip.currency)}</span>
                <Pill tone={i.status === "confirmed" ? "done" : "wait"}>{i.status === "confirmed" ? "Confirmed" : "To book"}</Pill>
                <span className="flex">
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${i.title}`} onClick={() => setEditing(i.id)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${i.title}`} onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
                </span>
              </div>
            </li>
          ),
        )}
      </ul>
      {adding && <ItemEditor trip={trip} section={section.key} onDone={() => { setAdding(false); refresh(); }} />}
    </Panel>
  );
}

function QuotePanel({ trip, items, refresh }: { trip: StaffTrip; items: Item[]; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = items.reduce((s, i) => s + Number(i.price), 0);
  const cost = items.reduce((s, i) => s + Number(i.internal_cost ?? 0), 0);
  const bySection = SECTIONS.map((s) => ({ s, amount: items.filter((i) => i.section === s.key).reduce((a, i) => a + Number(i.price), 0), n: items.filter((i) => i.section === s.key).length })).filter((x) => x.n > 0);
  const confirmed = trip.status === "confirmed" || trip.status === "completed";
  const changed = trip.quote_total != null && Number(trip.quote_total) !== total;

  const send = async () => {
    setBusy(true);
    const patch = confirmed
      ? { quote_total: total }
      : { quote_total: total, status: "quoted", quote_sent_at: new Date().toISOString(), change_request: null };
    const { error } = await db.from("travel_trips").update(patch).eq("id", trip.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(confirmed ? "Trip total updated" : "Quote sent. Share the customer link on WhatsApp.");
    setOpen(false);
    refresh();
  };

  if (items.length === 0) return null;
  return (
    <Panel title="Quote" className="border-emerald-600/30">
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1">
            Total <span className="text-2xl font-bold tabular-nums">{formatMoney(total, trip.currency)}</span>
            {trip.quote_total != null && changed && <span className="ml-2 text-sm text-amber-700 dark:text-amber-400">(customer's quote: {formatMoney(trip.quote_total, trip.currency)})</span>}
          </p>
          {(!confirmed || changed) && trip.status !== "cancelled" && (
            <Button size="lg" className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => setOpen(true)}>
              {confirmed ? "Update trip total" : trip.status === "quoted" ? "Update quote" : "CREATE QUOTE"}
            </Button>
          )}
        </div>
      ) : (
        <div>
          <ul className="divide-y text-sm">
            {bySection.map(({ s, amount }) => (
              <li key={s.key} className="flex justify-between py-2"><span>{s.included}</span><span className="tabular-nums">{formatMoney(amount, trip.currency)}</span></li>
            ))}
            <li className="flex justify-between py-2 text-base font-bold"><span>TOTAL</span><span className="tabular-nums">{formatMoney(total, trip.currency)}</span></li>
          </ul>
          {cost > 0 && <p className="mt-1 text-xs text-muted-foreground">Internal: cost {formatMoney(cost, trip.currency)} · margin {formatMoney(total - cost, trip.currency)}</p>}
          <p className="mt-3 text-sm text-muted-foreground">The customer sees what's included and the total only: no line prices, suppliers or notes.</p>
          <div className="mt-3 flex gap-2">
            <Button size="lg" className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={busy || total <= 0} onClick={send}>
              <Send className="mr-2 h-4 w-4" /> {confirmed ? "Update total" : "SEND TO CUSTOMER"}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function DocumentsPanel({ trip }: { trip: StaffTrip }) {
  const qc = useQueryClient();
  const key = ["travel_documents", trip.id];
  const docs = useQuery({ queryKey: key, queryFn: async () => unwrap<Doc[]>(await db.from("travel_documents").select("*").eq("trip_id", trip.id).order("created_at")) });
  const [kind, setKind] = useState<Doc["kind"]>("passport");
  const [label, setLabel] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = label.trim() || (kind === "passport" ? "Passport" : kind === "visa" ? "Visa" : "");
    if (!text) return;
    const { error } = await db.from("travel_documents").insert({ trip_id: trip.id, kind, label: text });
    if (error) return toast.error(error.message);
    setLabel("");
    refresh();
  };
  const approve = async (d: Doc) => {
    const { error } = await db.from("travel_documents").update({ status: "approved" }).eq("id", d.id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const remove = async (d: Doc) => {
    const { error } = await db.from("travel_documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    refresh();
  };
  return (
    <Panel title="Documents" right={<span className="text-xs text-muted-foreground">Ask only for what's needed</span>}>
      <ul className="space-y-2">
        {(docs.data ?? []).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 font-medium">{d.label}</span>
            <Pill tone={d.status === "required" ? "wait" : "done"}>{d.status === "required" ? "Required" : d.status === "received" ? "Received" : "Approved"}</Pill>
            {d.file_path && <Button size="sm" variant="ghost" onClick={() => openFile(d.file_path!).catch((e) => toast.error(errorText(e)))}>View</Button>}
            {d.status === "received" && <Button size="sm" onClick={() => approve(d)}><Check className="mr-1 h-4 w-4" />Approve</Button>}
            {d.status === "required" && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${d.label}`} onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button>}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <select aria-label="Document type" className="h-10 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as Doc["kind"])}>
          <option value="passport">Passport</option>
          <option value="visa">Visa</option>
          <option value="other">Other</option>
        </select>
        <Input placeholder={kind === "other" ? "e.g. Yellow fever certificate" : "Label (optional)"} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required={kind === "other"} />
        <Button type="submit" variant="outline">Request</Button>
      </form>
    </Panel>
  );
}

export default function TripBuilder() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const trip = useQuery({
    queryKey: ["staff_trip", id],
    queryFn: async () => unwrap<StaffTrip | null>(await db.from("travel_trips").select("*").eq("id", id).maybeSingle()),
  });
  const items = useQuery({
    queryKey: ["travel_items", id],
    queryFn: async () => unwrap<Item[]>(await db.from("travel_items").select("*").eq("trip_id", id).order("start_date", { nullsFirst: false }).order("start_time", { nullsFirst: false }).order("created_at")),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["staff_trip", id] });
    qc.invalidateQueries({ queryKey: ["travel_items", id] });
    qc.invalidateQueries({ queryKey: ["staff_trips"] });
  };
  const update = async (patch: Partial<StaffTrip>, message?: string) => {
    const { error } = await db.from("travel_trips").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (message) toast.success(message);
    refresh();
  };
  const setStatus = (status: TripStatus, message: string) =>
    update(
      {
        status,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
        ...(status === "confirmed" ? { accepted_at: new Date().toISOString() } : {}),
      },
      message,
    ).catch((e) => toast.error(errorText(e)));

  if (trip.isLoading) return <StaffPage title="Loading…" nav={<TravelNav />}><span /></StaffPage>;
  const t = trip.data;
  if (!t) return <StaffPage title="Trip not found" nav={<TravelNav />}><Link to="/staff/travel" className="underline">Back to Travel</Link></StaffPage>;
  const list = items.data ?? [];

  return (
    <StaffPage
      nav={<Link to="/staff/travel/trips" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Trips</Link>}
      title={<span className="uppercase">{t.customer_name}'s trip</span>}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t.travelling_from ? `${t.travelling_from} → ` : ""}{t.destination}</span>
          <span>{formatDateRange(t.arrival_date, t.departure_date)}</span>
          <span>{t.travelers} {t.travelers === 1 ? "traveler" : "travelers"}</span>
          <span className="font-mono text-xs">{t.reference}</span>
          <TripStatusPill status={t.status} />
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {t.status === "changes_requested" && t.change_request && (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
              <p className="text-sm font-semibold">The customer asked for changes</p>
              <p className="mt-1">“{t.change_request}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Update the trip below, then send the quote again.</p>
            </div>
          )}
          {t.status === "confirmed" && t.change_request && t.change_requested_at && (
            <div className="rounded-2xl border bg-card p-4 text-sm">
              <span className="font-semibold">Customer message ({formatDate(t.change_requested_at, { day: "numeric", month: "short" })}):</span> “{t.change_request}”
            </div>
          )}
          {SECTIONS.map((s) => (
            <SectionBlock key={s.key} trip={t} section={s} items={list.filter((i) => i.section === s.key)} refresh={refresh} />
          ))}
          <QuotePanel trip={t} items={list} refresh={refresh} />
          <DocumentsPanel trip={t} />
          {(t.status === "confirmed" || t.status === "completed") && (
            <PaymentsPanel table="travel_payments" fk="trip_id" parentId={t.id} total={t.quote_total == null ? null : Number(t.quote_total)} currency={t.currency} />
          )}
        </div>

        <aside className="space-y-4">
          <Panel title="Customer">
            <p className="font-semibold">{t.customer_name}</p>
            <p className="text-sm text-muted-foreground">{t.customer_phone}</p>
            <p className="break-all text-sm text-muted-foreground">{t.customer_email}</p>
            <div className="mt-3"><ContactButtons phone={t.customer_phone} email={t.customer_email} name={t.customer_name} reference={t.reference} /></div>
            <div className="mt-2"><CustomerLinkButton path={`/travel/trip/${t.access_token}`} /></div>
          </Panel>
          <Panel title="Requested">
            <ul className="flex flex-wrap gap-1.5">
              {t.needs.map((n) => <li key={n}><Pill tone="new">{NEED_LABEL[n]}</Pill></li>)}
            </ul>
            {t.message && <p className="mt-3 whitespace-pre-line text-sm">“{t.message}”</p>}
            <p className="mt-2 text-xs text-muted-foreground">Received {formatDate(t.created_at)}</p>
          </Panel>
          <Panel title="Trip">
            <div className="space-y-3">
              <AssignSelect service="travel" label="Travel specialist" value={t.assigned_to} onChange={(v) => update({ assigned_to: v }, "Assigned").catch((e) => toast.error(errorText(e)))} />
              <label className="block text-sm">
                <span className="text-muted-foreground">Currency</span>
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={t.currency} disabled={t.status === "confirmed" || t.status === "completed"} onChange={(e) => update({ currency: e.target.value }).catch((er) => toast.error(errorText(er)))}>
                  {["USD", "RWF", "EUR"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <div className={cn("flex flex-col gap-2 pt-1")}>
                {t.status === "new" && <Button variant="outline" onClick={() => setStatus("planning", "Marked as planning")}>Start planning</Button>}
                {t.status === "quoted" && <Button variant="outline" onClick={() => setStatus("confirmed", "Booking confirmed")}>Customer accepted by phone</Button>}
                {t.status === "confirmed" && <Button variant="outline" onClick={() => setStatus("completed", "Trip completed")}>Mark trip completed</Button>}
                {!["completed", "cancelled"].includes(t.status) && (
                  <Button variant="ghost" className="text-destructive" onClick={() => window.confirm("Cancel this trip?") && setStatus("cancelled", "Trip cancelled")}>Cancel trip</Button>
                )}
                {t.status === "cancelled" && <Button variant="outline" onClick={() => setStatus("planning", "Trip reopened")}>Reopen</Button>}
              </div>
            </div>
          </Panel>
          <NotesPanel value={t.staff_notes} onSave={(v) => update({ staff_notes: v })} />
        </aside>
      </div>
    </StaffPage>
  );
}
