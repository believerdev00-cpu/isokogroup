import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { analyticsEnabled, readConsent, setConsent } from "@/lib/analytics";

/**
 * The consent bar for the Google tag: shown once, only when a tag id is
 * configured and the visitor hasn't chosen yet. Decline is as easy as accept.
 */
export default function ConsentBanner() {
  const { t } = useI18n();
  const [choice, setChoice] = useState(() => readConsent());
  if (!analyticsEnabled() || choice) return null;
  const pick = (c: "granted" | "denied") => {
    setConsent(c);
    setChoice(c);
  };
  return (
    <div role="dialog" aria-live="polite" aria-label={t("consent.title")} className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur">
      <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{t("consent.title")}</span> {t("consent.text")}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => pick("denied")}>{t("consent.decline")}</Button>
          <Button className="h-11 flex-1 sm:flex-none" onClick={() => pick("granted")}>{t("consent.accept")}</Button>
        </div>
      </div>
    </div>
  );
}
