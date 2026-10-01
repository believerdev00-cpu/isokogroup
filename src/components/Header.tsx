import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Globe, LayoutGrid, LogOut, Menu, Search, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LANGS, LANG_NAMES, useI18n, type Lang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useStaffAccess } from "@/features/staff/access";
import { CATEGORIES, SERVICES } from "@/lib/services";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import logo from "@/assets/isoko-logo.jpeg";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationsBell from "@/components/NotificationsBell";
import CartBadge from "@/components/CartBadge";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SearchTrigger, useServiceSearch } from "@/components/ServiceSearch";

// Four places to go (Home, Services, Track, About), a search that finds any
// service, and one Account menu. Every service lives in the Services menu,
// grouped by category, so nothing is ever more than a few clicks away.

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "text-primary" : "text-foreground/75 hover:text-foreground",
  );

/** Services menu: every service, grouped by category. */
function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useI18n();
  const active = pathname === "/services" || SERVICES.some((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none",
          active || open ? "text-primary" : "text-foreground/75 hover:text-foreground",
        )}
      >
        {t("nav.services")}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={12} className="w-[min(92vw,56rem)] p-0">
        <div className="grid gap-x-2 gap-y-1 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="rounded-xl p-2">
              <p className="mb-1 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <c.icon className="h-3.5 w-3.5" /> {c.title}
              </p>
              <ul>
                {SERVICES.filter((s) => s.category === c.key).map((s) => (
                  <li key={s.id}>
                    <Link to={s.path} className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
                      <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform duration-300 group-hover:scale-110" />
                      <span>
                        <span className="block text-sm font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground line-clamp-1">{s.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Link to="/services" className="flex items-center justify-center gap-2 border-t bg-muted/40 py-3 text-sm font-semibold text-primary hover:bg-muted">
          <LayoutGrid className="h-4 w-4" /> {t("nav.openServiceHub")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** The five languages, each in its own name; the current one is ticked. */
function LanguageMenu({ className }: { className?: string }) {
  const { t, lang, setLang } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("flex items-center gap-1 rounded-full bg-muted px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/80 focus:outline-none", className)}
        aria-label={t("nav.language")}
      >
        <Globe className="h-3.5 w-3.5" /> {lang.toUpperCase()} <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60] w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("nav.language")}</DropdownMenuLabel>
        {LANGS.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => setLang(l)} className="justify-between" lang={l}>
            {LANG_NAMES[l]} {l === lang && <Check className="h-4 w-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  // Travel, Consultancy and Data Analysis staff (admins reach the workspace from Admin too)
  const { services: staffServices } = useStaffAccess();
  const isServiceStaff = staffServices.length > 0;
  const { open: openSearch } = useServiceSearch();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const accountLinks = [
    { to: "/dashboard", label: t("nav.dashboard") },
    { to: "/my-orders", label: t("nav.myOrders") },
    { to: "/insights", label: t("nav.insights") },
    { to: "/seller", label: t("nav.seller") },
    { to: "/subscription", label: t("nav.subscription") },
    ...(isServiceStaff ? [{ to: "/staff", label: t("nav.workspace") }] : []),
    ...(isAdmin ? [{ to: "/admin", label: t("nav.admin") }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 items-center gap-3">
        <Link to="/" className="flex shrink-0 items-center gap-1.5" aria-label="ISOKO GROUP home">
          <motion.img
            src={logo}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
            initial={{ scale: 1.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            whileHover={{ scale: 1.1, rotate: 6 }}
          />
          <span className="whitespace-nowrap font-display text-base font-bold tracking-tight">
            ISOKO <span className="text-primary">GROUP</span>
          </span>
        </Link>

        {/* Desktop */}
        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">
          <NavLink to="/" end className={linkClass}>{t("nav.home")}</NavLink>
          <ServicesMenu />
          <NavLink to="/track" className={linkClass}>{t("nav.track")}</NavLink>
          <NavLink to="/about" className={linkClass}>{t("nav.about")}</NavLink>
        </nav>

        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          <SearchTrigger className="w-56" label={t("nav.search")} />
          <LanguageMenu />
          <ThemeToggle />
          <CartBadge />
          {user && <NotificationsBell />}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                  <User className="h-4 w-4" /> {t("nav.account")} <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[60] w-52">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accountLinks.map((l) => (
                  <DropdownMenuItem key={l.to} onSelect={() => navigate(l.to)}>{l.label}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" /> {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/login?tab=register">
                <Button size="sm" variant="outline" className="rounded-full px-4">{t("nav.register")}</Button>
              </Link>
              <Link to="/login">
                <Button size="sm" className="rounded-full px-4">{t("nav.signIn")}</Button>
              </Link>
            </>
          )}
        </div>

        {/* Phone & tablet */}
        <div className="ml-auto flex items-center gap-0.5 lg:hidden">
          <Button variant="ghost" size="icon" onClick={openSearch} aria-label={t("nav.search")}>
            <Search className="h-5 w-5" />
          </Button>
          {user && <CartBadge />}
          {user && <NotificationsBell />}
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu" aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden border-t border-border bg-background lg:hidden"
          >
            <nav className="container max-h-[calc(100vh-3.5rem)] overflow-y-auto overflow-x-hidden py-4" aria-label="Main">
              {/* The essentials first: language, theme, and the way in */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 text-sm">
                  <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="sr-only">{t("nav.language")}</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Lang)}
                    className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium outline-none"
                    aria-label={t("nav.language")}
                  >
                    {LANGS.map((l) => (
                      <option key={l} value={l} lang={l}>{LANG_NAMES[l]}</option>
                    ))}
                  </select>
                </label>
                <div className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-sm">
                  <span className="truncate font-medium">{t("nav.theme")}</span>
                  <ThemeToggle className="h-9 w-9 shrink-0" />
                </div>
              </div>

              {!user && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link to="/login?tab=register" className="min-w-0">
                    <Button variant="outline" className="h-12 w-full text-base">{t("nav.register")}</Button>
                  </Link>
                  <Link to="/login" className="min-w-0">
                    <Button className="h-12 w-full text-base">{t("nav.signIn")}</Button>
                  </Link>
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { to: "/", label: t("nav.home") },
                  { to: "/track", label: t("nav.track") },
                  { to: "/about", label: t("nav.about") },
                ].map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end
                    className={({ isActive }) =>
                      cn("min-h-11 rounded-xl border px-1 py-2.5 text-center text-sm font-medium", isActive ? "border-primary/40 bg-primary/10 text-primary" : "hover:bg-muted")
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </div>

              <p className="mb-2 mt-5 flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("nav.services")}
                <Link to="/services" className="normal-case tracking-normal text-primary">{t("nav.serviceHub")} →</Link>
              </p>
              <div className="space-y-4">
                {CATEGORIES.map((c) => (
                  <div key={c.key}>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{c.title}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SERVICES.filter((s) => s.category === c.key).map((s) => (
                        <Link key={s.id} to={s.path} className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-left text-sm hover:bg-muted">
                          <s.icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 leading-tight">{s.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {user && (
                <div className="mt-4 border-t pt-4">
                  <p className="mb-2 truncate text-xs text-muted-foreground">{user.email}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {accountLinks.map((l) => (
                      <Link key={l.to} to={l.to} className="min-w-0">
                        <Button variant="outline" className="h-11 w-full">{l.label}</Button>
                      </Link>
                    ))}
                  </div>
                  <Button variant="ghost" className="mt-2 h-11 w-full" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> {t("nav.logout")}
                  </Button>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
      <Breadcrumbs />
    </header>
  );
};

export default Header;
