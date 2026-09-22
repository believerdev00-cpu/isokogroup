import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Clock, FileCheck2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DOC_FILE_ACCEPT, errorText, firstName, formatDate, formatDateRange, formatMoney, formatTime, rpc, uploadClientFile,
} from "@/features/services/api";
import {
  FlowColumn, FormError, NextStep, NotFoundCard, PageLoading, PaymentBox, PrimaryButton, SectionCard, ServiceLayout,
  StageList, THEME, WhatsAppButton, type Stage,
} from "@/features/services/ui";
import { NEED_LABEL, SECTION_BY_KEY, SECTIONS, type TripItem, type TripView } from "./data";

function useTrip(token: string) {
  return useQuery({
    queryKey: ["travel_trip", token],
    queryFn: () => rpc<TripView | null>("travel_trip_view", { p_token: token }),
    refetchInterval: 60_000,
  });
}

function TripSummary({ trip }: { trip: TripView }) {
  return (
    <p className="mt-2 text-lg text-muted-foreground">
      {formatDateRange(trip.arrival_date, trip.departure_date)} · {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
    </p>
  );
}

// ============== REQUEST CHANGES ==============
function RequestChanges({ token, onDone, label = "Request Changes" }: { token: string; onDone: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button variant="outline" size="lg" className="h-12 w-full text-base" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await rpc("travel_request_changes", { p_token: token, p_message: text });
      toast.success("Sent. Isoko will update your trip.");
      setOpen(false);
      setText("");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send} className="space-y-3 rounded-2xl border bg-card p-4">
      <label htmlFor="changes" className="font-semibold">What would you like to change?</label>
      <Textarea id="changes" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. I want a cheaper hotel." maxLength={2000} autoFocus />
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" className={cn("flex-1", THEME.travel.button)} disabled={busy || !text.trim()}>Send</Button>
      </div>
    </form>
  );
}

// ============== TRIP PLAN ==============
function itemWhen(i: TripItem) {
  const date = i.start_date ? (i.end_date && i.end_date !== i.start_date ? formatDateRange(i.start_date, i.end_date) : formatDate(i.start_date, { day: "numeric", month: "long" })) : null;
  return [date, formatTime(i.start_time)].filter(Boolean).join(" · ");
}

function MyTripSections({ trip }: { trip: TripView }) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => {
        const items = trip.items.filter((i) => i.section === s.key);
        if (!items.length) return null;
        return (
          <SectionCard key={s.key} title={s.title}>
            <ul className="space-y-4">
              {items.map((i) => (
                <li key={i.id}>
                  {itemWhen(i) && <p className="text-sm text-muted-foreground">{itemWhen(i)}</p>}
                  <p className="font-semibold">{i.title}</p>
                  {i.location && <p className="text-sm">{i.location}</p>}
                  {i.details && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{i.details}</p>}
                  {i.pickup_time && <p className="mt-1 text-sm">Pickup: <span className="font-medium">{formatTime(i.pickup_time)}</span></p>}
                  {i.driver_name && (
                    <p className="text-sm">
                      Driver: <span className="font-medium">{i.driver_name}</span>
                      {i.driver_phone && <> · <a className="underline" href={`tel:${i.driver_phone.replace(/\s/g, "")}`}>{i.driver_phone}</a></>}
                    </p>
                  )}
                  <p className={cn("mt-1 inline-flex items-center gap-1 text-sm font-medium", i.status === "confirmed" ? THEME.travel.text : "text-muted-foreground")}>
                    {i.status === "confirmed" ? <><CheckCircle2 className="h-4 w-4" /> {s.key === "arrival" || s.key === "departure" ? "Scheduled" : "Confirmed"}</> : <><Clock className="h-4 w-4" /> Being arranged</>}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        );
      })}
    </div>
  );
}

