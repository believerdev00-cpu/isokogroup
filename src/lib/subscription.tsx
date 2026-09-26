import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Billing: a new account gets a short free trial on its first sign-in (5 minutes
// by default), then pays for its first month (50 RWF), then every month after
// (200 RWF). The server decides who has access, until when and at what price
// (subscription_state); this only shows it, starts the trial and locks the
// member pages the moment access runs out.

export type SubscriptionStatus = "trial" | "active" | "expired" | "none";

export type Subscription = {
  id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  trial_ends_at: string | null;
  amount: number;
  payment_reference?: string | null;
  payment_submitted_at?: string | null;
};

export type SubscriptionPricing = {
  trialMinutes: number;
  firstMonthPrice: number;
  monthlyPrice: number;
  /** What this account's next month costs: the first-month price until one is paid */
  nextPrice: number;
  currency: string;
};

type ServerState = {
  signed_in: boolean;
  exempt?: boolean;
  has_access?: boolean;
  status?: SubscriptionStatus;
  access_until?: string | null;
  seconds_left?: number | null;
  payment_pending?: boolean;
  next_price?: number;
  trial_minutes: number;
  first_month_price: number;
  monthly_price: number;
  currency?: string;
};

type SubscriptionContextType = {
  subscription: Subscription | null;
  loading: boolean;
  isActive: boolean;
  status: SubscriptionStatus;
  reason: "no_subscription" | "expired" | null;
  pricing: SubscriptionPricing;
  /** When the current trial or month ends (null when there is none, or for admins) */
  accessUntil: Date | null;
  paymentPending: boolean;
  refresh: () => Promise<void>;
  startTrial: () => Promise<{ data: any; error: any } | undefined>;
  submitPayment: (reference: string) => Promise<{ data: any; error: any } | undefined>;
};

const DEFAULT_PRICING: SubscriptionPricing = { trialMinutes: 5, firstMonthPrice: 50, monthlyPrice: 200, nextPrice: 50, currency: "RWF" };

const SubscriptionContext = createContext<SubscriptionContextType>({} as SubscriptionContextType);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [accessUntil, setAccessUntil] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const trialAsked = useRef<string | null>(null);

  const fetchSub = useCallback(async () => {
    try {
      const { data: s, error } = await (supabase as any).rpc("subscription_state");
      if (error) throw error;
      let next = s as ServerState;
      // First sign-in of a new account: its free trial starts now (once per account)
      if (user && next.signed_in && next.status === "none" && trialAsked.current !== user.id) {
        trialAsked.current = user.id;
        await (supabase as any).rpc("start_trial");
        const again = await (supabase as any).rpc("subscription_state");
        if (!again.error) next = again.data as ServerState;
      }
      setState(next);
      // the end of access on this device's clock, from the server's "seconds left"
      setAccessUntil(next.seconds_left != null ? new Date(Date.now() + next.seconds_left * 1000) : null);
      if (user) {
        const { data } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setSubscription(data ? ({ ...data, status: next.status === "expired" ? "expired" : data.status } as Subscription) : null);
      } else {
        setSubscription(null);
      }
    } catch (e) {
      console.error("subscription check failed", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    fetchSub();
  }, [authLoading, fetchSub]);

  // Lock the member pages the moment the trial or month runs out, without a reload.
  // Timers can't wait longer than ~24.8 days (a month would fire at once), so a
  // long wait is checked again after a day.
  useEffect(() => {
    if (!accessUntil || state?.exempt) return;
    const ms = Math.max(accessUntil.getTime() - Date.now(), 0) + 1000;
    const timer = window.setTimeout(fetchSub, Math.min(ms, 24 * 60 * 60 * 1000));
    return () => window.clearTimeout(timer);
  }, [accessUntil, state?.exempt, fetchSub]);

  // Back to the tab (or the phone woke up): check again
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && user && fetchSub();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, fetchSub]);

  const startTrial = async () => {
    if (!user) return;
    // The server gives one trial per account; asking again returns the same one
    const result = await (supabase as any).rpc("start_trial");
    await fetchSub();
    return result;
  };

  // Records the MoMo reference; finance staff confirm the payment and the month
  // starts. The price is decided by the server.
  const submitPayment = async (reference: string) => {
    if (!user) return;
    const result = await (supabase as any).rpc("submit_subscription_payment", { p_reference: reference });
    await fetchSub();
    return result;
  };

  const isActive = state?.has_access === true;
  const status: SubscriptionStatus = state?.status ?? "none";
  const reason: "no_subscription" | "expired" | null = isActive ? null : status === "none" ? "no_subscription" : "expired";
  const pricing: SubscriptionPricing = state
    ? {
        trialMinutes: state.trial_minutes,
        firstMonthPrice: state.first_month_price,
        monthlyPrice: state.monthly_price,
        nextPrice: state.next_price ?? state.first_month_price,
        currency: state.currency ?? "RWF",
      }
    : DEFAULT_PRICING;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        loading: loading || authLoading,
        isActive,
        status,
        reason,
        pricing,
        accessUntil: state?.exempt ? null : accessUntil,
        paymentPending: state?.payment_pending === true,
        refresh: fetchSub,
        startTrial,
        submitPayment,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);

/** "50 RWF" */
export const formatPrice = (amount: number, currency = "RWF") => `${Math.round(amount).toLocaleString("en-US")} ${currency}`;
