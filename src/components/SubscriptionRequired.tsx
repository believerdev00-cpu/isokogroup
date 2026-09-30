import { Link } from "react-router-dom";
import { Lock, Clock, CheckCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SubscriptionPayment from "@/components/SubscriptionPayment";
import { accessEndedMessage, useSubscription } from "@/lib/subscription";

type Props = {
  reason: "no_subscription" | "expired";
};

const benefits = [
  "Full Marketplace access",
  "Logistics & Packaging services",
  "Unlimited E-Library reading",
  "Real-time order tracking",
];

// Shown in place of a member page when the free trial, the 7 days or the month
// has ended (or while a payment waits for confirmation).
const SubscriptionRequired = ({ reason }: Props) => {
  const { pricing, paymentPending, ended } = useSubscription();
  const message = paymentPending
    ? { title: "We're checking your payment", text: "Your access opens as soon as an Isoko admin confirms your Mobile Money payment." }
    : accessEndedMessage(ended, pricing);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-10 sm:py-16 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl border-2 border-primary/20 bg-card p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="text-center space-y-3">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              {reason === "expired" ? <Clock className="h-8 w-8 text-primary" /> : <Lock className="h-8 w-8 text-primary" />}
            </div>
            <h1 className="text-2xl font-display font-bold">{message.title}</h1>
            <p className="text-muted-foreground">{message.text}</p>
          </div>

          <ul className="space-y-2 text-left bg-muted/30 rounded-lg p-4">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          <SubscriptionPayment />

          <Link to="/subscription" className="block text-center text-sm text-muted-foreground hover:text-primary transition-colors">
            View subscription details →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SubscriptionRequired;
