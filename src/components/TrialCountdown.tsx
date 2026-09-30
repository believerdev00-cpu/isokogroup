import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { formatPrice, planName, useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/** "4:32" until the given time, updated every second. */
const TrialCountdown = ({ until, className }: { until: Date; className?: string }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((until.getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return <span className={cn("tabular-nums", className)}>{text}</span>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A bar on member pages: the free trial's countdown, or, in the last 24 hours
 * of a paid period, when it ends (it doesn't renew by itself).
 */
export const TrialBanner = () => {
  const { status, isActive, accessUntil, pricing, paymentPending } = useSubscription();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  if (!isActive || !accessUntil) return null;
  const endingPaid = status === "active" && accessUntil.getTime() - now < DAY_MS;
  if (status !== "trial" && !endingPaid) return null;
  const price = formatPrice(pricing.nextPrice, pricing.currency);
  return (
    <div className="border-b border-primary/30 bg-primary/10 text-sm" role="status">
      <div className="container flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>
            {status === "trial" ? "Free trial: " : "Your subscription expires in "}
            <TrialCountdown until={accessUntil} className="font-semibold" />
            {status === "trial" ? " left" : ""}
          </span>
        </p>
        {paymentPending ? (
          <span className="text-muted-foreground">Your payment is awaiting confirmation</span>
        ) : (
          <Link to="/subscription" className="font-semibold text-primary hover:underline">
            {planName(pricing.nextPlan)}: pay {price} →
          </Link>
        )}
      </div>
    </div>
  );
};

export default TrialCountdown;
