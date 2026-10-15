/**
 * The currency lists, and the one the page should suggest.
 *
 * Every figure here comes from the database: which currencies ISOKO quotes
 * in, which country suggests which, and what a rate was when it was read.
 * The browser never calls an exchange-rate provider -- that happens once, in
 * the database, on a schedule (see fx_refresh()), so the figure on the page
 * is the same figure the quote was validated against.
 */
import { useQuery } from "@tanstack/react-query";
import { db, rpc, unwrap } from "@/features/services/api";
import { guessRegion, regionExplanation, type RegionSource } from "@/lib/region";
import { RWF, type Currency } from "@/lib/money";

export type CountryCurrency = {
  country: string;
  name: string;
  currency: string;
  is_supported: boolean;
};

/** What a conversion came back as, or null when none could be had. */
export type Conversion = {
  amount: string;
  currency: string;
  from_amount: string;
  from_currency: string;
  rate: string;
  base: string;
  source: string;
  fetched_at: string | null;
  indicative: boolean;
} | null;

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    // The list changes when an administrator edits it, which is rarely.
    staleTime: 30 * 60_000,
    queryFn: async () => {
      return (unwrap(
        await db.from("currencies").select("*").eq("is_active", true).order("sort").order("code"),
      ) ?? []) as Currency[];
    },
  });
}

export function useCountryCurrencies() {
  return useQuery({
    queryKey: ["country-currencies"],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      return (unwrap(
        await db.from("country_currency").select("country, name, currency, is_supported").order("name"),
      ) ?? []) as CountryCurrency[];
    },
  });
}

export const findCurrency = (list: Currency[] | undefined, code: string | null | undefined): Currency =>
  list?.find((c) => c.code === code) ?? RWF;

/**
 * The country a seller already told us about, if they are a seller.
 *
 * profiles has no country column; the one place a seller has actually named
 * their country is their seller application, as free text ("Kenya"). That is
 * a stated answer rather than a guess, so it outranks anything the browser
 * can be asked -- but it has to be matched to a code by name, and a name this
 * list does not carry simply yields nothing.
 */
function useStatedCountry(userId: string | undefined) {
  return useQuery({
    queryKey: ["stated-country", userId],
    enabled: Boolean(userId),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("seller_applications")
        .select("country")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.country as string | null) ?? null;
    },
  });
}

export type CurrencySuggestion = {
  /** ISO 3166-1 alpha-2, or null when the seller has to be asked. */
  country: string | null;
  /** ISO 4217, or null when the country is unknown or quotes no currency. */
  currency: string | null;
  /** How we arrived at it, in words the form can show. */
  because: string;
  how: RegionSource;
  ready: boolean;
};

/**
 * Which country and currency to put in the form, and why.
 *
 * Always a suggestion. The form shows the reason beside it and lets the
 * seller change both, because the whole point of saying "from your device's
 * time zone" is that somebody travelling can see it is wrong.
 */
export function useCurrencySuggestion(userId?: string): CurrencySuggestion {
  const { data: countries, isPending: loadingCountries } = useCountryCurrencies();
  const { data: stated, isPending: loadingStated } = useStatedCountry(userId);

  const byName = (name: string | null) => {
    const wanted = String(name ?? "").trim().toLowerCase();
    if (!wanted) return null;
    return countries?.find((c) => c.name.toLowerCase() === wanted)?.country ?? null;
  };

  const guess = guessRegion(byName(stated ?? null));
  const row = guess.country ? countries?.find((c) => c.country === guess.country) : undefined;

  return {
    country: guess.country,
    currency: row?.currency ?? null,
    because: regionExplanation(guess.how),
    how: guess.how,
    ready: !loadingCountries && !(userId && loadingStated),
  };
}

/**
 * An amount in another currency, with the rate that did it.
 *
 * Returns null -- not a number -- when there is no fresh rate, and every
 * caller is written to say "we cannot convert that just now" rather than show
 * a figure. Amounts travel as strings so JSON's doubles never touch them.
 */
export function useConversion(amount: string | null, from: string | null, to: string | null) {
  return useQuery<Conversion>({
    queryKey: ["fx-convert", amount, from, to],
    enabled: Boolean(amount && from && to),
    staleTime: 10 * 60_000,
    queryFn: async () => rpc<Conversion>("fx_convert", { _amount: amount, _from: from, _to: to }),
  });
}

export type PaymentRoutes = {
  currency: string;
  available: { id: string; label: string; method: string; provider: string; instructions: string }[];
  unavailable: { id: string; label: string; reason: string }[];
};

/**
 * What this payer can actually use, and what they cannot with the reason.
 *
 * The second list is the useful one. ItecPay takes francs from Rwandan mobile
 * money and nothing else, so a Kenyan advertiser needs to be told that in
 * words and shown the bank transfer, not left looking at a button that would
 * fail at the last step.
 */
export function usePaymentRoutes(currency: string | null, country: string | null) {
  return useQuery<PaymentRoutes | null>({
    queryKey: ["payment-routes", currency, country],
    enabled: Boolean(currency),
    queryFn: async () =>
      rpc<PaymentRoutes>("payment_methods_for", { _currency: currency, _country: country }),
  });
}

/** When a rate was read, said the way a person would say it. */
export function rateAge(fetchedAt: string | null | undefined): string {
  if (!fetchedAt) return "";
  const read = new Date(fetchedAt);
  if (Number.isNaN(read.getTime())) return "";
  const hours = Math.floor((Date.now() - read.getTime()) / 3_600_000);
  if (hours < 1) return "read in the last hour";
  if (hours < 24) return `read ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `read ${days} day${days === 1 ? "" : "s"} ago`;
}

/** The currency consolidated reports add up in, as the admin set it. */
export function useReportingCurrency() {
  return useQuery({
    queryKey: ["reporting-currency"],
    staleTime: 30 * 60_000,
    queryFn: async () => (await rpc<string | null>("reporting_currency")) ?? "RWF",
  });
}
