import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, Loader2, Megaphone, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/features/services/api";
import { useCountryCurrencies, useCurrencies, useCurrencySuggestion, findCurrency } from "@/lib/currencies";
import { currencyLabel, formatAmount, parseMoney } from "@/lib/money";
import {
  ARTWORK_ACCEPT, DURATION_DAYS, DURATIONS, PLACEMENTS, advertProblem, artworkProblem,
  submitAdvertRequest, uploadArtwork, useMyProducts, type AdvertInput,
} from "./api";

/** The value the country select uses for "my country isn't listed". */
const ELSEWHERE = "__elsewhere__";

const EMPTY: AdvertInput = {
  full_name: "", company: "", email: "", phone: "", industry: "",
  what_to_advertise: "", placement: "", duration: "", country: "",
  budget_amount: "", budget_currency: "", product_ids: [],
  preferred_start: "", preferred_days: "", message: "",
};

/** The database refuses more than this, so the form stops before it asks. */
const MAX_PRODUCTS = 12;

/**
 * Asking ISOKO GROUP to carry your advertising.
 *
 * It does not need an account: an advertiser should not have to register to ask
 * a question. Artwork is the one thing that does, because a file has to belong
 * to somebody for storage to accept it; without an account the form says so
 * plainly rather than hiding the field.
 *
 * The budget is the part that changed. It used to say "in RWF", which asked a
 * Kenyan business to convert their own money in their head against a rate
 * nobody had shown them. Now the form suggests a currency from the country --
 * from their profile if they are a seller, otherwise from the device's own
 * time zone, never from the language the browser is set to -- says in words
 * where the suggestion came from, and lets them change it. When there is
 * nothing to go on it asks, which is the honest version of a guess.
 *
 * Nothing here publishes an advert or takes a payment. It records an enquiry,
 * tells the office, and says that somebody will be in touch with a price.
 */
