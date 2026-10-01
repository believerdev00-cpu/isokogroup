import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Circle, Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileMoneyPay, useMobileMoneyAvailable, type MobileMoneyTarget } from "@/features/finance/MobileMoneyPay";
import { useSiteSettings } from "@/lib/siteSettings";
import { MomoCodeLink } from "@/components/PayToCompany";
import { cn } from "@/lib/utils";
import { errorText, formatMoney, whatsappLink, type ServiceKey } from "./api";

// ============== IDENTITY ==============
// One Isoko site, but each service is recognisable at a glance.
export const THEME: Record<ServiceKey, {
  name: string;
  button: string;
  soft: string;
  text: string;
  ring: string;
  hero: string;
  dot: string;
}> = {
  travel: {
    name: "Isoko Travel Agency",
    button: "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500",
    soft: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "border-emerald-600 ring-2 ring-emerald-600/20 dark:border-emerald-500",
    hero: "bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900",
    dot: "bg-emerald-600",
  },
  consultancy: {
    name: "Isoko Consultancy",
    button: "bg-blue-800 text-white hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500",
    soft: "bg-blue-50 text-blue-950 dark:bg-blue-950/50 dark:text-blue-200",
    text: "text-blue-800 dark:text-blue-400",
    ring: "border-blue-700 ring-2 ring-blue-700/20 dark:border-blue-500",
    hero: "bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950",
    dot: "bg-blue-700",
  },
  data: {
    name: "Isoko Data Analysis",
    button: "bg-indigo-700 text-white hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500",
    soft: "bg-indigo-50 text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-200",
    text: "text-indigo-700 dark:text-indigo-400",
    ring: "border-indigo-600 ring-2 ring-indigo-600/20 dark:border-indigo-500",
    hero: "bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950",
    dot: "bg-indigo-600",
  },
};

// ============== LAYOUT ==============
export function ServiceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

/** The narrow, focused column used by request forms and customer pages. */
export function FlowColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-xl px-4 py-8 sm:py-12", className)}>{children}</div>;
}

export function PrimaryButton({ service, className, children, busy, ...props }: React.ComponentProps<typeof Button> & { service: ServiceKey; busy?: boolean }) {
  return (
    <Button size="lg" className={cn("h-12 w-full text-base font-semibold", THEME[service].button, className)} disabled={busy || props.disabled} {...props}>
      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function Field({ label, htmlFor, hint, children, optional }: { label: string; htmlFor?: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** "Step 2 of 4" with a thin progress bar and a back link. */
export function StepHeader({ service, step, total, title, onBack }: { service: ServiceKey; step: number; total: number; title: string; onBack?: () => void }) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between text-sm">
        {onBack ? (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground">
          Step {step} of {total}
        </span>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? THEME[service].dot : "bg-muted")} />
        ))}
      </div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
    </div>
  );
}

