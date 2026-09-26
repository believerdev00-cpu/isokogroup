import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Clock, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SubscriptionPayment from "@/components/SubscriptionPayment";
import { formatPeriod, formatPrice, useSubscription } from "@/lib/subscription";

type Props = {
  reason: "no_subscription" | "expired";
};

const benefits = [
  "Full Marketplace access",
  "Logistics & Packaging services",
  "Unlimited E-Library reading",
  "Real-time order tracking",
];

// Shown in place of a member page when the free trial, the first week or the
// month has ended.
const SubscriptionRequired = ({ reason }: Props) => {
  const [open, setOpen] = useState(false);
  const { pricing, paymentPending } = useSubscription();
  const firstWeek = pricing.nextIsFirstWeek;
  const price = formatPrice(pricing.nextPrice, pricing.currency);
  const monthly = formatPrice(pricing.monthlyPrice, pricing.currency);
  const period = formatPeriod(pricing.nextDays);

  const title = paymentPending
    ? "We're checking your payment"
    : reason === "expired" && firstWeek
      ? "Your free trial has ended"
      : reason === "expired"
        ? "Your subscription has ended"
        : "Subscription required";
  const text = paymentPending
    ? "Your access opens as soon as we confirm your Mobile Money payment."
    : firstWeek
      ? `Pay ${price} for your first week to keep using ISOKO GROUP. After that it's ${monthly} a month.`
      : `Renew for ${price} to keep using ISOKO GROUP for ${period}.`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-10 sm:py-16 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl border-2 border-primary/20 bg-card p-6 sm:p-8 text-center space-y-6 shadow-xl">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            {reason === "expired" ? <Clock className="h-8 w-8 text-primary" /> : <Lock className="h-8 w-8 text-primary" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold">{title}</h1>
            <p className="text-muted-foreground">{text}</p>
          </div>

          <ul className="space-y-2 text-left bg-muted/30 rounded-lg p-4">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          {!paymentPending && (
            <Button size="lg" className="w-full gap-2 text-base font-semibold" onClick={() => setOpen(true)}>
              <Sparkles className="h-5 w-5" />
              {firstWeek ? `Pay ${price} for your first week` : `Renew for ${price} a month`}
            </Button>
          )}

          <Link to="/subscription" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
            View subscription details →
          </Link>
        </div>
      </main>
      <Footer />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">{firstWeek ? "Your first week" : "Monthly subscription"}</DialogTitle>
            <DialogDescription>
              {firstWeek
                ? `${price} for ${pricing.firstPeriodDays} days of full access, then ${monthly} a month.`
                : `${price} for ${pricing.periodDays} days of full access.`}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{firstWeek ? "First week" : "Monthly plan"}</span>
              <span className="text-lg text-primary font-bold">{price}</span>
            </div>
            <p className="text-xs text-muted-foreground">Access opens once we confirm your payment.</p>
            <SubscriptionPayment onSubmitted={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionRequired;