export default function AdvertiseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<AdvertInput>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Whether the person has touched the country or currency themselves. Once
  // they have, the suggestion stops moving under them.
  const [chosen, setChosen] = useState(false);

  const { data: currencies } = useCurrencies();
  const { data: countries } = useCountryCurrencies();
  const suggestion = useCurrencySuggestion(user?.id);
  const { data: products } = useMyProducts(user?.id);

  const currency = useMemo(
    () => findCurrency(currencies, form.budget_currency || null),
    [currencies, form.budget_currency],
  );

  // A fresh form every time it is opened, so a previous enquiry is never half
  // left behind in the fields.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, email: user?.email ?? "" });
      setFile(null);
      setError(null);
      setDone(null);
      setSaving(false);
      setChosen(false);
    }
  }, [open, user?.email]);

  // The suggestion, once, and only until the person says otherwise.
  useEffect(() => {
    if (!open || chosen || !suggestion.ready) return;
    setForm((f) => (f.country || f.budget_currency ? f : {
      ...f,
      country: suggestion.country ?? "",
      budget_currency: suggestion.currency ?? "",
    }));
  }, [open, chosen, suggestion.ready, suggestion.country, suggestion.currency]);

  const set = (k: keyof AdvertInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const problem = advertProblem(form, currency);

  /** Choosing a country moves the currency with it, unless they have set one. */
  const pickCountry = (value: string) => {
    setChosen(true);
    if (value === ELSEWHERE) {
      setForm((f) => ({ ...f, country: "" }));
      return;
    }
    const row = countries?.find((c) => c.country === value);
    setForm((f) => ({ ...f, country: value, budget_currency: row?.currency ?? f.budget_currency }));
  };

  /**
   * Ticking your own listings. The first one chosen fills in what you are
   * advertising, so the free-text field is not asked for twice.
   */
  const toggleProduct = (id: string) => {
    setForm((f) => {
      const chosenIds = f.product_ids ?? [];
      const has = chosenIds.includes(id);
      if (!has && chosenIds.length >= MAX_PRODUCTS) return f;
      const next = has ? chosenIds.filter((p) => p !== id) : [...chosenIds, id];
      const product = products?.find((p) => p.id === id);
      return {
        ...f,
        product_ids: next,
        what_to_advertise: f.what_to_advertise.trim() || (!has && product ? product.name : f.what_to_advertise),
      };
    });
  };

  const pickFile = (chosenFile: File | undefined) => {
    if (!chosenFile) return;
    const bad = artworkProblem(chosenFile);
    if (bad) return setError(bad);
    setError(null);
    setFile(chosenFile);
  };

  const submit = async () => {
    setError(null);
    const bad = advertProblem(form, currency);
    if (bad) return setError(bad);
    setSaving(true);
    try {
      let artwork_path: string | null = null;
      if (file && user) artwork_path = await uploadArtwork(user.id, file);
      // The duration the advertiser picked becomes a number of days the office
      // can quote from, unless they gave their own.
      const days = String(form.preferred_days ?? "").trim() || String(DURATION_DAYS[form.duration] ?? "");
      const { reference } = await submitAdvertRequest(
        { ...form, artwork_path, preferred_days: days }, currency,
      );
      setDone(reference);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );

  // What the budget reads as once it is a valid amount, so the seller can see
  // the currency applied to their own figure before they send it.
  const budgetMinor = parseMoney(String(form.budget_amount ?? ""), currency.minor_units);
  const budgetReads = budgetMinor !== null && budgetMinor > 0n
    ? formatAmount(budgetMinor, currency, { code: true })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Megaphone className="h-5 w-5 text-primary" />
            Advertise with ISOKO GROUP
          </DialogTitle>
          <DialogDescription>
            Tell us what you would like to advertise and our team will come back to you with
            placements and a price in your own currency. Sending this does not publish anything
            or commit you to a cost.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <div className="space-y-1">
              <p className="font-semibold">Thank you — we have your request.</p>
              <p className="text-sm text-muted-foreground">
                Your reference is <span className="font-mono font-semibold text-foreground">{done}</span>.
                Our team will review it and come back to you with a quote
                {form.budget_currency ? ` in ${form.budget_currency}` : ""}, on the email or number
                you gave us. Nothing has been published and you have not been charged.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="adv-name" label="Full name">
                <Input id="adv-name" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} autoComplete="name" />
              </Field>
              <Field id="adv-company" label="Company or business name">
                <Input id="adv-company" value={form.company} onChange={(e) => set("company")(e.target.value)} autoComplete="organization" />
              </Field>
              <Field id="adv-email" label="Email address">
                <Input id="adv-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" />
              </Field>
              <Field id="adv-phone" label="Phone or WhatsApp">
                <Input id="adv-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} autoComplete="tel" placeholder="+250 7.." />
              </Field>
              <Field id="adv-industry" label="Type of business or industry">
                <Input id="adv-industry" value={form.industry} onChange={(e) => set("industry")(e.target.value)} placeholder="Coffee, logistics, fashion.." />
              </Field>
              <div className="space-y-1.5">
                <Label htmlFor="adv-country">Country you are advertising from</Label>
                {/* Empty until there is something to show: before a country
                    is known or chosen the placeholder asks, rather than
                    "Somewhere else" sitting there looking like an answer. */}
                <Select value={form.country || (chosen ? ELSEWHERE : "")} onValueChange={pickCountry}>
                  <SelectTrigger id="adv-country"><SelectValue placeholder="Choose your country" /></SelectTrigger>
                  <SelectContent>
                    {(countries ?? []).map((c) => (
                      <SelectItem key={c.country} value={c.country}>{c.name}</SelectItem>
                    ))}
                    <SelectItem value={ELSEWHERE}>Somewhere else</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Where the suggestion came from, so it can be disagreed with. A
                guess presented as a fact is the thing to avoid. */}
            {!chosen && suggestion.because && form.budget_currency && (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  We suggested {form.budget_currency} {suggestion.because}. Change either if that is not right.
                </span>
              </p>
            )}

            {/* Your own listings. These are what slides in the advertising
                band once a quote has been agreed -- not before, which the
                text says so nobody expects the homepage for free. */}
            {user && (products?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>Your products to advertise (optional)</Label>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {(products ?? []).map((p) => {
                    const chosenIds = form.product_ids ?? [];
                    const checked = chosenIds.includes(p.id);
                    const full = !checked && chosenIds.length >= MAX_PRODUCTS;
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 rounded-md p-1.5 text-sm ${
                          full ? "opacity-50" : "cursor-pointer hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={full}
                          onCheckedChange={() => toggleProduct(p.id)}
                          aria-label={`Advertise ${p.name}`}
                        />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {p.price.toLocaleString()} RWF
                          {p.status === "active" ? "" : ` · ${p.status}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(form.product_ids?.length ?? 0) > 0
                    ? `${form.product_ids?.length} chosen. They start sliding in the advertising band once you and our team have agreed a price, and come down when the run ends.`
                    : `Pick up to ${MAX_PRODUCTS}. They start sliding in the advertising band once a price is agreed.`}
                  {" "}Your shelf price stays in RWF as listed; the advertising fee is separate and is
                  quoted in the currency you choose below.
                </p>
              </div>
            )}

            <Field id="adv-what" label="What would you like to advertise?">
              <Textarea id="adv-what" rows={3} value={form.what_to_advertise} onChange={(e) => set("what_to_advertise")(e.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Preferred placement</Label>
                <Select value={form.placement} onValueChange={set("placement")}>
                  <SelectTrigger><SelectValue placeholder="Where should it appear?" /></SelectTrigger>
                  <SelectContent>
                    {PLACEMENTS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How long should it run?</Label>
                <Select value={form.duration} onValueChange={set("duration")}>
                  <SelectTrigger><SelectValue placeholder="Choose a duration" /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Field id="adv-start" label="Preferred start date (optional)">
                <Input id="adv-start" type="date" value={form.preferred_start}
                  onChange={(e) => set("preferred_start")(e.target.value)} />
              </Field>
              <Field id="adv-days" label="Exact number of days (optional)">
                <Input id="adv-days" inputMode="numeric" value={form.preferred_days}
                  onChange={(e) => set("preferred_days")(e.target.value)}
                  placeholder={String(DURATION_DAYS[form.duration] ?? "30")} />
              </Field>
            </div>

            {/* The budget and its currency, side by side and never apart: an
                amount with no currency beside it is not money. */}
            <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,14rem)]">
              <Field id="adv-budget" label="Maximum advertising budget (optional)">
                <Input id="adv-budget" inputMode="decimal" value={form.budget_amount}
                  onChange={(e) => set("budget_amount")(e.target.value)}
                  aria-describedby="adv-budget-reads"
                  placeholder="Enter your maximum advertising budget in your selected currency." />
              </Field>
              <div className="space-y-1.5">
                <Label htmlFor="adv-currency">Currency</Label>
                <Select
                  value={form.budget_currency}
                  onValueChange={(v) => { setChosen(true); set("budget_currency")(v); }}
                >
                  <SelectTrigger id="adv-currency"><SelectValue placeholder="Choose a currency" /></SelectTrigger>
                  <SelectContent>
                    {(currencies ?? []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>{currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p id="adv-budget-reads" className="text-xs text-muted-foreground">
              {budgetReads
                ? `We will read that as ${budgetReads}, and will not quote above it.`
                : "We will quote in this currency and will not go above the maximum you give."}
            </p>

            <Field id="adv-message" label="Anything else? (optional)">
              <Textarea id="adv-message" rows={2} value={form.message} onChange={(e) => set("message")(e.target.value)} />
            </Field>

            {/* Artwork needs an account, because storage will only take a file
                that belongs to somebody. Saying so beats a field that fails. */}
            <div className="space-y-1.5">
              <Label>Advert image, banner or logo (optional)</Label>
              {user ? (
                file ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                    <span className="truncate">{file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)} aria-label="Remove the file">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary">
                    <Upload className="h-4 w-4" />
                    Choose a JPG, PNG, WEBP, AVIF or PDF, up to 10 MB
                    <input type="file" accept={ARTWORK_ACCEPT} className="hidden"
                      onChange={(e) => pickFile(e.target.files?.[0])} />
                  </label>
                )
              ) : (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Sign in to attach artwork, or send this request now and reply to our email with the file.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="button" className="w-full gap-2" size="lg" disabled={saving || !!problem} onClick={submit}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Megaphone className="h-4 w-4" /> Submit Advertising Request</>}
            </Button>
            {problem && <p className="text-center text-xs text-muted-foreground">{problem}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
