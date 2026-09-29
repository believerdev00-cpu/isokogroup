import { useAuth } from "@/lib/auth";
import { firstPeriodName, formatPeriod, formatPrice, formatTrial } from "@/lib/subscription";
import { useSubscription } from "@/hooks/use-subscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Clock } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SubscriptionPayment from "@/components/SubscriptionPayment";
import TrialCountdown from "@/components/TrialCountdown";
import { Navigate } from "react-router-dom";

const Subscription = () => {
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, isActive, status, pricing, accessUntil, paymentPending } = useSubscription();

  if (!user && !authLoading) return <Navigate to="/login" replace />;
  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const firstWeek = formatPrice(pricing.firstWeekPrice, pricing.currency);
  const monthly = formatPrice(pricing.monthlyPrice, pricing.currency);
  const next = formatPrice(pricing.nextPrice, pricing.currency);
  const nextPeriod = formatPeriod(pricing.nextDays);

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-12 sm:py-20">
        <div className="container max-w-lg">
          <div className="text-center mb-8 space-y-2">
            <h1 className="text-3xl font-display font-bold">Subscription</h1>
            <p className="text-muted-foreground">
              Free for {formatTrial(pricing.trialMinutes)}, then {firstWeek} for your {firstPeriodName(pricing.firstPeriodDays)} and {monthly} a month after.
            </p>
          </div>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                {isActive && status === "trial" && "Free trial"}
                {isActive && status === "active" && "Subscription active"}
                {isActive && !subscription && "Full access"}
                {!isActive && (paymentPending ? "Payment being checked" : "Access ended")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-center gap-4">
                <div className={`h-16 w-16 shrink-0 rounded-full flex items-center justify-center ${isActive ? "bg-green-100" : "bg-destructive/10"}`}>
                  {isActive ? <CheckCircle className="h-8 w-8 text-green-600" /> : <Clock className="h-8 w-8 text-destructive" />}
                </div>
                <div>
                  {isActive && status === "trial" && accessUntil && (
                    <p className="text-sm text-muted-foreground">
                      Time left: <TrialCountdown until={accessUntil} className="font-semibold text-foreground" />
                    </p>
                  )}
                  {isActive && status === "active" && accessUntil && (
                    <p className="text-sm text-muted-foreground">Paid until {accessUntil.toLocaleDateString()}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {pricing.nextIsFirstWeek ? `${firstPeriodName(pricing.firstPeriodDays).replace(/^f/, "F")}: ${next}` : `Next month: ${next}`}
                  </p>
                </div>
              </div>

              <ul className="space-y-3">
                {[
                  "Access to Logistics & Packaging",
                  "Full Marketplace access",
                  "Unlimited E-Library reading",
                  "Real-time order tracking",
                ].map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>

              {subscription && (
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    {status === "trial"
                      ? `Pay ${next} now to keep going after your trial: ${nextPeriod} of full access.`
                      : isActive
                        ? `Pay ${next} to add ${nextPeriod} more.`
                        : `Pay ${next} to continue for ${nextPeriod}.`}
                  </p>
                  <SubscriptionPayment />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Subscription;
