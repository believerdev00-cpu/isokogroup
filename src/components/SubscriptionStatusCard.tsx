import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle, Clock, Hourglass, Lock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { formatPrice, planName, useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";

type State = "trial" | "active" | "expiring" | "pending" | "expired" | "none";

/**
 * One clear line on where this account stands: free trial (with the countdown),
 * active (until when), expiring soon, payment awaiting confirmation, expired or
 * no subscription. Registration alone is not a subscription, so a new account
 * with no trial and no payment sees "No subscription" and where to subscribe.
 * Someone with access is never nagged to subscribe.
 */
const SubscriptionStatusCard = ({ className }: { className?: string }) => {
  const { t, lang } = useI18n();
  const { loading, status, isActive, renewalStatus, accessUntil, paymentPending, pricing } = useSubscription();
  if (loading) return null;

  const state: State = paymentPending && !isActive ? "pending"
    : isActive && status === "trial" ? "trial"
    : isActive && renewalStatus === "due_soon" ? "expiring"
    : isActive ? "active"
    : status === "expired" ? "expired"
    : "none";

  const until = accessUntil
    ? accessUntil.toLocaleString(lang === "zh" ? "zh-CN" : lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const price = formatPrice(pricing.nextPrice, pricing.currency);

  const look: Record<State, { icon: typeof Clock; tone: string; title: string; text: string | null; action: string | null }> = {
    trial: { icon: Hourglass, tone: "border-primary/40 bg-primary/5", title: t("sub.status.trial"), text: t("sub.trialEndsWarning"), action: t("sub.subscribe") },
    active: { icon: CheckCircle, tone: "border-green-500/40 bg-green-500/5", title: t("sub.status.active"), text: until ? t("sub.until", { date: until }) : null, action: t("sub.manage") },
    expiring: { icon: AlertTriangle, tone: "border-amber-500/40 bg-amber-500/5", title: t("sub.status.expiring"), text: until ? t("sub.until", { date: until }) : null, action: t("sub.renew") },
    pending: { icon: Clock, tone: "border-blue-500/40 bg-blue-500/5", title: t("sub.status.pending"), text: null, action: t("sub.manage") },
    expired: { icon: XCircle, tone: "border-destructive/40 bg-destructive/5", title: t("sub.status.expired"), text: `${planName(pricing.nextPlan)}: ${price}`, action: t("sub.renew") },
    none: { icon: Lock, tone: "border-border bg-muted/30", title: t("sub.status.none"), text: t("sub.noSub"), action: t("sub.subscribe") },
  };
  const l = look[state];

  return (
    <Card className={cn("border-2", l.tone, className)} role="status" data-subscription-state={state}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background">
          <l.icon className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sub.title")}</p>
          <p className="text-lg font-bold">{l.title}</p>
          {state === "trial" && accessUntil ? <TrialLeft until={accessUntil} /> : null}
          {l.text && <p className="text-sm text-muted-foreground">{l.text}</p>}
        </div>
        {l.action && (
          <Button asChild variant={state === "active" || state === "pending" ? "outline" : "default"} className="shrink-0">
            <Link to="/subscription">{l.action}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

/** "4:32 left", ticking every second, in the current language */
function TrialLeft({ until }: { until: Date }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor((until.getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const time = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return <p className="text-sm font-semibold tabular-nums">{t("sub.left", { time })}</p>;
}

export default SubscriptionStatusCard;
