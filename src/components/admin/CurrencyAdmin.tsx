import { useEffect, useMemo, useState } from "react";
import { Coins, Globe, Landmark, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, errorText, unwrap } from "@/features/services/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { currencyLabel, parseMoney, type Currency } from "@/lib/money";
import { rateAge, useCountryCurrencies } from "@/lib/currencies";
import { useAdvertRevenue } from "@/features/adverts/api";

/**
 * Currencies, rates and the ways money can arrive.
 *
 * Four lists an administrator can change without a deploy, because all four
 * are business facts rather than code: which currencies ISOKO quotes in, what
 * a placement costs in each, which payment methods exist where, and the
 * currency consolidated reports add up in.
 *
 * What an administrator deliberately cannot change is an exchange rate. A rate
 * somebody can type is a rate somebody can type to anything; they come from a
 * provider on a schedule (fx_refresh()) and are read-only here, shown with
 * their age so a stale one is visible rather than silently load-bearing.
 */

type FxRate = { quote: string; base: string; rate: string; fetched_at: string; source: string | null };
type PaymentMethod = {
  id: string; label: string; method: string; provider: string;
  currencies: string[]; countries: string[]; is_active: boolean; instructions: string; sort: number;
};

function useAllCurrencies() {
  return useQuery({
    queryKey: ["currencies", "all"],
    queryFn: async () =>
      (unwrap(await db.from("currencies").select("*").order("sort").order("code")) ?? []) as Currency[],
  });
}

function useFxRates() {
  return useQuery({
    queryKey: ["fx-rates", "all"],
    queryFn: async () =>
      (unwrap(await db.from("fx_rates").select("quote, base, rate, fetched_at, source").order("quote")) ?? []) as FxRate[],
  });
}

function usePaymentMethods() {
  return useQuery({
    queryKey: ["payment-methods", "all"],
    queryFn: async () =>
      (unwrap(await db.from("payment_methods").select("*").order("sort")) ?? []) as PaymentMethod[],
  });
}

