import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { db, errorText, rpc, todayIso } from "@/features/services/api";
import { ChoiceCard, Field, FlowColumn, FormError, PrimaryButton, RequestReceived, ServiceLayout, StepHeader, THEME } from "@/features/services/ui";
import { NEEDS, PLAN_EVERYTHING, type Need, type Package } from "./data";

const TOTAL = 4;

// PLAN MY TRIP: where, when, what help, how to reach you. Nothing else; the
// travel specialist works out the details with the customer afterwards.
export default function PlanTrip() {
  const [params] = useSearchParams();
  const packageId = params.get("package");
  const { user } = useAuth();
  const pkg = useQuery({
    queryKey: ["travel_package", packageId],
    enabled: !!packageId,
    queryFn: async () => (await db.from("travel_packages").select("*").eq("id", packageId).maybeSingle()).data as Package | null,
  });

  const [step, setStep] = useState(1);
  const [from, setFrom] = useState("");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [name, setName] = useState((user?.user_metadata?.full_name as string) ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  // "Plan a trip here" on a destination card says where they want to go
  const [message, setMessage] = useState(() => (params.get("place") ? `I'd like to visit ${params.get("place")!.slice(0, 40)}.` : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; token: string } | null>(null);

  const today = todayIso();
  const datesValid = !!arrival && !!departure && arrival >= today && departure >= arrival;
  const toggle = (n: Need) => setNeeds((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  const go = (s: number) => {
    setError(null);
    setStep(s);
    window.scrollTo(0, 0);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const pkgNote = pkg.data ? `Package: ${pkg.data.name} (${pkg.data.days} days)` : "";
      const r = await rpc<{ reference: string; token: string }>("travel_request_trip", {
        p: {
          destination: "Rwanda",
          travelling_from: from,
          arrival_date: arrival,
          departure_date: departure,
          travelers,
          needs,
          package_id: packageId,
          name,
          phone,
          email,
          message: [pkgNote, message.trim()].filter(Boolean).join("\n\n"),
        },
      });
      setResult(r);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <ServiceLayout>
        <RequestReceived
          service="travel"
          title="Request Received"
          message="Thank you. Isoko will plan your trip for you."
          reference={result.reference}
          viewTo={`/travel/trip/${result.token}`}
        />
      </ServiceLayout>
    );
  }

  return (
    <ServiceLayout>
      <FlowColumn>
        {pkg.data && (
          <p className={cn("mb-6 rounded-xl px-4 py-3 text-sm", THEME.travel.soft)}>
            You chose <span className="font-semibold">{pkg.data.name}</span> ({pkg.data.days} days). We'll shape it around your dates.
          </p>
        )}

        {step === 1 && (
          <>
            <StepHeader service="travel" step={1} total={TOTAL} title="Where are you going?" />
            <div className="space-y-5">
              <ChoiceCard service="travel" multi={false} selected onClick={() => {}} icon={MapPin} title="Rwanda 🇷🇼" description="Kigali, Akagera, Musanze, Volcanoes, Nyungwe, Lake Kivu" />
              <Field label="Where are you travelling from?" htmlFor="from" optional>
                <Input id="from" placeholder="e.g. Dubai" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={80} autoComplete="country-name" />
              </Field>
              <PrimaryButton service="travel" onClick={() => go(2)}>Continue</PrimaryButton>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepHeader service="travel" step={2} total={TOTAL} title="When are you coming?" onBack={() => go(1)} />
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (datesValid) go(3);
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Arrival date" htmlFor="arrival">
                  <Input id="arrival" type="date" min={today} value={arrival} onChange={(e) => setArrival(e.target.value)} required />
                </Field>
                <Field label="Departure date" htmlFor="departure">
                  <Input id="departure" type="date" min={arrival || today} value={departure} onChange={(e) => setDeparture(e.target.value)} required />
                </Field>
              </div>
              {arrival && departure && departure < arrival && <FormError message="Departure must be on or after your arrival date." />}
              <Field label="Number of travelers">
                <div className="flex items-center gap-4">
                  <button type="button" aria-label="Fewer travelers" onClick={() => setTravelers((n) => Math.max(1, n - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl border hover:bg-muted">
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="w-12 text-center text-2xl font-bold" aria-live="polite">{travelers}</span>
                  <button type="button" aria-label="More travelers" onClick={() => setTravelers((n) => Math.min(100, n + 1))} className="flex h-12 w-12 items-center justify-center rounded-xl border hover:bg-muted">
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </Field>
              <PrimaryButton service="travel" type="submit" disabled={!datesValid}>Continue</PrimaryButton>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <StepHeader service="travel" step={3} total={TOTAL} title="What do you need?" onBack={() => go(2)} />
            <div className="space-y-3">
              {NEEDS.map((n) => (
                <ChoiceCard key={n.key} service="travel" selected={needs.includes(n.key)} onClick={() => toggle(n.key)} icon={n.icon} title={n.label} description={n.description} />
              ))}
              <div className="pt-2">
                <ChoiceCard
                  service="travel"
                  selected={needs.includes(PLAN_EVERYTHING.key)}
                  onClick={() => toggle(PLAN_EVERYTHING.key)}
                  icon={PLAN_EVERYTHING.icon}
                  title={PLAN_EVERYTHING.label}
                  description={PLAN_EVERYTHING.description}
                  badge="Recommended"
                />
              </div>
              <PrimaryButton service="travel" className="mt-3" disabled={needs.length === 0} onClick={() => go(4)}>
                Continue
              </PrimaryButton>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <StepHeader service="travel" step={4} total={TOTAL} title="How can we reach you?" onBack={() => go(3)} />
            <form className="space-y-4" onSubmit={submit}>
              <Field label="Name" htmlFor="name">
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </Field>
              <Field label="WhatsApp / Phone" htmlFor="phone" hint="Include your country code, e.g. +971 50 123 4567">
                <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={40} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
              </Field>
              <Field label="Anything you want us to know?" htmlFor="message" optional>
                <Textarea id="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1800} placeholder="Budget, special occasions, places you'd love to see…" />
              </Field>
              <FormError message={error} />
              <PrimaryButton service="travel" type="submit" busy={busy} disabled={!name.trim() || !phone.trim() || !email.trim()}>
                SEND REQUEST
              </PrimaryButton>
            </form>
          </>
        )}
      </FlowColumn>
    </ServiceLayout>
  );
}
