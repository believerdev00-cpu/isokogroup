import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { breadcrumbsFor } from "@/lib/services";

/** "Home › Services › Logistics & Supply › Packaging": where you are, on every page. */
const Breadcrumbs = () => {
  const { pathname } = useLocation();
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="border-b border-border/60 bg-muted/30">
      <ol className="container flex h-9 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
            <li className="shrink-0">
              {c.path ? (
                <Link to={c.path} className="transition-colors hover:text-foreground">{c.label}</Link>
              ) : (
                <span aria-current="page" className="font-medium text-foreground">{c.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
