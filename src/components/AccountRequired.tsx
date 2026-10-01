import { Link, useLocation } from "react-router-dom";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Shown in place of a request form or booking when the visitor has no account.
 * Explains that an account is needed, and both buttons bring the person back
 * here after registering or signing in (Login reads `state.from`).
 * The database refuses these actions without a session anyway; this is the
 * friendly version.
 */
export default function AccountRequired({ service, className }: { service?: string; className?: string }) {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const from = `${pathname}${search}`;
  return (
    <div className={cn("mx-auto w-full max-w-xl rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8", className)} role="region" aria-label={t("access.accountRequired")}>
      {service && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{service}</p>}
      <h2 className="mt-1 font-display text-2xl font-bold">{t("access.accountRequired")}</h2>
      <p className="mt-2 text-muted-foreground">{t("access.explain")}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-12 w-full gap-2">
          <Link to="/login?tab=register" state={{ from }}><UserPlus className="h-5 w-5" /> {t("access.register")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12 w-full gap-2">
          <Link to="/login" state={{ from }}><LogIn className="h-5 w-5" /> {t("access.signIn")}</Link>
        </Button>
      </div>
    </div>
  );
}