/** A large tappable option, used for choices in request forms. */
export function ChoiceCard({
  service, selected, onClick, icon: Icon, title, description, badge, multi = true,
}: {
  service: ServiceKey; selected: boolean; onClick: () => void; icon?: React.ComponentType<{ className?: string }>;
  title: string; description?: string; badge?: string; multi?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/30",
        selected && THEME[service].ring,
      )}
    >
      {Icon && (
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", selected ? THEME[service].soft : "bg-muted text-muted-foreground")}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {title}
          {badge && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", THEME[service].soft)}>{badge}</span>}
        </span>
        {description && <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>}
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border",
          multi ? "rounded-md" : "rounded-full",
          selected ? cn(THEME[service].dot, "border-transparent text-white") : "border-muted-foreground/40",
        )}
        aria-hidden
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

// ============== STATUS ==============
export type Stage = { label: string; state: "done" | "current" | "todo" };

/** A vertical checklist of stages: done ✓, current, still to come. */
export function StageList({ service, stages }: { service: ServiceKey; stages: Stage[] }) {
  return (
    <ol className="space-y-3">
      {stages.map((s) => (
        <li key={s.label} className="flex items-center gap-3">
          {s.state === "done" ? (
            <CheckCircle2 className={cn("h-5 w-5 shrink-0", THEME[service].text)} aria-hidden />
          ) : s.state === "current" ? (
            <span className={cn("relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full", THEME[service].soft)} aria-hidden>
              <span className={cn("h-2 w-2 animate-pulse rounded-full", THEME[service].dot)} />
            </span>
          ) : (
            <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" aria-hidden />
          )}
          <span className={cn("text-sm", s.state === "todo" ? "text-muted-foreground" : "font-medium", s.state === "current" && THEME[service].text)}>
            {s.label}
            <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (in progress)" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Builds stages from an ordered list and the index of the current stage. */
export function stagesFrom(labels: string[], currentIndex: number, allDone = false): Stage[] {
  return labels.map((label, i) => ({ label, state: allDone || i < currentIndex ? "done" : i === currentIndex ? "current" : "todo" }));
}

/** What has been done, what is next, and the one thing the customer should do. */
export function NextStep({ service, done, next, action }: { service: ServiceKey; done?: string | null; next?: string | null; action?: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5">
      {done && (
        <p className="flex items-start gap-2 text-sm">
          <Check className={cn("mt-0.5 h-4 w-4 shrink-0", THEME[service].text)} aria-hidden />
          <span>
            <span className="text-muted-foreground">Done: </span>
            <span className="font-medium">{done}</span>
          </span>
        </p>
      )}
      {next && (
        <p className="flex items-start gap-2 text-sm">
          <span className={cn("mt-0.5 w-4 shrink-0 text-center font-bold", THEME[service].text)} aria-hidden>→</span>
          <span>
            <span className="text-muted-foreground">Next: </span>
            <span className="font-medium">{next}</span>
          </span>
        </p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function SectionCard({ title, children, className, right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function WhatsAppButton({ text, label = "WhatsApp Isoko", variant = "outline", className, href }: { text: string; label?: string; variant?: "outline" | "solid"; className?: string; href?: string }) {
  return (
    <Button
      asChild
      size="lg"
      variant={variant === "outline" ? "outline" : "default"}
      className={cn("h-12 w-full text-base", variant === "solid" && "bg-[#1f9d55] text-white hover:bg-[#188047]", className)}
    >
      <a href={href ?? whatsappLink(text)} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="mr-2 h-5 w-5" /> {label}
      </a>
    </Button>
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground" role="status">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
    </div>
  );
}

export function NotFoundCard({ what, backTo, backLabel }: { what: string; backTo: string; backLabel: string }) {
  return (
    <FlowColumn className="text-center">
      <h1 className="font-display text-2xl font-bold">{what} not found</h1>
      <p className="mt-2 text-muted-foreground">
        Check that you opened the full link we sent you. Links stop working some months after a request is closed, or when
        Isoko sends you a new one. Contact Isoko and we'll send you a working link.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </FlowColumn>
  );
}

// ============== AFTER SUBMITTING ==============
/** "Request received" with the reference, and where to follow the request. */
export function RequestReceived({
  service, title, message, reference, viewTo, whatsappHref, notice,
}: { service: ServiceKey; title: string; message: string; reference: string; viewTo: string; whatsappHref?: string; notice?: React.ReactNode }) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${viewTo}`);
      toast.success("Link copied. Keep it to follow your request.");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  return (
    <FlowColumn className="text-center">
      <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full", THEME[service].soft)}>
        <Check className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-5 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-lg">{message}</p>
      <div className="mx-auto mt-6 max-w-xs rounded-xl border bg-card p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Request number</p>
        <p className="mt-1 font-mono text-2xl font-bold">{reference}</p>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Our specialist will contact you shortly.</p>
      <div className="mx-auto mt-8 max-w-sm space-y-3">
        {notice}
        <WhatsAppButton variant="solid" href={whatsappHref} text={`Hello Isoko, my request number is ${reference}.`} />
        <Button asChild variant="outline" size="lg" className="h-12 w-full text-base">
          <Link to={viewTo}>View Request</Link>
        </Button>
        <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" /> Copy the link to this request
        </button>
      </div>
    </FlowColumn>
  );
}

// ============== PAYMENT ==============
/**
 * Total / paid / remaining, and one "Make Payment" action: pay now from the
 * phone (when Isoko has switched it on, RWF only), or record a transfer already
 * made for Isoko to confirm.
 */
export function PaymentBox({
  service, total, paid, pending, currency, reference, onSubmit, mobileMoney, onPaid,
}: {
  service: ServiceKey; total: number; paid: number; pending: number; currency: string; reference: string;
  onSubmit: (v: { amount: number; method: "momo" | "bank"; reference: string }) => Promise<void>;
  /** Where "pay from my phone" pays (this page's record) */
  mobileMoney?: MobileMoneyTarget;
  onPaid?: () => void;
}) {
  const remaining = Math.max(total - paid, 0);
  const company = useSiteSettings();
  const phoneAvailable = useMobileMoneyAvailable(currency) && Boolean(mobileMoney);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"phone" | "momo" | "bank">("momo");
  const choices = phoneAvailable ? (["phone", "momo", "bank"] as const) : (["momo", "bank"] as const);
  const label = { phone: "From my phone", momo: "I paid by MoMo", bank: "Bank transfer" };
  const [amount, setAmount] = useState(String(Math.max(remaining - pending, 0) || ""));
  const [txRef, setTxRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ amount: Number(amount), method: method === "bank" ? "bank" : "momo", reference: txRef });
      toast.success("Thank you. Isoko will confirm your payment shortly.");
      setOpen(false);
      setTxRef("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Payment">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="mt-1 font-bold">{formatMoney(total, currency)}</dd>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">Paid</dt>
          <dd className="mt-1 font-bold">{formatMoney(paid, currency)}</dd>
        </div>
        <div className={cn("rounded-xl p-3", remaining > 0 ? THEME[service].soft : "bg-muted/60")}>
          <dt className="text-xs opacity-80">Remaining</dt>
          <dd className="mt-1 font-bold">{formatMoney(remaining, currency)}</dd>
        </div>
      </dl>
      {pending > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{formatMoney(pending, currency)} received from you is being confirmed by Isoko.</p>
      )}
      {remaining > 0 && !open && (
        <PrimaryButton service={service} className="mt-4" onClick={() => { setMethod(phoneAvailable ? "phone" : "momo"); setOpen(true); }}>
          Make Payment
        </PrimaryButton>
      )}
      {remaining === 0 && total > 0 && <p className={cn("mt-3 text-sm font-semibold", THEME[service].text)}>Fully paid. Thank you!</p>}
      {open && (
        <div className="mt-4 space-y-4">
          <div className={cn("grid gap-2", choices.length === 3 ? "grid-cols-3" : "grid-cols-2")} role="radiogroup" aria-label="How are you paying?">
            {choices.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cn("rounded-xl border p-3 text-sm font-semibold", method === m && THEME[service].ring)}
              >
                {phoneAvailable ? label[m] : m === "momo" ? "Mobile Money" : "Bank transfer"}
              </button>
            ))}
          </div>
          {method === "phone" && mobileMoney ? (
            <MobileMoneyPay
              target={mobileMoney}
              amountDue={Math.max(remaining - pending, 0)}
              currency={currency}
              accentClass={THEME[service].ring}
              onPaid={() => onPaid?.()}
              onCancel={() => setOpen(false)}
            />
          ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl bg-muted/60 p-4 text-sm">
            {method === "momo" ? (
              <>
                <p className="font-semibold">{company.momo.label}</p>
                <p>Pay to <span className="font-semibold">{company.momo.name}</span>: <MomoCodeLink code={company.momo.code} /></p>
              </>
            ) : (
              <>
                <p className="font-semibold">{company.bank.name}</p>
                <p>{company.bank.accountName} · <span className="font-mono">{company.bank.accountNumber}</span></p>
                {company.bank.swift && <p>SWIFT: <span className="font-mono">{company.bank.swift}</span></p>}
              </>
            )}
            <p className="mt-2 text-muted-foreground">Use <span className="font-mono font-semibold text-foreground">{reference}</span> as the payment reference.</p>
          </div>
          <Field label={`Amount paid (${currency})`} htmlFor="pay-amount">
            <Input id="pay-amount" type="number" inputMode="decimal" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Transaction ID / reference" htmlFor="pay-ref" hint="From your Mobile Money message or bank receipt.">
            <Input id="pay-ref" value={txRef} onChange={(e) => setTxRef(e.target.value)} required minLength={3} maxLength={100} />
          </Field>
          <FormError message={error} />
          <PrimaryButton service={service} type="submit" busy={busy} disabled={!amount || txRef.trim().length < 3}>
            I have paid
          </PrimaryButton>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
          )}
        </div>
      )}
    </SectionCard>
  );
}
