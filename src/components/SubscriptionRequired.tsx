import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Clock, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SubscriptionPayment from "@/components/SubscriptionPayment";
import { useSubscription } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";

type Props = {
  reason: "no_subscription" | "expired";
};

const benefits = [
  "Full Marketplace access",
  "Logistics & Packaging services",
  "Unlimited E-Library reading",
  "Real-time order tracking",
];

const SubscriptionRequired = ({ reason }: Props) => {
  const expired = reason === "expired";
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const { startTrial, subscription } = useSubscription();
  const { toast } = useToast();

  const handleTrial = async () => {
    setProcessing(true);
    const result = await startTrial();
    setProcessing(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: "Trial started!", description: "Enjoy 1 week of full access." });
      setOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-16 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl border-2 border-primary/20 bg-card p-8 text-center space-y-6 shadow-xl hover-lift">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            {expired ? (
              <Clock className="h-8 w-8 text-primary" />
            ) : (
              <Lock className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold">
              {expired ? "Your subscription has expired" : "Subscription required"}
            </h1>
            <p className="text-muted-foreground">
              {expired
                ? "Renew your plan for 200 RWF to keep accessing all ISOKO services."
                : "Subscribe for just 200 RWF/month to unlock all ISOKO GROUP services."}
            </p>
          </div>

          <ul className="space-y-2 text-left bg-muted/30 rounded-lg p-4">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          <Button
            size="lg"
            className="w-full gap-2 text-base font-semibold hover-glow"
            onClick={() => setOpen(true)}
          >
            <Sparkles className="h-5 w-5" />
            {expired ? "Renew Subscription" : "Subscribe Now"}
          </Button>

          <Link to="/subscription" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
            View full subscription details →
          </Link>
        </div>
      </main>
      <Footer />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {expired ? "Renew your subscription" : "Choose your plan"}
            </DialogTitle>
            <DialogDescription>
              {expired
                ? "Pay 200 RWF to restore access for 30 days."
                : "Start with a free trial or pay now for full access."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!expired && !subscription && (
              <div className="rounded-lg border-2 border-primary p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">1-Week Free Trial</span>
                  <span className="text-sm text-primary font-bold">FREE</span>
                </div>
                <p className="text-xs text-muted-foreground">No payment required. Full access for 7 days.</p>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleTrial}
                  disabled={processing}
                >
                  Start Free Trial
                </Button>
              </div>
            )}

            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Monthly Plan</span>
                <span className="text-lg text-primary font-bold">200 RWF</span>
              </div>
              <p className="text-xs text-muted-foreground">30 days of unlimited access, activated once we confirm your payment.</p>
              {subscription ? (
                <SubscriptionPayment onSubmitted={() => setOpen(false)} />
              ) : (
                <p className="text-xs text-center text-muted-foreground">Start a trial first to unlock paid upgrade.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionRequired;