/** What happens today, during the trip: the most important screen while travelling. */
function Today({ trip }: { trip: TripView }) {
  const t = trip.today;
  const items = trip.items.filter((i) => i.section !== "hotel" && i.start_date === t);
  const hotel = trip.items.find((i) => i.section === "hotel" && i.start_date && i.start_date <= t && (!i.end_date || i.end_date > t));
  return (
    <SectionCard className={cn("border-0", THEME.travel.soft)}>
      <h2 className="font-display text-3xl font-bold">Today</h2>
      <p className="text-sm opacity-80">{formatDate(t, { weekday: "long", day: "numeric", month: "long" })}</p>
      {items.length === 0 ? (
        <p className="mt-4">No activities planned today. Enjoy your free time{hotel ? ` at ${hotel.title}` : ""}.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl bg-background/70 p-4 text-foreground">
              <p className="text-lg font-bold">{i.title}</p>
              {i.start_time && <p className="text-2xl font-bold">{formatTime(i.start_time)}</p>}
              {i.pickup_time && <p className="mt-1">Pickup: <span className="font-semibold">{formatTime(i.pickup_time)}</span></p>}
              {i.driver_name && (
                <p className="flex items-center gap-1.5">
                  <User className="h-4 w-4" /> Driver: <span className="font-semibold">{i.driver_name}</span>
                  {i.driver_phone && <a className="ml-1 underline" href={`tel:${i.driver_phone.replace(/\s/g, "")}`}>Call</a>}
                </p>
              )}
              {i.location && <p className="text-sm text-muted-foreground">{i.location}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        <p className="mb-2 font-semibold">Need help?</p>
        <WhatsAppButton variant="solid" text={`Hello Isoko, I need help with my trip ${trip.reference}.`} />
      </div>
    </SectionCard>
  );
}

// ============== DOCUMENTS ==============
function Documents({ trip, token, onDone }: { trip: TripView; token: string; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!trip.documents.length) return null;
  const upload = async (file: File) => {
    if (!target) return;
    setBusy(target);
    try {
      const path = await uploadClientFile("travel", token, file);
      await rpc("travel_document_uploaded", { p_token: token, p_document_id: target, p_path: path });
      toast.success("Document received. Thank you.");
      onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
      setTarget(null);
    }
  };
  return (
    <SectionCard title="Documents">
      <input
        ref={input}
        type="file"
        accept={DOC_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <ul className="space-y-3">
        {trip.documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">{d.label}</span>
              {d.status === "required" ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> Required</span>
              ) : (
                <span className={cn("inline-flex items-center gap-1 text-sm font-medium", THEME.travel.text)}>
                  <FileCheck2 className="h-4 w-4" /> {d.status === "approved" ? "Approved" : "Received"}
                </span>
              )}
            </span>
            {d.status === "required" && (
              <Button
                size="sm"
                className={THEME.travel.button}
                disabled={busy !== null}
                onClick={() => {
                  setTarget(d.id);
                  input.current?.click();
                }}
              >
                <Upload className="mr-1.5 h-4 w-4" /> {busy === d.id ? "Uploading…" : "Upload"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ============== CONFIRMED TRIP ==============
function progress(trip: TripView): Stage[] {
  const t = trip.today;
  const total = Number(trip.quote_total ?? 0);
  const done = {
    booking: !!trip.accepted_at || trip.status === "completed",
    payment: total > 0 && Number(trip.paid) >= total,
    preparation: trip.items.length > 0 && trip.items.every((i) => i.status === "confirmed") && trip.documents.every((d) => d.status !== "required"),
    arrival: t > trip.arrival_date || trip.status === "completed",
    trip: t >= trip.departure_date || trip.status === "completed",
    departure: t > trip.departure_date || trip.status === "completed",
  };
  const labels: [keyof typeof done, string][] = [
    ["booking", "Booking"], ["payment", "Payment"], ["preparation", "Preparation"], ["arrival", "Arrival"], ["trip", "Trip"], ["departure", "Departure"],
  ];
  const firstOpen = labels.findIndex(([k]) => !done[k]);
  return labels.map(([k, label], i) => ({ label, state: done[k] ? "done" : i === firstOpen ? "current" : "todo" }));
}

function nextStep(trip: TripView) {
  const t = trip.today;
  const confirmed = trip.items.filter((i) => i.status === "confirmed");
  const lastDone = confirmed.length ? `${SECTION_BY_KEY[confirmed[confirmed.length - 1].section].title} confirmed` : "Trip confirmed";
  const upcoming = trip.items
    .filter((i) => i.start_date && i.start_date >= t)
    .sort((a, b) => `${a.start_date}${a.start_time ?? ""}`.localeCompare(`${b.start_date}${b.start_time ?? ""}`))[0];
  const next = upcoming ? `${upcoming.title}, ${itemWhen(upcoming)}` : t < trip.arrival_date ? `Your arrival on ${formatDate(trip.arrival_date, { day: "numeric", month: "long" })}` : null;
  const remaining = Number(trip.quote_total ?? 0) - Number(trip.paid) - Number(trip.pending_payment);
  const doc = trip.documents.find((d) => d.status === "required");
  const todo = doc ? `Upload your ${doc.label.toLowerCase()}` : remaining > 0 ? "Pay the remaining balance" : null;
  return { done: lastDone, next, todo };
}

function ConfirmedTrip({ trip, token, refresh }: { trip: TripView; token: string; refresh: () => void }) {
  const t = trip.today;
  const during = t >= trip.arrival_date && t <= trip.departure_date;
  const step = nextStep(trip);
  const total = Number(trip.quote_total ?? 0);
  return (
    <FlowColumn className="space-y-4">
      {during && <Today trip={trip} />}
      <div>
        <p className={cn("inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider", THEME.travel.text)}>
          <Check className="h-4 w-4" /> Trip confirmed
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">My trip</h1>
        <TripSummary trip={trip} />
      </div>
      <NextStep
        service="travel"
        done={step.done}
        next={step.next}
        action={step.todo ? <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">Your next action: {step.todo}</p> : null}
      />
      <SectionCard title="Progress">
        <StageList service="travel" stages={progress(trip)} />
      </SectionCard>
      <MyTripSections trip={trip} />
      <Documents trip={trip} token={token} onDone={refresh} />
      {total > 0 && (
        <PaymentBox
          service="travel"
          total={total}
          paid={Number(trip.paid)}
          pending={Number(trip.pending_payment)}
          currency={trip.currency}
          reference={trip.reference}
          onSubmit={async (v) => {
            await rpc("travel_submit_payment", { p_token: token, p_amount: v.amount, p_method: v.method, p_reference: v.reference });
            refresh();
          }}
        />
      )}
      {!during && (
        <SectionCard title="Need help?">
          <WhatsAppButton text={`Hello Isoko, about my trip ${trip.reference}:`} />
        </SectionCard>
      )}
      {trip.change_request && <p className="text-sm text-muted-foreground">Your last change request: “{trip.change_request}”</p>}
      <RequestChanges token={token} onDone={refresh} label="Ask for a change" />
    </FlowColumn>
  );
}

// ============== PAGE ==============
export default function TripPage() {
  const { token = "" } = useParams();
  const q = useTrip(token);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["travel_trip", token] });
  const [accepting, setAccepting] = useState(false);

  if (q.isLoading) return <ServiceLayout><PageLoading /></ServiceLayout>;
  const trip = q.data;
  if (!trip) return <ServiceLayout><NotFoundCard what="Trip" backTo="/travel" backLabel="Isoko Travel" /></ServiceLayout>;

  const accept = async () => {
    setAccepting(true);
    try {
      await rpc("travel_accept_quote", { p_token: token });
      toast.success("Trip confirmed!");
      refresh();
      window.scrollTo(0, 0);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setAccepting(false);
    }
  };

  let body: React.ReactNode;
  if (trip.status === "confirmed") {
    body = <ConfirmedTrip trip={trip} token={token} refresh={refresh} />;
  } else if (trip.status === "quoted") {
    const included = SECTIONS.filter((s) => trip.items.some((i) => i.section === s.key));
    body = (
      <FlowColumn className="space-y-5">
        <div>
          <p className={cn("text-sm font-bold uppercase tracking-wider", THEME.travel.text)}>Your quote is ready</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Your {trip.destination} trip</h1>
          <TripSummary trip={trip} />
        </div>
        <SectionCard title="Your trip includes">
          <ul className="space-y-2.5">
            {included.map((s) => (
              <li key={s.key} className="flex items-center gap-2.5 text-lg">
                <CheckCircle2 className={cn("h-5 w-5", THEME.travel.text)} /> {s.included}
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="font-display text-4xl font-bold">{formatMoney(trip.quote_total, trip.currency)}</p>
          <p className="text-sm text-muted-foreground">For {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}, everything above included.</p>
        </SectionCard>
        <PrimaryButton service="travel" busy={accepting} onClick={accept}>ACCEPT TRIP</PrimaryButton>
        <RequestChanges token={token} onDone={refresh} />
        <WhatsAppButton label="Contact Isoko" text={`Hello Isoko, I have a question about my quote ${trip.reference}.`} />
        <details className="rounded-2xl border bg-card p-5">
          <summary className="cursor-pointer font-semibold">See the day-by-day plan</summary>
          <div className="mt-4"><MyTripSections trip={trip} /></div>
        </details>
      </FlowColumn>
    );
  } else if (trip.status === "completed") {
    body = (
      <FlowColumn className="space-y-5 text-center">
        <h1 className="font-display text-3xl font-bold">Welcome home, {firstName(trip.customer_name)}</h1>
        <TripSummary trip={trip} />
        <p>Thank you for travelling with Isoko. We hope to welcome you back to {trip.destination} soon.</p>
        <WhatsAppButton text={`Hello Isoko, about my trip ${trip.reference}:`} />
      </FlowColumn>
    );
  } else if (trip.status === "cancelled") {
    body = (
      <FlowColumn className="space-y-5 text-center">
        <h1 className="font-display text-3xl font-bold">This trip was cancelled</h1>
        <p className="text-muted-foreground">If this is a mistake, please contact us.</p>
        <WhatsAppButton variant="solid" text={`Hello Isoko, about my cancelled trip ${trip.reference}:`} />
      </FlowColumn>
    );
  } else {
    // new, planning, changes_requested: Isoko is working on it
    const updating = trip.status === "changes_requested";
    body = (
      <FlowColumn className="space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">Request {trip.reference}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{updating ? "We're updating your trip" : "We're planning your trip"}</h1>
          <p className="mt-2 text-muted-foreground">
            {trip.destination} · {formatDateRange(trip.arrival_date, trip.departure_date)} · {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
          </p>
        </div>
        <NextStep
          service="travel"
          done={updating ? "We received your change request" : "Request received"}
          next={updating ? "An updated quote from your travel specialist" : "Your travel specialist contacts you and prepares your quote"}
          action={<p className="text-sm text-muted-foreground">Nothing to do for now. We'll send you the quote here and on WhatsApp.</p>}
        />
        <SectionCard title="You asked for">
          <ul className="flex flex-wrap gap-2">
            {trip.needs.map((n) => (
              <li key={n} className={cn("rounded-full px-3 py-1 text-sm font-medium", THEME.travel.soft)}>{NEED_LABEL[n]}</li>
            ))}
          </ul>
          {trip.change_request && <p className="mt-3 text-sm text-muted-foreground">Your change: “{trip.change_request}”</p>}
        </SectionCard>
        <WhatsAppButton variant="solid" text={`Hello Isoko, my trip request is ${trip.reference}.`} />
        <RequestChanges token={token} onDone={refresh} label="Add or change something" />
      </FlowColumn>
    );
  }

  return <ServiceLayout>{body}</ServiceLayout>;
}
