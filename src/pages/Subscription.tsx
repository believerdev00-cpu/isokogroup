import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ENDED_KEY, accessEndedMessage, formatPrice, formatTrial, planIncludes, planName, type Plan } from "@/lib/subscription";
import { useSubscription } from "@/hooks/use-subscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SubscriptionPayment from "@/components/SubscriptionPayment";
import TrialCountdown from "@/components/TrialCountdown";
import { cn } from "@/lib/utils";
import PayToCompany, { MomoCodeLink } from "@/components/PayToCompany";

const PLANS: Plan[] = ["trial", "week", "monthly", "seller"];

// The plans, where this account stands, and the payment form. Open to visitors
// too: someone signed out because their access ended lands here and sees why.
const Subscription = () => {
  const { user, loading: authLoading } = useAuth();
  const { loading: subLoading, isActive, status, plan, ended, pricing, accessUntil, paymentPending, renewalStatus, periodStartedAt, sellerPath } = useSubscription();
  const [params] = useSearchParams();

  // Signed out just now because access ended: say what ended
  const endedNow = useMemo<Plan | null>(() => {
    const q = params.get("ended");
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(ENDED_KEY);
    } catch {
      // storage blocked: the query string is enough
    }
    const v = q ?? stored;
    return v && (PLANS as string[]).includes(v) ? (v as Plan) : null;
  }, [params]);
  // signed in again: the server says what ended from now on
  useEffect(() => {
    if (!user) return;
    try {
      sessionStorage.removeItem(ENDED_KEY);
    } catch {
      // nothing stored
    }
  }, [user]);

  if (authLoading || (user && subLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const week = formatPrice(pricing.weekPrice, pricing.currency);
  const monthly = formatPrice(pricing.monthlyPrice, pricing.currency);
  // signed out when access ended: a seller renews the seller plan; anyone else chooses (7 days suggested)
  const offer = user ? pricing : endedNow === "seller"
    ? { ...pricing, nextPlan: "seller" as const, nextPrice: pricing.sellerPrice }
    : { ...pricing, nextPlan: "week" as const, nextPrice: pricing.weekPrice };
  const endedMessage = !user && endedNow ? accessEndedMessage(endedNow, offer)
    : user && !isActive && status !== "none" && !paymentPending ? accessEndedMessage(ended, pricing) : null;

  const seller = formatPrice(pricing.sellerPrice, pricing.currency);
  // Normal users choose one of the first two; sellers pay the third, which replaces them
  const plans = [
    { key: "week" as const, name: planName("week"), price: week, duration: `${pricing.weekDays} days`,
      note: "For normal users, after the free trial" },
    { key: "monthly" as const, name: planName("monthly"), price: monthly, duration: "1 month",
      note: "For normal users; does not renew by itself" },
    { key: "seller" as const, name: planName("seller"), price: seller, duration: "1 month",
      note: "For sellers, instead of the 50 or 200 RWF plans" },
  ];
  const available = user ? pricing.plans.map((p) => p.plan) : offer.nextPlan === "seller" ? ["seller"] : ["week", "monthly"];
  const RENEWAL: Record<string, string> = {
    trial: "Free trial", active: "Active", due_soon: "Renew soon: 3 days or less left",
    renewal_pending: "Payment awaiting confirmation", expired: "Expired",
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-12 sm:py-20">
        <div className="container max-w-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-display font-bold">Subscription</h1>
            <p className="text-muted-foreground">
              Free for {formatTrial(pricing.trialMinutes)}, then {week} for 7 days or {monthly} for a month of full access.
              Sellers pay {seller} a month, which includes everything. Pay by Mobile Money to <MomoCodeLink code={pricing.momoCode} />, or by bank transfer.
            </p>
          </div>

          {endedMessage && (
            <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 sm:p-5" role="alert">
              <p className="font-display text-lg font-bold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" /> {endedMessage.title}
              </p>
              <p className="text-muted-foreground mt-1">
                {endedMessage.text}
                {!user && " You have been signed out. Sign in again to send us your payment details."}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((p) => (
              <Card key={p.key} className={cn(available.includes(p.key) ? "border-2 border-primary" : "opacity-60")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{p.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{p.note}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-3xl font-bold text-primary">{p.price}</p>
                  <p className="text-sm">Duration: {p.duration}</p>
                  <p className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary shrink-0" /> {planIncludes(p.key)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {!user && (
            <Card>
              <CardContent className="pt-6 space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Pay {formatPrice(offer.nextPrice, offer.currency)} by Mobile Money or bank transfer, then sign in and send us the transaction ID or a receipt.
                  Your access starts once an Isoko admin confirms the payment.
                </p>
                <PayToCompany code={pricing.momoCode} amount={formatPrice(offer.nextPrice, offer.currency)} className="text-left" />
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/login" state={{ from: "/subscription" }}>Sign in to send your payment details</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {user && (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">
                  {isActive && status === "trial" && "Free trial"}
                  {isActive && status === "active" && `${plan && plan !== "trial" ? planName(plan) : "Subscription"} active`}
                  {isActive && status !== "trial" && status !== "active" && "Full access"}
                  {!isActive && (paymentPending ? "Payment being checked" : "Access ended")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-center gap-4">
                  <div className={`h-16 w-16 shrink-0 rounded-full flex items-center justify-center ${isActive ? "bg-green-100" : "bg-destructive/10"}`}>
                    {isActive ? <CheckCircle className="h-8 w-8 text-green-600" /> : <Clock className="h-8 w-8 text-destructive" />}
                  </div>
                  <div>
                    {isActive && accessUntil && status === "trial" && (
                      <p className="text-sm text-muted-foreground">
                        Time left: <TrialCountdown until={accessUntil} className="font-semibold text-foreground" />
                      </p>
                    )}
                    {isActive && accessUntil && status === "active" && (
                      <p className="text-sm text-muted-foreground">
                        Full access until {accessUntil.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                    {periodStartedAt && status === "active" && (
                      <p className="text-sm text-muted-foreground">
                        Started {periodStartedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                    {renewalStatus && <p className="text-sm text-muted-foreground">Renewal: <span className="font-medium text-foreground">{RENEWAL[renewalStatus]}</span></p>}
                    <p className="text-sm text-muted-foreground">
                      {sellerPath ? "Your plan" : "Next"}: {planName(pricing.nextPlan)}, {formatPrice(pricing.nextPrice, pricing.currency)}
                    </p>
                  </div>
                </div>
                {status !== "none" && <SubscriptionPayment />}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Subscription;