export default function CurrencyAdmin() {
  const { toast } = useToast();
  const currencies = useAllCurrencies();
  const countries = useCountryCurrencies();
  const rates = useFxRates();
  const methods = usePaymentMethods();

  const [busy, setBusy] = useState<string | null>(null);
  const [reportingCurrency, setReportingCurrency] = useState("");
  const [staleDays, setStaleDays] = useState("");

  const active = useMemo(
    () => (currencies.data ?? []).filter((c) => c.is_active),
    [currencies.data],
  );
  const revenue = useAdvertRevenue(reportingCurrency || undefined);

  const settings = useQuery({
    queryKey: ["platform-settings", "money"],
    queryFn: async () => {
      const { data } = await db
        .from("platform_settings").select("key, value")
        .in("key", ["reporting_currency", "fx_stale_days"]);
      const map = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
      return map as { reporting_currency?: string; fx_stale_days?: string };
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setReportingCurrency((prev) => prev || settings.data.reporting_currency || "RWF");
    setStaleDays((prev) => prev || settings.data.fx_stale_days || "7");
  }, [settings.data]);

  const run = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await work();
      toast({ title: done });
    } catch (e) {
      toast({ title: "That did not save", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggleCurrency = (c: Currency) =>
    run(`cur-${c.code}`, async () => {
      unwrap(await db.from("currencies").update({ is_active: !c.is_active }).eq("code", c.code));
      await currencies.refetch();
    }, `${c.code} ${c.is_active ? "withdrawn" : "available"}`);

  const setCountryCurrency = (country: string, currency: string) =>
    run(`country-${country}`, async () => {
      unwrap(await db.from("country_currency").update({ currency }).eq("country", country));
      await countries.refetch();
    }, "Country updated");

  const toggleMethod = (m: PaymentMethod) =>
    run(`pm-${m.id}`, async () => {
      unwrap(await db.from("payment_methods").update({ is_active: !m.is_active }).eq("id", m.id));
      await methods.refetch();
    }, m.is_active ? `${m.label} switched off` : `${m.label} switched on`);

  const saveReporting = () =>
    run("reporting", async () => {
      unwrap(await db.from("platform_settings")
        .upsert({ key: "reporting_currency", value: reportingCurrency }, { onConflict: "key" }));
      await Promise.all([settings.refetch(), revenue.refetch()]);
    }, `Reports consolidate in ${reportingCurrency}`);

  const saveStaleDays = () => {
    if (!/^[0-9]{1,2}$/.test(staleDays.trim()) || Number(staleDays) < 1) {
      return toast({ title: "Give a number of days, at least 1", variant: "destructive" });
    }
    return run("stale", async () => {
      unwrap(await db.from("platform_settings")
        .upsert({ key: "fx_stale_days", value: staleDays.trim() }, { onConflict: "key" }));
      await settings.refetch();
    }, `A rate older than ${staleDays.trim()} day(s) will not be used`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Coins className="h-5 w-5 text-primary" /> Currencies and rates
        </h2>
        <p className="text-sm text-muted-foreground">
          What ISOKO quotes in, what advertising costs, and how money can arrive. Exchange rates
          themselves are fetched on a schedule and cannot be typed here.
        </p>
      </div>

      {/* ---------- The currencies ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Currencies we quote in</CardTitle>
          <CardDescription>
            Switching one off stops it being offered. Nothing already agreed or paid in it is
            touched — that is why these are switched off rather than deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Decimals</TableHead>
                <TableHead>Smallest step</TableHead>
                <TableHead>Rate held</TableHead>
                <TableHead className="text-right">Offered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(currencies.data ?? []).map((c) => {
                const held = (rates.data ?? []).find((r) => r.quote === c.code);
                return (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.symbol}</TableCell>
                    <TableCell>{c.minor_units}</TableCell>
                    <TableCell>{String(c.rounding_step)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.code === "USD"
                        ? "the base — no rate needed"
                        : held
                          ? `1 USD = ${Number(held.rate).toPrecision(8)} ${c.code}, ${rateAge(held.fetched_at)}`
                          : "none yet"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch checked={c.is_active} disabled={busy === `cur-${c.code}`}
                        onCheckedChange={() => toggleCurrency(c)}
                        aria-label={`Offer ${c.code}`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(rates.data ?? []).length === 0 && (
            <p className="pt-3 text-xs text-muted-foreground">
              No rates have been fetched yet. Quoting does not need one — a fee is typed in the
              advertiser's own currency — but revenue cannot be consolidated across currencies
              until a rate arrives, and nothing will be converted on a guess.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Which country suggests which ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-4 w-4" /> Country defaults
          </CardTitle>
          <CardDescription>
            What the advertising form suggests to somebody in each country. Always a suggestion:
            the advertiser can choose any currency we offer.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(countries.data ?? []).map((c) => (
            <div key={c.country} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
              <span className="text-sm">
                {c.name} <span className="font-mono text-xs text-muted-foreground">{c.country}</span>
              </span>
              <Select value={c.currency} disabled={busy === `country-${c.country}`}
                onValueChange={(v) => setCountryCurrency(c.country, v)}>
                <SelectTrigger className="w-28" aria-label={`Currency for ${c.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {active.map((cur) => <SelectItem key={cur.code} value={cur.code}>{cur.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- Payment methods ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-4 w-4" /> Ways to pay
          </CardTitle>
          <CardDescription>
            A method is offered only for the currencies and countries it really works in. Mobile
            money through ItecPay takes Rwandan francs from Rwandan numbers and nothing else, so
            an advertiser paying in another currency is shown the bank transfer and told why.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Through</TableHead>
                <TableHead>Currencies</TableHead>
                <TableHead>Countries</TableHead>
                <TableHead className="text-right">On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(methods.data ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.provider}</TableCell>
                  <TableCell className="text-xs">
                    {m.currencies.length ? m.currencies.join(", ") : "any we quote in"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.countries.length ? m.countries.join(", ") : "anywhere"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={m.is_active} disabled={busy === `pm-${m.id}`}
                      onCheckedChange={() => toggleMethod(m)} aria-label={`Offer ${m.label}`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---------- Reporting ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-4 w-4" /> Advertising revenue
          </CardTitle>
          <CardDescription>
            What was earned, in the currency it was earned in. The consolidated figure is an
            arithmetic convenience: it is converted at today's rates and the originals above it are
            the facts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reporting-currency">Consolidate in</Label>
              <Select value={reportingCurrency} onValueChange={setReportingCurrency}>
                <SelectTrigger id="reporting-currency" className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {active.map((c) => <SelectItem key={c.code} value={c.code}>{currencyLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={busy === "reporting"} onClick={saveReporting}>
              Make this the default
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor="stale-days">Ignore a rate older than</Label>
              <div className="flex items-center gap-2">
                <Input id="stale-days" className="w-20" inputMode="numeric" value={staleDays}
                  onChange={(e) => setStaleDays(e.target.value)} />
                <span className="text-sm text-muted-foreground">days</span>
                <Button size="sm" variant="outline" disabled={busy === "stale"} onClick={saveStaleDays}>
                  Save
                </Button>
              </div>
            </div>
          </div>

          {revenue.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Working it out…
            </p>
          ) : revenue.isError ? (
            <p className="text-sm text-muted-foreground">We could not read the revenue just now.</p>
          ) : revenue.data && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead>Agreements</TableHead>
                    <TableHead>Charged</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Fees</TableHead>
                    <TableHead>Settled</TableHead>
                    <TableHead>In {revenue.data.reporting_currency}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.data.by_currency.map((r) => (
                    <TableRow key={r.currency}>
                      <TableCell className="font-mono text-xs">{r.currency}</TableCell>
                      <TableCell>{r.accounts}</TableCell>
                      <TableCell>{r.charged}</TableCell>
                      <TableCell>{r.paid}</TableCell>
                      <TableCell>{r.fees}</TableCell>
                      <TableCell>{r.settled}</TableCell>
                      <TableCell className="text-xs">
                        {r.convertible ? (
                          <>
                            {r.converted_paid}
                            <span className="text-muted-foreground">
                              {" "}at {r.rate && Number(r.rate).toPrecision(6)}
                              {r.rate_read_at ? `, ${rateAge(r.rate_read_at)}` : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">no fresh rate — not included</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {revenue.data.by_currency.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        No advertising has been charged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="text-sm">
                <span className="font-semibold">
                  {revenue.data.consolidated_paid} {revenue.data.reporting_currency}
                </span>{" "}
                <span className="text-muted-foreground">
                  paid in all, converted at today's rates.
                  {revenue.data.not_converted.length > 0 && (
                    <> {revenue.data.not_converted.join(", ")} could not be converted and{" "}
                      {revenue.data.not_converted.length === 1 ? "is" : "are"} not in that figure.</>
                  )}
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
