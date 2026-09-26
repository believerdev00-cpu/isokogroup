import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { breadcrumbsFor } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * "Home › Services › Logistics & Supply › Packaging": where you are, on every page.
 * On phones the middle steps fold into "…" (Home › … › parent › page) and a long
 * page name is shortened, so the trail always fits on one line.
 */
const Breadcrumbs = () => {
  const { pathname } = useLocation();
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length < 2) return null;
  const last = crumbs.length - 1;
  // hidden on phones: everything between Home and the parent of the current page
  const folded = (i: number) => i > 0 && i < last - 1;
  return (
    <nav aria-label="Breadcrumb" className="border-b border-border/60 bg-muted/30">
      <ol className="container flex h-9 min-w-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {/* phones: "Home › … › parent › page" (the "…" stands for the folded steps) */}
            {i === 1 && last > 2 && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60 sm:hidden" aria-hidden />
                <li className="shrink-0 sm:hidden" aria-hidden>…</li>
              </>
            )}
            {i > 0 && <ChevronRight className={cn("h-3 w-3 shrink-0 opacity-60", folded(i) && "hidden sm:block")} aria-hidden />}
            <li className={cn(i === last ? "min-w-0" : "shrink-0", folded(i) && "hidden sm:block")}>
              {c.path ? (
                <Link to={c.path} className={cn("transition-colors hover:text-foreground", i === last && "block truncate")}>{c.label}</Link>
              ) : (
                <span aria-current="page" className="block truncate font-medium text-foreground">{c.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
