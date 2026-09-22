import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

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

type SubscriptionContextType = {
  subscription: Subscription | null;
  loading: boolean;
  isActive: boolean;
  status: SubscriptionStatus;
  reason: "no_subscription" | "expired" | null;
  refresh: () => Promise<void>;
  startTrial: () => Promise<{ data: any; error: any } | undefined>;
  submitPayment: (reference: string) => Promise<{ data: any; error: any } | undefined>;
};

const SubscriptionContext = createContext<SubscriptionContextType>({} as SubscriptionContextType);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSub = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) console.error("subscription fetch error", error);

      if (data) {
        const now = new Date();
        const expiresAt = new Date(data.expires_at);
        const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;

        if (data.status === "trial" && trialEndsAt && now > trialEndsAt) {
          setSubscription({ ...data, status: "expired" });
        } else if (data.status === "active" && now > expiresAt) {
          setSubscription({ ...data, status: "expired" });
        } else {
          setSubscription(data);
        }
      } else {
        setSubscription(null);
      }
    } catch (e) {
      console.error("subscription fetch threw", e);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    fetchSub();
  }, [authLoading, fetchSub]);

  const startTrial = async () => {
    if (!user) return;
    // The server allows one trial per account
    const { data, error } = await (supabase as any).rpc("start_trial");
    if (!error && data) setSubscription(data as Subscription);
    return { data, error };
  };

  // Records the MoMo/bank reference; an admin activates the plan once the
  // payment is confirmed, so the subscription stays as it is until then.
  const submitPayment = async (reference: string) => {
    if (!user) return;
    const { data, error } = await (supabase as any).rpc("submit_subscription_payment", {
      p_reference: reference,
    });
    if (!error && data) setSubscription((prev) => (prev ? { ...prev, ...data, status: prev.status } : data));
    return { data, error };
  };

  const isActive = subscription?.status === "trial" || subscription?.status === "active";
  const status: SubscriptionStatus = !subscription
    ? "none"
    : (subscription.status as SubscriptionStatus);
  const reason: "no_subscription" | "expired" | null = isActive
    ? null
    : !subscription
    ? "no_subscription"
    : "expired";

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        loading: loading || authLoading,
        isActive,
        status,
        reason,
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
