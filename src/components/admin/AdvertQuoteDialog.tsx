import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import { findCurrency, useCurrencies, usePaymentRoutes } from "@/lib/currencies";
import { currencyLabel, formatAmount, moneyFromDb, moneyToString, parseMoney, totalFor } from "@/lib/money";
import { DURATION_DAYS, proposeAgreement, type AdvertDeskRow } from "@/features/adverts/api";

/**
 * Quoting for an advertising request.
 *
 * There is no rate card: advertising here is negotiated, so the only figure
 * the office starts from is what the advertiser said they could spend. This
 * screen puts that figure next to the total as it is typed, and makes the one
 * rule visible before the database enforces it: a fee is compared with a
 * budget only in the same currency. Quoting in another one is explained here
 * rather than refused with an error code there.
 *
 * Nothing on this screen converts anything. The day rate is typed in the
 * advertiser's own currency, which is why a quote carries no exchange rate
 * and there is nothing for anybody to confirm before it can be accepted.
 */
export default function AdvertQuoteDialog({
  row, open, onOpenChange, onQuoted,
}: {
  row: AdvertDeskRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onQuoted: () => void;
}) {
  const { toast } = useToast();
  const { data: currencies } = useCurrencies();
  const [currencyCode, setCurrencyCode] = useState("");
  const [days, setDays] = useState("");
  const [daily, setDaily] = useState("");
  const [total, setTotal] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [terms, setTerms] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const request = row?.request;
  const currency = useMemo(() => findCurrency(currencies, currencyCode), [currencies, currencyCode]);
  const routes = usePaymentRoutes(open ? currencyCode || null : null, request?.country ?? null);

  // Opening on a request starts from what the advertiser actually said: their
  // currency, their duration, their dates.
  useEffect(() => {
    if (!open || !request) return;
    setCurrencyCode(request.budget_currency ?? "RWF");
    setDays(String(request.preferred_days ?? DURATION_DAYS[request.duration] ?? 30));
    setStartsOn(request.preferred_start ?? "");
    setDaily("");
    setTotal("");
    setTerms("");
    setNote("");
    setSaving(false);
  }, [open, request]);

  const dailyMinor = parseMoney(daily.trim(), currency.minor_units);
  const dayCount = /^[0-9]{1,4}$/.test(days.trim()) ? Number(days.trim()) : 0;
  const arithmetic = dailyMinor !== null && dayCount > 0 ? totalFor(dailyMinor, dayCount, currency) : null;
  const typedTotal = total.trim() ? parseMoney(total.trim(), currency.minor_units) : null;
  const effectiveTotal = typedTotal ?? arithmetic;

  const budgetCurrency = findCurrency(currencies, request?.budget_currency);
  const budgetMinor = request?.budget_amount
    ? moneyFromDb(request.budget_amount, budgetCurrency.minor_units)
    : null;

  // The two refusals the database will make, said here first.
  const currencyClash = Boolean(
    request?.budget_currency && currencyCode && request.budget_currency !== currencyCode,
  );
  const overBudget = Boolean(
    !currencyClash && budgetMinor !== null && effectiveTotal !== null && effectiveTotal > budgetMinor,
  );
  const totalTooHigh = Boolean(typedTotal !== null && arithmetic !== null && typedTotal > arithmetic);

  const blocked = !request || dailyMinor === null || dayCount < 1 || currencyClash || overBudget || totalTooHigh;

  const send = async () => {
    if (!request) return;
    setSaving(true);
    try {
      await proposeAgreement({
        request_id: request.id,
        currency: currencyCode,
        daily_rate: moneyToString(dailyMinor!, currency.minor_units),
        days: String(dayCount),
        total: effectiveTotal !== null ? moneyToString(effectiveTotal, currency.minor_units) : undefined,
        starts_on: startsOn || undefined,
        payment_terms: terms || undefined,
        note: note || undefined,
      });
      toast({
        title: "Quote sent",
        description: `${request.company} has been quoted ${
          effectiveTotal !== null ? formatAmount(effectiveTotal, currency, { code: true }) : ""
        }.`,
      });
      onOpenChange(false);
      onQuoted();
    } catch (e) {
      toast({ title: "Could not send the quote", description: errorText(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quote {request?.company} · {request?.reference}</DialogTitle>
          <DialogDescription>
            The advertiser sees this quote on their dashboard and accepts or declines it there.
            Accepting opens their account and charges the fee.
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border p-3 text-xs">
              <p>
                <span className="text-muted-foreground">They asked for:</span> {request.duration}
                {request.preferred_start ? ` from ${new Date(request.preferred_start).toLocaleDateString()}` : ""}
                {request.country ? ` · advertising from ${request.country}` : ""}
              </p>
              <p>
                <span className="text-muted-foreground">Their maximum:</span>{" "}
                {budgetMinor !== null
                  ? formatAmount(budgetMinor, budgetCurrency, { code: true })
                  : "they did not give one"}
              </p>
              {(row?.products.length ?? 0) > 0 && (
                <p>
                  <span className="text-muted-foreground">
                    Listings to carry ({row!.products.length}):
                  </span>{" "}
                  {row!.products.map((p) => `${p.name} (${p.price.toLocaleString()} RWF)`).join(", ")}.
                  <span className="text-muted-foreground">
                    {" "}Those are shelf prices, not this fee. They go on air when this quote is
                    accepted, for the days it covers.
                  </span>
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="quote-currency">Currency</Label>
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger id="quote-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(currencies ?? []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>{currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-daily">Daily rate</Label>
                <Input id="quote-daily" inputMode="decimal" value={daily}
                  onChange={(e) => setDaily(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-days">Days</Label>
                <Input id="quote-days" inputMode="numeric" value={days}
                  onChange={(e) => setDays(e.target.value)} />
              </div>
            </div>

            {/* The budget as the thing the quote is built against, since
                there is no price list to start from. */}
            {budgetMinor !== null && arithmetic !== null && !currencyClash && (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {formatAmount(budgetMinor, budgetCurrency, { code: true })} is their maximum.
                  This quote {effectiveTotal !== null && effectiveTotal <= budgetMinor
                    ? `leaves ${formatAmount(budgetMinor - effectiveTotal, budgetCurrency, { code: true })} of it`
                    : "is over it"}.
                </span>
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quote-total">Total fee</Label>
                <Input id="quote-total" inputMode="decimal"
                  value={total}
                  placeholder={arithmetic !== null ? moneyToString(arithmetic, currency.minor_units) : ""}
                  onChange={(e) => setTotal(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  {arithmetic !== null
                    ? `${dayCount} days at ${formatAmount(dailyMinor!, currency)} is ${formatAmount(arithmetic, currency, { code: true })}. Leave this blank for that, or type less to come down.`
                    : "Fill in the daily rate and the days."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-start">Starts on (optional)</Label>
                <Input id="quote-start" type="date" value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)} />
              </div>
            </div>

            {/* What they will be able to pay with, so the note can say so. */}
            {routes.data && (
              <div className="rounded-lg border border-border p-3 text-xs">
                <p className="font-medium">Paying in {routes.data.currency}</p>
                {routes.data.available.map((m) => (
                  <p key={m.id} className="text-muted-foreground">Available: {m.label}</p>
                ))}
                {routes.data.unavailable.map((m) => (
                  <p key={m.id} className="text-muted-foreground">Not available: {m.label} — {m.reason}</p>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="quote-terms">Payment terms (optional)</Label>
              <Input id="quote-terms" value={terms} onChange={(e) => setTerms(e.target.value)}
                placeholder="Half before it goes live, half at the end of the month" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-note">Note to the advertiser (optional)</Label>
              <Textarea id="quote-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Why this rate, how the conversion works, which payment methods can take this currency" />
            </div>

            {currencyClash && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                This advertiser gave their maximum in {request.budget_currency}. A quote in{" "}
                {currencyCode} cannot be checked against it — comparing the two would mean converting
                a figure they committed to. Quote in {request.budget_currency}, or ask them to
                restate their budget in {currencyCode} first.
              </p>
            )}
            {overBudget && effectiveTotal !== null && budgetMinor !== null && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {formatAmount(effectiveTotal, currency, { code: true })} is over the{" "}
                {formatAmount(budgetMinor, budgetCurrency, { code: true })} they gave. Come down, or
                ask them to raise their budget first.
              </p>
            )}
            {totalTooHigh && (
              <p className="text-xs text-destructive">
                The total cannot be more than the daily rate times the days.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={send} disabled={saving || blocked}>
            {saving ? "Sending…" : "Send the quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
