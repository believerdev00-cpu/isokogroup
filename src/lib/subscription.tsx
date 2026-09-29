import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Billing: a new account gets a free trial on its first sign-in (10 minutes by
// default), then pays 50 RWF for its first month, then 200 RWF for every month
// after. The server decides who has access, until when and at what price
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
  /** The first paid period: a month (50 RWF); its length is firstPeriodDays */
  firstWeekPrice: number;
  firstPeriodDays: number;
  /** Every period after: a month (200 RWF) */
  monthlyPrice: number;
  periodDays: number;
  /** This account's next period: the first one until it is paid, then monthly */
  nextIsFirstWeek: boolean;
  nextPrice: number;
  nextDays: number;
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
  next_days?: number;
  next_is_first_week?: boolean;
  trial_minutes: number;
  first_week_price: number;
  first_period_days: number;
  monthly_price: number;
  period_days: number;
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

const DEFAULT_PRICING: SubscriptionPricing = {
  trialMinutes: 10, firstWeekPrice: 50, firstPeriodDays: 30, monthlyPrice: 200, periodDays: 30,
  nextIsFirstWeek: true, nextPrice: 50, nextDays: 30, currency: "RWF",
};

const SubscriptionContext = createContext<SubscriptionContextType>({} as SubscriptionContextType);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [accessUntil, setAccessUntil] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const trialAsked = useRef<string | null>(null);
  // Whose state we hold. Right after signing in or out the state still belongs to
  // the previous visitor, so it counts as loading until the new one's arrives.
  const userId = user?.id ?? null;
  const [stateFor, setStateFor] = useState<string | null | undefined>(undefined);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  const fetchSub = useCallback(async () => {
    const forUser = user?.id ?? null;
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
      if (currentUser.current !== forUser) return; // signed in or out meanwhile: a newer check is coming
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
      if (currentUser.current === forUser) {
        setStateFor(forUser);
        setLoading(false);
      }
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
        firstWeekPrice: state.first_week_price,
        firstPeriodDays: state.first_period_days,
        monthlyPrice: state.monthly_price,
        periodDays: state.period_days,
        nextIsFirstWeek: state.next_is_first_week ?? true,
        nextPrice: state.next_price ?? state.first_week_price,
        nextDays: state.next_days ?? state.first_period_days,
        currency: state.currency ?? "RWF",
      }
    : DEFAULT_PRICING;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        loading: loading || authLoading || stateFor !== userId,
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

/** "1 hour", "90 minutes", "2 hours" */
export const formatTrial = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minute${minutes === 1 ? "" : "s"}`;

/** The first paid period by its length: "first month", "first week" or "first 14 days" */
export const firstPeriodName = (days: number) => (days === 30 ? "first month" : days === 7 ? "first week" : `first ${days} days`);

/** "7 days" / "30 days" as "a week" / "a month" where they are */
export const formatPeriod = (days: number) => (days === 7 ? "a week" : days === 30 ? "a month" : `${days} days`);
