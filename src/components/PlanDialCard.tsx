import { CheckCircle, Phone } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ussdHref } from "@/lib/siteSettings";
import { cn } from "@/lib/utils";

// A subscription plan as one tappable card. On a phone, tapping it opens the
// dialer with the company Mobile Money code filled in (a tel: link, like the
// phone numbers in the footer): the customer confirms the payment on the phone
// and then reports the transaction ID in the form that follows. Nothing here
// treats the dialer opening as a payment: access still waits for an admin's
// confirmation. On a computer, which cannot dial, the card explains what to
// dial instead of failing silently.

/** Can this device open a USSD code from a link? (phones and tablets) */
export const canDial = () =>
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent) ||
    (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches));

export type PlanDialCardProps = {
  name: string;
  price: string;
  duration: string;
  includes: string;
  /** the Mobile Money code to dial */
  code: string;
  selected?: boolean;
  /** greyed out: not for this account (still readable, not tappable) */
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
};

export default function PlanDialCard({ name, price, duration, includes, code, selected, disabled, onSelect, className }: PlanDialCardProps) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    onSelect?.();
    if (!canDial()) {
      // a computer: no dialer, so say what to dial (only here, only now)
      e.preventDefault();
      toast({
        title: `Dial ${code} on your MTN phone`,
        description: `Pay ${price} for ${name}, then enter the transaction ID below. The card dials for you on a phone.`,
      });
      return;
    }
    toast({ title: "Opening your phone's dialer", description: `Confirm the ${price} payment on your phone, then enter the transaction ID below.` });
  };
  return (
    <a
      href={ussdHref(code)}
      onClick={onClick}
      aria-disabled={disabled || undefined}
      aria-label={`${name}, ${price}: pay by MTN Mobile Money`}
      data-plan-card
      className={cn(
        "block rounded-xl border-2 p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        disabled ? "cursor-not-allowed border-border opacity-60" : selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/60 active:bg-primary/5",
        className,
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-display text-lg font-bold leading-tight">{name}</span>
        {!disabled && <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />}
      </span>
      <span className="mt-1 block text-3xl font-bold text-primary">{price}</span>
      <span className="mt-2 block text-sm">Duration: {duration}</span>
      <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {includes}
      </span>
    </a>
  );
}
