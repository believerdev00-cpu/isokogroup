import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

// Billing: a new account gets a 10-minute free trial on its first sign-in, then
// chooses 50 RWF for 7 days or 200 RWF for a calendar month. Sellers (and
// anyone whose seller application is waiting) pay 1,500 RWF a month instead,
// which covers normal access and the seller dashboard.
// Payment is made directly to the company Mobile Money code; the customer
// reports it here and an Isoko admin confirms it by hand before any access
// starts. The server decides who has access, until when and at what price
// (subscription_state) and the database enforces it on every member API; this
// only shows it, starts the trial, warns before the end, and signs the person
// out the moment access runs out.

export type SubscriptionStatus = "trial" | "active" | "expired" | "none";
export type Plan = "trial" | "week" | "monthly" | "seller";
export type PaidPlan = "week" | "monthly" | "seller";
export type PlanOption = { plan: PaidPlan; price: number; days: number | null; months: number | null };
export type RenewalStatus = "trial" | "active" | "due_soon" | "renewal_pending" | "expired";

export type Subscription = {
  id: string;
  status: string;
  plan: Plan;
  starts_at: string;
  expires_at: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  amount: number;
};

export type PendingPayment = {
  id: string;
  plan: PaidPlan;
  amount: number;
  /** the transaction ID, or null when only a screenshot was sent */
  reference: string | null;
  payer_phone: string | null;
  paid_at: string | null;
  submitted_at: string;
};

export type Rejection = { amount: number; reference: string | null; reason: string; rejected_at: string };

export type SubscriptionPricing = {
  trialMinutes: number;
  /** 7 days of full access, the first paid period */
  weekPrice: number;
  weekDays: number;
  /** a calendar month of full access, every period after */
  monthlyPrice: number;
  /** the seller subscription, per month */
  sellerPrice: number;
  /** the plans this account may choose now (the seller plan only, on the seller path) */
  plans: PlanOption[];
  /** This account's suggested next period and what it costs */
  nextPlan: PaidPlan;
  nextPrice: number;
  currency: string;
  /** the company Mobile Money code customers pay to */
  momoCode: string;
};

type ServerState = {
  signed_in: boolean;
  exempt?: boolean;
  staff?: boolean;
  has_access?: boolean;
  status?: SubscriptionStatus;
  plan?: Plan | null;
  access_until?: string | null;
  seconds_left?: number | null;
  ended?: Plan | null;
  payment_pending?: boolean;
  pending_payment?: PendingPayment | null;
  last_rejection?: Rejection | null;
  next_plan?: PaidPlan;
  plans?: PlanOption[];
  seller_path?: boolean;
  is_seller?: boolean;
  renewal_status?: RenewalStatus;
  payment_status?: "pending" | "confirmed" | "rejected" | null;
  period_started_at?: string | null;
  seller_price?: number;
  next_price?: number;
  trial_minutes: number;
  week_price: number;
  week_days: number;
  monthly_price: number;
  momo_code: string;
  currency?: string;
};

/** the payer's name, and the transaction ID or a screenshot of the payment (one of them at least) */
type PaymentReport = { plan: PaidPlan; payerName: string; reference?: string; screenshot?: File | null };

type SubscriptionContextType = {
  subscription: Subscription | null;
  loading: boolean;
  isActive: boolean;
  status: SubscriptionStatus;
  /** the current (or last) period: trial, 7 days or monthly */
  plan: Plan | null;
  /** what just ended, when access has ended */
  ended: Plan | null;
  reason: "no_subscription" | "expired" | null;
  pricing: SubscriptionPricing;
  /** When the current trial or period ends (null when there is none, or for admins) */
  accessUntil: Date | null;
  paymentPending: boolean;
  pendingPayment: PendingPayment | null;
  lastRejection: Rejection | null;
  /** trial, active, due_soon (3 days or less left), renewal_pending, expired */
  renewalStatus: RenewalStatus | null;
  /** when the current paid period started */
  periodStartedAt: Date | null;
  /** holds the seller role */
  isSeller: boolean;
  /** a seller, or their seller application is waiting: the seller plan applies */
  sellerPath: boolean;
  refresh: () => Promise<void>;
  startTrial: () => Promise<{ data: any; error: any } | undefined>;
  submitPayment: (report: PaymentReport) => Promise<{ data: any; error: any } | undefined>;
};

