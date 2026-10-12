// What a dollar is worth in francs, as the database last heard it.
//
// The browser never asks the provider. A scheduled job in the database
// fetches the rate and stores one row; this reads that row. So the figure on
// the page, the figure the donation form validates against and the figure
// the database enforces are the same number, and no visitor's page depends
// on a third party being up when they happen to load it.
//
// Everything here mirrors public.usd_minimum_rwf(): a rate older than seven
// days is ignored, and the fallback is the standing floor. Giving money to a
// community fund is not the moment to be told an exchange rate service is
// unavailable, so a missing rate narrows what the page can say, never what
// somebody can do.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MIN_DONATION_RWF } from "@/lib/initiative";

const STALE_AFTER_DAYS = 7;

export type UsdRate = {
  /** Francs per dollar, or null when there is nothing fresh to go on. */
  rate: number | null;
  fetchedAt: Date | null;
  /** The smallest donation in francs: a dollar, rounded up, or the floor. */
  minimumRwf: number;
};

const FALLBACK: UsdRate = { rate: null, fetchedAt: null, minimumRwf: MIN_DONATION_RWF };

export function useUsdRate() {
  return useQuery<UsdRate>({
    queryKey: ["fx", "usd-rwf"],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select("rate, fetched_at")
        .eq("quote", "RWF")
        .maybeSingle();
      if (error || !data) return FALLBACK;

      const fetchedAt = new Date(data.fetched_at as string);
      const age = Date.now() - fetchedAt.getTime();
      const rate = Number(data.rate);
      if (!Number.isFinite(rate) || rate <= 0 || age > STALE_AFTER_DAYS * 86_400_000) return FALLBACK;

      // Rounded up, so the smallest accepted amount is never a hair under a
      // dollar. The database rounds the same way.
      return { rate, fetchedAt, minimumRwf: Math.ceil(rate) };
    },
  });
}

/** "about US$1.07", or null when there is no rate to say it with. */
export const inUsd = (rwf: number, rate: number | null) =>
  rate && rwf > 0 ? `US$${(rwf / rate).toFixed(2)}` : null;
