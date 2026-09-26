import { useState } from "react";
import { Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, useSubscription } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_PAYMENT } from "@/lib/company";

type Props = {
  label?: string;
  onSubmitted?: () => void;
};

// Pay by MoMo, then send the transaction reference. An admin confirms the
// payment and activates the plan; until then the user sees it as pending.
const SubscriptionPayment = ({ label, onSubmitted }: Props) => {
  const { subscription, submitPayment, pricing } = useSubscription();
  // the server decides the price: the first month, or the monthly price after that
  const price = formatPrice(pricing.nextPrice, pricing.currency);
  const { toast } = useToast();
  const [reference, setReference] = useState("");
  const [sending, setSending] = useState(false);

  if (subscription?.payment_submitted_at) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-left space-y-1">
        <p className="font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Payment submitted — awaiting confirmation
        </p>
        <p className="text-muted-foreground">
          Reference: <span className="font-mono">{subscription.payment_reference}</span>. We'll notify you once
          it's confirmed.
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!reference.trim()) {
      toast({ title: "Payment reference required", description: "Enter the MoMo transaction ID.", variant: "destructive" });
      return;
    }
    setSending(true);
    const result = await submitPayment(reference.trim());
    setSending(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment submitted", description: "We'll activate your subscription once the payment is confirmed." });
    onSubmitted?.();
  };

  return (
    <div className="space-y-3 text-left">
      <div className="rounded-lg bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">Pay {price} via {COMPANY_PAYMENT.momo.label}</p>
        <p className="font-mono font-semibold">{COMPANY_PAYMENT.momo.number}</p>
        <p className="text-xs text-muted-foreground">Account: {COMPANY_PAYMENT.momo.name}</p>
      </div>
      <Input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="MoMo transaction ID"
        aria-label="MoMo transaction ID"
      />
      <Button className="w-full gap-2" size="lg" onClick={handleSubmit} disabled={sending}>
        <CreditCard className="h-4 w-4" />
        {sending ? "Sending…" : label ?? `I have paid ${price}`}
      </Button>
    </div>
  );
};

export default SubscriptionPayment;
