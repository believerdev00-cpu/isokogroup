import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Clock } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SubscriptionPayment from "@/components/SubscriptionPayment";
import { Navigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const Subscription = () => {
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, isActive, startTrial } = useSubscription();
  const { t } = useI18n();
  const { toast } = useToast();

  if (!user && !authLoading) return <Navigate to="/login" replace />;
  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const handleStartTrial = async () => {
    const result = await startTrial();
    if (result?.error) {
      toast({ title: "Error", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: "Success!", description: "Your 1-week free trial has started. Enjoy all services!" });
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container max-w-lg">
          <div className="text-center mb-8 space-y-2">
            <h1 className="text-3xl font-display font-bold">Subscription</h1>
            <p className="text-muted-foreground">Unlock all ISOKO GROUP services</p>
          </div>

          {!subscription ? (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Start Your Free Trial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-primary">200 RWF</p>
                  <p className="text-muted-foreground">per month after trial</p>
                </div>
                <ul className="space-y-3">
                  {[
                    "1-week free trial — no payment required",
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
                <Button className="w-full" size="lg" onClick={handleStartTrial}>
                  Start 1-Week Free Trial
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">
                  {subscription.status === "trial" && "Free Trial Active"}
                  {subscription.status === "active" && "Subscription Active"}
                  {subscription.status === "expired" && "Subscription Expired"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-center gap-4">
                  <div className={`h-16 w-16 rounded-full flex items-center justify-center ${
                    isActive ? "bg-green-100" : "bg-destructive/10"
                  }`}>
                    {isActive ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : (
                      <Clock className="h-8 w-8 text-destructive" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold capitalize">{subscription.status}</p>
                    {subscription.status === "trial" && subscription.trial_ends_at && (
                      <p className="text-sm text-muted-foreground">
                        Trial ends: {new Date(subscription.trial_ends_at).toLocaleDateString()}
                      </p>
                    )}
                    {subscription.status === "active" && (
                      <p className="text-sm text-muted-foreground">
                        Expires: {new Date(subscription.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                {subscription.status === "expired" && (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">Your access has expired. Pay 200 RWF to continue for 30 days.</p>
                    <SubscriptionPayment label="I have paid — Renew" />
                  </div>
                )}

                {subscription.status === "trial" && (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">Enjoying the trial? Upgrade now to extend for 30 days.</p>
                    <SubscriptionPayment label="I have paid — Upgrade" />
                  </div>
                )}
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
