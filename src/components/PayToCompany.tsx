import { useState } from "react";
import { Check, Copy, Landmark, Phone, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { ussdHref, useSiteSettings } from "@/lib/siteSettings";
import { cn } from "@/lib/utils";

// How to pay the company, on every payment page: the Mobile Money code as a
// link that opens the phone's dialer with the code filled in (like the phone
// numbers in the footer), a Copy button for phones that refuse USSD links, and
// the company bank account for people abroad or without Mobile Money. Every
// value comes from Admin > Settings (site_settings); nothing is typed here.

/** Copies a value and says so for a moment. */
function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard blocked (http, old browser): the value is visible to copy by hand
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`${t("pay.copy")} ${label}`} className={cn("h-8 gap-1.5 px-2.5", className)}>
      {done ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="text-xs">{done ? t("pay.copied") : t("pay.copy")}</span>
    </Button>
  );
}

/** The Mobile Money code as a tap-to-dial link (inline use inside a sentence). */
export function MomoCodeLink({ code, className }: { code?: string; className?: string }) {
  const { t } = useI18n();
  const { momo } = useSiteSettings();
  const value = code || momo.code;
  return (
    <a href={ussdHref(value)} className={cn("inline-flex items-center gap-1 font-mono font-semibold text-primary underline-offset-4 hover:underline", className)} title={t("pay.tapToDial")}>
      <Phone className="h-3.5 w-3.5" aria-hidden /> {value}
    </a>
  );
}

/**
 * The full block: Mobile Money (dial or copy) and the bank account.
 * `code` overrides the Mobile Money code (the subscription server sends it);
 * `amount` is shown in the heading when given; `reference` is what to write
 * on the transfer, when the page has one.
 */
export default function PayToCompany({ code, amount, reference, bank = true, momo = true, className }: { code?: string; amount?: string; reference?: string; bank?: boolean; momo?: boolean; className?: string }) {
  const { t } = useI18n();
  const site = useSiteSettings();
  const momoCode = code || site.momo.code;
  return (
    <div className={cn("space-y-3 text-sm", className)}>
      {momo && (
      <div className="rounded-lg bg-muted/40 p-4 space-y-2">
        <p className="font-semibold flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" /> {amount ? t("pay.momoTitleAmount", { amount }) : t("pay.momoTitle")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={ussdHref(momoCode)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 font-mono text-lg font-bold tracking-wide text-primary-foreground hover:bg-primary/90"
            aria-label={`${t("pay.tapToDial")} ${momoCode}`}
          >
            <Phone className="h-5 w-5" aria-hidden /> {momoCode}
          </a>
          <CopyButton value={momoCode} label={site.momo.label} />
        </div>
        <p className="text-muted-foreground">{t("pay.tapToDial")} · {site.momo.label} · {site.momo.name}</p>
        {reference && <p className="text-muted-foreground">{t("pay.reference", { reference })}</p>}
      </div>
      )}

      {bank && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="font-semibold flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" /> {t("pay.bankTitle")}
          </p>
          <p className="text-muted-foreground">{t("pay.bankHint")}</p>
          <dl className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-muted-foreground">{t("pay.bank")}</dt>
            <dd className="font-medium">{site.bank.name}</dd>
            <dt className="text-muted-foreground">{t("pay.accountNumber")}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold tracking-wide">{site.bank.accountNumber}</span>
              <CopyButton value={site.bank.accountNumber} label={t("pay.accountNumber")} />
            </dd>
            <dt className="text-muted-foreground">{t("pay.accountName")}</dt>
            <dd className="font-medium">{site.bank.accountName}</dd>
            {site.bank.swift && (
              <>
                <dt className="text-muted-foreground">{t("pay.swift")}</dt>
                <dd className="font-mono">{site.bank.swift}</dd>
              </>
            )}
          </dl>
          {reference && <p className="text-muted-foreground">{t("pay.reference", { reference })}</p>}
        </div>
      )}
    </div>
  );
}
