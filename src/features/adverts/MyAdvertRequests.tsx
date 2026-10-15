import { useState } from "react";
import { Clock, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import { findCurrency, rateAge, useCurrencies, usePaymentRoutes } from "@/lib/currencies";
import { currencyLabel, formatAmount, moneyFromDb, parseMoney, type Currency } from "@/lib/money";
import {
  PLACEMENTS, STATUS_LABEL, acceptAdvertAgreement, declineAdvertAgreement, reviseAdvertBudget,
  statusTone, useMyAdvertAgreements, useMyAdvertRequests,
  type AdvertAgreement, type MyAdvertRequest,
} from "./api";

/**
 * "Your advertising requests", on the customer dashboard.
 *
 * Submitting gave the advertiser a reference and nothing else: the row policy
 * letting them read their own request was written with the table and then
 * never used by any screen, so the only way to learn what had become of an
 * enquiry was to ask the office. This is that policy's screen.
 *
 * It now carries the quote as well as the status, because "Quoted" is a word
 * about a number the advertiser could not see. A quote shows the daily rate,
 * the days and the fee in the currency it was quoted in, with the exchange
 * rate written out when one was used -- and it can be accepted or turned down
 * here rather than by email.
 *
 * Two things are deliberately not here. Staff notes, which are written for
 * the office. And any conversion of the fee into another currency "for
 * convenience": the fee is the figure in the agreement, and showing a second
 * number beside it invites somebody to pay that one instead.
 */

const placementLabel = (key: string) => PLACEMENTS.find((p) => p.key === key)?.label ?? key;

/**
 * The quote, in the currency it was quoted in and nothing else.
 *
 * Top level rather than nested in the card: it holds a query of its own, and
 * a component redefined on every parent render would remount and re-ask for
 * the payment routes each time.
 */
function Quote({
  agreement, currencies, busy, onRespond,
}: {
  agreement: AdvertAgreement;
  currencies: Currency[] | undefined;
  busy: string | null;
  onRespond: (id: string, action: "accept" | "decline") => void;
}) {
  const currency = findCurrency(currencies, agreement.currency);
  const total = moneyFromDb(agreement.total, currency.minor_units) ?? 0n;
  const daily = moneyFromDb(agreement.daily_rate, currency.minor_units) ?? 0n;
  const awaitingRate = agreement.fx_rate !== null && agreement.rate_confirmed_at === null;
  const routes = usePaymentRoutes(agreement.status === "accepted" ? agreement.currency : null, null);

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
      <p className="text-sm font-semibold text-foreground">
        {formatAmount(total, currency, { code: true })}
        <span className="font-normal text-muted-foreground">
          {" "}for {agreement.days} day{agreement.days === 1 ? "" : "s"} at{" "}
          {formatAmount(daily, currency)} a day
        </span>
      </p>
      {agreement.starts_on && (
        <p className="text-muted-foreground">
          Running {new Date(agreement.starts_on).toLocaleDateString()}
          {agreement.ends_on ? ` to ${new Date(agreement.ends_on).toLocaleDateString()}` : ""}
        </p>
      )}

      {/* The rate, written out. An advertiser accepting a converted price is
          entitled to see what it was converted at and when that was read. */}
      {agreement.fx_rate && (
        <p className="text-muted-foreground">
          Priced from our {agreement.fx_base ?? "USD"} rate card at 1 {agreement.fx_base ?? "USD"} ={" "}
          {Number(agreement.fx_rate).toPrecision(6)} {agreement.currency}
          {agreement.fx_read_at ? `, ${rateAge(agreement.fx_read_at)}` : ""}
          {agreement.fx_source ? ` (${agreement.fx_source})` : ""}.
          {agreement.rate_confirmed_at
            ? " ISOKO has confirmed this rate, and the fee above will not change if the rate moves."
            : ""}
        </p>
      )}
      {agreement.payment_terms && <p className="text-muted-foreground">Terms: {agreement.payment_terms}</p>}
      {agreement.note && <p className="whitespace-pre-line text-muted-foreground">{agreement.note}</p>}

      {awaitingRate ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          This price came from an exchange rate ISOKO still has to confirm. You will be told as
          soon as it is, and only then can it be accepted.
        </p>
      ) : agreement.status === "proposed" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy === agreement.id} onClick={() => onRespond(agreement.id, "accept")}>
            {busy === agreement.id ? "Saving…" : `Accept ${formatAmount(total, currency, { code: true })}`}
          </Button>
          <Button size="sm" variant="outline" disabled={busy === agreement.id}
            onClick={() => onRespond(agreement.id, "decline")}>
            Not for me
          </Button>
        </div>
      ) : null}

      {/* Once accepted, what can actually pay it -- and what cannot, with the
          reason, because "mobile money" is RWF-only and a Kenyan advertiser
          should be told that in words. */}
      {agreement.status === "accepted" && routes.data && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="font-medium text-foreground">Paying this</p>
          {routes.data.available.map((m) => (
            <p key={m.id} className="text-muted-foreground">{m.label} — {m.instructions}</p>
          ))}
          {routes.data.available.length === 0 && (
            <p className="text-muted-foreground">
              We will write to you with payment details for {agreement.currency}.
            </p>
          )}
          {routes.data.unavailable.map((m) => (
            <p key={m.id} className="text-muted-foreground/80">{m.label}: {m.reason}.</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyAdvertRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mine = useMyAdvertRequests(user?.id);
  const quotes = useMyAdvertAgreements(user?.id);
  const { data: currencies } = useCurrencies();
  const [busy, setBusy] = useState<string | null>(null);
  const [revising, setRevising] = useState<string | null>(null);
  const [newBudget, setNewBudget] = useState("");
  const [newCurrency, setNewCurrency] = useState("");

  // Nothing is said to someone who has never asked: an empty card on every
  // dashboard would be advertising the form, not reporting on a request.
  if (!user || mine.isLoading || mine.isError || (mine.data ?? []).length === 0) return null;

  const requests = mine.data ?? [];
  const liveQuote = (requestId: string): AdvertAgreement | undefined =>
    (quotes.data ?? []).find((a) => a.request_id === requestId && (a.status === "proposed" || a.status === "accepted"));

  const respond = async (id: string, action: "accept" | "decline") => {
    setBusy(id);
    try {
      if (action === "accept") {
        await acceptAdvertAgreement(id);
        toast({ title: "Quote accepted", description: "We will be in touch about payment." });
      } else {
        await declineAdvertAgreement(id, "Declined from the dashboard");
        toast({ title: "Quote declined" });
      }
      await Promise.all([quotes.refetch(), mine.refetch()]);
    } catch (e) {
      toast({ title: "That did not go through", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const saveBudget = async (r: MyAdvertRequest) => {
    const currency = findCurrency(currencies, newCurrency || r.budget_currency);
    if (parseMoney(newBudget.trim(), currency.minor_units) === null) {
      return toast({ title: "Give the amount as a number, with no commas", variant: "destructive" });
    }
    setBusy(r.id);
    try {
      await reviseAdvertBudget({ request_id: r.id, amount: newBudget.trim(), currency: currency.code });
      toast({
        title: "Budget updated",
        description: `We will quote up to ${newBudget.trim()} ${currency.code}.`,
      });
      setRevising(null);
      setNewBudget("");
      await Promise.all([mine.refetch(), quotes.refetch()]);
    } catch (e) {
      toast({ title: "Could not change the budget", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5" /> Your Advertising Requests
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {requests.length === 1 ? "1 request" : `${requests.length} requests`}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.slice(0, 5).map((r) => {
          const budgetCurrency = findCurrency(currencies, r.budget_currency);
          const budget = moneyFromDb(r.budget_amount, budgetCurrency.minor_units);
          const quote = liveQuote(r.id);
          return (
            <div key={r.id} className="border-b border-border pb-3 text-sm last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.what_to_advertise}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{r.reference}</span> · {placementLabel(r.placement)} · {r.duration}
                    {budget !== null && r.budget_currency
                      ? ` · up to ${formatAmount(budget, budgetCurrency, { code: true })}`
                      : ""}
                  </p>
                </div>
                <Badge className={statusTone(r.status)} variant="outline">
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </div>

              {quote && <Quote agreement={quote} currencies={currencies} busy={busy} onRespond={respond} />}

              {/* A budget can be raised, but only by the advertiser and only
                  as a new statement: the one they gave before is kept. */}
              {!quote && budget !== null && (
                revising === r.id ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_minmax(0,12rem)]">
                      <div className="space-y-1">
                        <Label htmlFor={`budget-${r.id}`} className="text-xs">New maximum</Label>
                        <Input id={`budget-${r.id}`} inputMode="decimal" value={newBudget}
                          onChange={(e) => setNewBudget(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`currency-${r.id}`} className="text-xs">Currency</Label>
                        <Select value={newCurrency || r.budget_currency || ""} onValueChange={setNewCurrency}>
                          <SelectTrigger id={`currency-${r.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(currencies ?? []).map((c) => (
                              <SelectItem key={c.code} value={c.code}>{currencyLabel(c)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === r.id} onClick={() => saveBudget(r)}>
                        {busy === r.id ? "Saving…" : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRevising(null); setNewBudget(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="mt-1 h-auto p-0 text-xs"
                    onClick={() => { setRevising(r.id); setNewBudget(""); setNewCurrency(r.budget_currency ?? ""); }}>
                    Change my budget
                  </Button>
                )
              )}
            </div>
          );
        })}
        {requests.length > 5 && (
          <p className="text-xs text-muted-foreground">
            Showing the 5 most recent. Quote your reference when you write to us about an older one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
