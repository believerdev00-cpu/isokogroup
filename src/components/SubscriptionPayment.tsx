import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Clock, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, planDuration, planIncludes, planName, useSubscription, type PaidPlan } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSiteSettings } from "@/lib/siteSettings";
import PayToCompany from "@/components/PayToCompany";
import PlanDialCard from "@/components/PlanDialCard";
import { trackEvent } from "@/lib/analytics";

type Props = {
  onSubmitted?: () => void;
  /** the plan chosen outside this form (the Subscription page's cards); the form then shows no cards of its own */
  plan?: PaidPlan;
  hidePlans?: boolean;
};

const MAX_SCREENSHOT = 5 * 1024 * 1024; // the payment-proofs bucket's limit
const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// The customer taps a plan card, which dials the company Mobile Money code on
// their phone, then tells us who paid and gives the transaction ID or a
// screenshot of the payment message.
// Nothing is verified automatically: the report stays pending, with no access,
// until an Isoko admin finds the money on the company account and confirms it.
const SubscriptionPayment = ({ onSubmitted, plan: controlledPlan, hidePlans }: Props) => {
  const { submitPayment, pricing, pendingPayment, lastRejection } = useSubscription();
  const { toast } = useToast();
  const company = useSiteSettings();
  const momoCode = pricing.momoCode || company.momo.code;
  // the plans this account may choose: 7 days or a month, or the seller plan on the seller path
  const choices = pricing.plans;
  const [chosen, setChosen] = useState<PaidPlan>(pricing.nextPlan);
  const plan = choices.find((p) => p.plan === (controlledPlan ?? chosen)) ?? choices[0];
  const price = formatPrice(plan?.price ?? pricing.nextPrice, pricing.currency);
  const [payerName, setPayerName] = useState("");
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  // the plans arrive with the server's answer
  useEffect(() => setChosen(pricing.nextPlan), [pricing.nextPlan]);

  if (pendingPayment) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-left space-y-2" role="status">
        <p className="font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Your {formatPrice(pendingPayment.amount, pricing.currency)} payment is awaiting confirmation
        </p>
        <p className="text-muted-foreground">
          {pendingPayment.reference ? <>Transaction ID <span className="font-mono text-foreground">{pendingPayment.reference}</span>. </> : "Screenshot received. "}
          An Isoko admin checks it against our Mobile Money account; your {planName(pendingPayment.plan)} (
          {planDuration(pendingPayment.plan, pricing.weekDays)}) starts once it is confirmed. We'll tell you here and by e-mail.
        </p>
      </div>
    );
  }

  const pickScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !SCREENSHOT_TYPES.includes(f.type)) {
      toast({ title: "Use a photo or screenshot", description: "JPG, PNG, WEBP or HEIC.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (f && f.size > MAX_SCREENSHOT) {
      toast({ title: "The screenshot is too big", description: "Up to 5 MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setScreenshot(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payerName.trim().length < 2) {
      toast({ title: "Enter the name of the person who paid", variant: "destructive" });
      return;
    }
    const hasReference = reference.replace(/[^A-Za-z0-9]/g, "").length >= 4;
    if (!hasReference && !screenshot) {
      toast({ title: "Add the transaction ID or a screenshot", description: "Either one is enough.", variant: "destructive" });
      return;
    }
    setSending(true);
    const result = await submitPayment({
      plan: plan?.plan ?? pricing.nextPlan,
      payerName: payerName.trim(),
      reference: hasReference ? reference.trim() : undefined,
      screenshot,
    });
    setSending(false);
    if (result?.error) {
      toast({ title: "Payment not sent", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment sent", description: "It is awaiting confirmation. Access starts once an admin confirms it." });
    // a conversion for Google Ads (the event name only; nothing about the person)
    trackEvent("subscription_payment_reported");
    onSubmitted?.();
  };

  return (
    <form className="space-y-4 text-left" onSubmit={handleSubmit}>
      {/* Each plan is one tappable card: it dials the Mobile Money code on a phone
          (the Subscription page shows the cards itself and hides these) */}
      {hidePlans ? (
        plan && (
          <p className="text-sm">
            Plan: <span className="font-semibold">{planName(plan.plan)}</span> · <span className="font-semibold text-primary">{price}</span>
          </p>
        )
      ) : (
      <div className={cn("grid gap-3", choices.length > 1 && "sm:grid-cols-2")}>
        {choices.map((p) => (
          <PlanDialCard
            key={p.plan}
            name={planName(p.plan)}
            price={formatPrice(p.price, pricing.currency)}
            duration={planDuration(p.plan, p.days ?? pricing.weekDays)}
            includes={planIncludes(p.plan)}
            code={momoCode}
            selected={p.plan === plan?.plan}
            onSelect={() => setChosen(p.plan)}
          />
        ))}
      </div>
      )}
      <p className="text-xs text-muted-foreground">{hidePlans ? "Tap your plan above to pay by MTN Mobile Money." : "Tap a plan to pay by MTN Mobile Money."} After paying, tell us who paid and the transaction ID.</p>

      {lastRejection && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="font-semibold flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" /> Your last payment was not confirmed
          </p>
          <p className="text-muted-foreground">Reason: {lastRejection.reason}. Send it again below.</p>
        </div>
      )}

      {/* People abroad or without Mobile Money: the bank account, out of the way until needed */}
      <details className="rounded-lg border border-border px-4 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Paying from abroad or without Mobile Money? Bank transfer</summary>
        <PayToCompany momo={false} className="mt-3" />
      </details>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="sub-payer">Name of the person who paid</Label>
          <Input id="sub-payer" autoComplete="name" value={payerName} onChange={(e) => setPayerName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-ref">Transaction ID</Label>
          <Input id="sub-ref" placeholder="From your MoMo message or bank transfer receipt" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-shot">Or a screenshot of the payment</Label>
          <input ref={fileRef} id="sub-shot" type="file" accept="image/*" className="sr-only" onChange={pickScreenshot} />
          {screenshot ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-primary" /> <span className="truncate">{screenshot.name}</span>
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove the screenshot"
                onClick={() => { setScreenshot(null); if (fileRef.current) fileRef.current.value = ""; }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Add a screenshot
            </Button>
          )}
        </div>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={sending}>
        {sending ? "Sending…" : `I have paid ${price}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Access starts once an Isoko admin confirms the payment on our Mobile Money account. We'll tell you here and by e-mail.
      </p>
    </form>
  );
};

export default SubscriptionPayment;