const DEFAULT_PRICING: SubscriptionPricing = {
  trialMinutes: 10, weekPrice: 50, weekDays: 7, monthlyPrice: 200, sellerPrice: 1500,
  plans: [{ plan: "week", price: 50, days: 7, months: null }, { plan: "monthly", price: 200, days: null, months: 1 }],
  nextPlan: "week", nextPrice: 50, currency: "RWF", momoCode: "*182*8*1*871951#",
};

/** Set just before signing someone out because their access ended; read by the Subscription page */
export const ENDED_KEY = "isoko.access_ended";

// In-app warnings before the free trial ends (seconds left -> message)
const TRIAL_WARNINGS: [number, string][] = [
  [300, "Your free trial ends in 5 minutes."],
  [120, "Your free trial ends in 2 minutes."],
  [30, "Your free trial ends in 30 seconds. You will be signed out."],
];

const SubscriptionContext = createContext<SubscriptionContextType>({} as SubscriptionContextType);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading, signOut } = useAuth();
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
  // Did this person have access earlier in this visit? (then losing it signs them out)
  const hadAccess = useRef<string | null>(null);

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
        const { data } = await (supabase as any)
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

  // Re-check with the server the moment the trial or period runs out, without a
  // reload. Timers can't wait longer than ~24.8 days (a month would fire at
  // once), so a long wait is checked again after a day.
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

  // Warnings 5 minutes, 2 minutes and 30 seconds before the trial ends
  useEffect(() => {
    if (!accessUntil || state?.status !== "trial" || state?.exempt) return;
    const timers = TRIAL_WARNINGS.map(([seconds, message]) => {
      const wait = accessUntil.getTime() - seconds * 1000 - Date.now();
      // already past this point (more than 5 s ago): skip it
      if (wait < -5000) return 0;
      return window.setTimeout(
        () => toast({ title: message, description: `Pay ${formatPrice(state?.week_price ?? 50)} for 7 days of full access to continue.`, variant: seconds <= 30 ? "destructive" : undefined }),
        Math.max(wait, 0),
      );
    });
    return () => timers.forEach((t) => t && window.clearTimeout(t));
  }, [accessUntil, state?.status, state?.exempt, state?.week_price]);

  // Access ran out while they were here: sign out and show why, on the
  // Subscription page. (Staff keep their session for their desks; the database
  // refuses the member services all the same.)
  useEffect(() => {
    if (!user || !state?.signed_in || stateFor !== user.id) return;
    if (state.has_access) {
      hadAccess.current = user.id;
      return;
    }
    if (hadAccess.current !== user.id || state.exempt || state.staff) return;
    // someone paying the seller registration fee isn't interrupted (that page needs no subscription)
    if (window.location.pathname === "/become-seller") return;
    hadAccess.current = null;
    try {
      sessionStorage.setItem(ENDED_KEY, state.ended ?? "trial");
    } catch {
      // private mode: the page still explains it from the plan
    }
    signOut().finally(() => window.location.assign(`/subscription?ended=${state.ended ?? "trial"}`));
  }, [user, state, stateFor, signOut]);

  const startTrial = async () => {
    if (!user) return;
    // The server gives one trial per account; asking again returns the same one
    const result = await (supabase as any).rpc("start_trial");
    await fetchSub();
    return result;
  };

  // Records what the customer says they paid: the payer's name, and the
  // transaction ID or a screenshot of the payment. It stays pending, with no
  // access, until an admin confirms it against the company MoMo account. The
  // price is the chosen plan's, decided by the server.
  const submitPayment = async ({ plan, payerName, reference, screenshot }: PaymentReport) => {
    if (!user) return;
    let proofPath: string | null = null;
    if (screenshot) {
      // into the customer's own folder of the private payment-proofs bucket
      const ext = (screenshot.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      proofPath = `${user.id}/${Date.now()}.${ext}`;
      const upload = await supabase.storage.from("payment-proofs").upload(proofPath, screenshot, { contentType: screenshot.type, upsert: false });
      if (upload.error) return { data: null, error: upload.error };
    }
    const result = await (supabase as any).rpc("submit_subscription_payment", {
      p_plan: plan,
      p_payer_name: payerName,
      p_reference: reference || null,
      p_proof_path: proofPath,
    });
    await fetchSub();
    return result;
  };

  const isActive = state?.has_access === true;
  const status: SubscriptionStatus = state?.status ?? "none";
  const reason: "no_subscription" | "expired" | null = isActive ? null : status === "none" ? "no_subscription" : "expired";
  const pricing: SubscriptionPricing = state
    ? {
        trialMinutes: state.trial_minutes,
        weekPrice: state.week_price,
        weekDays: state.week_days,
        monthlyPrice: state.monthly_price,
        sellerPrice: state.seller_price ?? DEFAULT_PRICING.sellerPrice,
        plans: state.plans?.length ? state.plans : DEFAULT_PRICING.plans,
        nextPlan: state.next_plan ?? "week",
        nextPrice: state.next_price ?? state.week_price,
        currency: state.currency ?? "RWF",
        momoCode: state.momo_code ?? DEFAULT_PRICING.momoCode,
      }
    : DEFAULT_PRICING;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        loading: loading || authLoading || stateFor !== userId,
        isActive,
        status,
        plan: state?.plan ?? null,
        ended: state?.ended ?? null,
        reason,
        pricing,
        accessUntil: state?.exempt ? null : accessUntil,
        paymentPending: state?.payment_pending === true,
        pendingPayment: state?.pending_payment ?? null,
        lastRejection: state?.last_rejection ?? null,
        renewalStatus: state?.renewal_status ?? null,
        periodStartedAt: state?.period_started_at ? new Date(state.period_started_at) : null,
        isSeller: state?.is_seller === true,
        sellerPath: state?.seller_path === true,
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

/** "1 hour", "10 minutes", "2 hours" */
export const formatTrial = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minute${minutes === 1 ? "" : "s"}`;

/** "7-Day Full Access" / "Monthly Full Access" / "Seller Monthly" */
export const planName = (plan: PaidPlan) =>
  plan === "week" ? "7-Day Full Access" : plan === "seller" ? "Seller Monthly" : "Monthly Full Access";

/** "7 days" / "1 month" */
export const planDuration = (plan: PaidPlan, weekDays = 7) => (plan === "week" ? `${weekDays} days` : "1 month");

/** What a plan gives, in a line */
export const planIncludes = (plan: PaidPlan) =>
  plan === "seller" ? "Everything a normal user gets, plus your seller dashboard" : "Full access, no feature limitations";

/** Why access ended and what to pay now, in the customer's words */
export const accessEndedMessage = (ended: Plan | null, pricing: SubscriptionPricing) => {
  const price = formatPrice(pricing.nextPrice, pricing.currency);
  if (ended === "week") {
    return { title: "Your 7-day access has expired", text: `Pay ${price} for your first monthly subscription.` };
  }
  if (ended === "monthly") {
    return { title: "Your subscription has expired", text: `Pay ${price} to continue for another month.` };
  }
  if (ended === "seller") {
    return { title: "Your seller subscription has expired", text: `Pay ${price} to keep selling and using Isoko for another month.` };
  }
  if (ended === "trial") {
    return {
      title: "Your free trial has ended",
      text: pricing.nextPlan === "week"
        ? `Pay ${price} for 7 days of full access.`
        : `Pay ${price} for a month of full access.`,
    };
  }
  return {
    title: "Subscription required",
    text: pricing.nextPlan === "week" ? `Pay ${price} for 7 days of full access.` : `Pay ${price} for a month of full access.`,
  };
};
