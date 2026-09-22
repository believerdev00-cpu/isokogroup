import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Globe, ShoppingCart, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import logo from "@/assets/isoko-logo.jpeg";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationsBell from "@/components/NotificationsBell";
import CartBadge from "@/components/CartBadge";

type NavItem = { label: string; path: string };

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const nextLang = lang === "en" ? "rw" : lang === "rw" ? "sw" : lang === "sw" ? "fr" : lang === "fr" ? "zh" : "en";
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();

  const navItems: NavItem[] = useMemo(
    () => [
      { label: t("nav.home"), path: "/" },
      { label: t("nav.logistics"), path: "/logistics" },
      { label: t("nav.packaging"), path: "/logistics/packaging" },
      { label: t("nav.marketplace"), path: "/marketplace" },
      { label: t("nav.elibrary"), path: "/e-library" },
      { label: t("nav.entertainment"), path: "/entertainment" },
      { label: t("nav.software"), path: "/software" },
      { label: t("nav.about"), path: "/about" },
    ],
    [t]
  );

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  // ----- Auto-collapse nav -----
  const navContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(navItems.length);

  useLayoutEffect(() => {
    const container = navContainerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recalc = () => {
      const available = container.clientWidth;
      const items = Array.from(measure.children) as HTMLElement[];
      const moreWidth = (moreRef.current?.offsetWidth ?? 0) + 8;
      const widths = items.map((el) => el.offsetWidth + 4); // include gap
      const total = widths.reduce((a, b) => a + b, 0);

      if (total <= available) {
        setVisibleCount(navItems.length);
        return;
      }

      let used = 0;
      let count = 0;
      const budget = available - moreWidth;
      for (let i = 0; i < widths.length; i++) {
        if (used + widths[i] <= budget) {
          used += widths[i];
          count++;
        } else {
          break;
        }
      }
      setVisibleCount(count);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    ro.observe(measure);
    window.addEventListener("resize", recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, [navItems]);

  const visibleItems = navItems.slice(0, visibleCount);
  const overflowItems = navItems.slice(visibleCount);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 items-center gap-2">
        <Link to="/" className="flex items-center gap-1.5 shrink-0">
          <motion.img
            src={logo}
            alt="ISOKO GROUP"
            className="h-8 w-8 rounded-full object-cover"
            initial={{ scale: 1.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.1, rotate: 6 }}
          />
          <span className="text-base font-bold font-display tracking-tight whitespace-nowrap">
            ISOKO <span className="text-primary">GROUP</span>
          </span>
        </Link>

        {/* Desktop nav with overflow detection */}
        <div ref={navContainerRef} className="hidden xl:flex flex-1 min-w-0 items-center justify-center overflow-hidden">
          <nav className="flex items-center gap-0.5 flex-nowrap">
            {visibleItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`relative px-2 py-1.5 text-xs font-medium transition-colors hover:text-primary whitespace-nowrap ${
                  location.pathname === item.path ? "text-primary" : "text-foreground/70"
                }`}
              >
                {item.label}
                {location.pathname === item.path && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
              </Link>
            ))}
            {overflowItems.length > 0 && (
              <div ref={moreRef}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-foreground/70 hover:text-primary whitespace-nowrap rounded-md focus:outline-none">
                    More <ChevronDown className="h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[60]">
                    {overflowItems.map((item) => (
                      <DropdownMenuItem
                        key={item.path}
                        onSelect={() => navigate(item.path)}
                        className={location.pathname === item.path ? "text-primary" : ""}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </nav>

          {/* Hidden measurement layer with full nav for accurate widths */}
          <div
            ref={measureRef}
            aria-hidden
            className="absolute -left-[9999px] top-0 flex items-center gap-0.5 pointer-events-none"
          >
            {navItems.map((item) => (
              <span
                key={item.path}
                className="px-2 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="hidden xl:flex items-center gap-1 shrink-0 ml-auto">
          <ThemeToggle />
          <button
            onClick={() => setLang(nextLang)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            {lang === "en" ? "EN" : lang === "rw" ? "RW" : lang === "sw" ? "SW" : lang === "fr" ? "FR" : "ZH"}
          </button>
          <CartBadge />
          {user && <NotificationsBell />}
          {user ? (
            <>
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">{t("nav.dashboard")}</Button>
              </Link>
              <Link to="/insights">
                <Button variant="ghost" size="sm">{t("nav.insights")}</Button>
              </Link>
              <Link to="/my-orders">
                <Button variant="ghost" size="sm">{t("nav.myOrders")}</Button>
              </Link>
              <Link to="/seller">
                <Button variant="outline" size="sm">{t("nav.seller")}</Button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm">{t("nav.admin")}</Button>
                </Link>
              )}
              <Link to="/subscription">
                <Button variant="outline" size="sm">{t("nav.subscription")}</Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={handleLogout}>{t("nav.logout")}</Button>
            </>
          ) : (
            <>
              <Link to="/become-seller">
                <Button variant="outline" size="sm">{t("nav.becomeSeller")}</Button>
              </Link>
              <Link to="/login">
                <Button size="sm">{t("nav.login")}</Button>
              </Link>
            </>
          )}
        </div>

        <div className="xl:hidden flex items-center gap-1 ml-auto">
          {user && <CartBadge />}
          {user && <NotificationsBell />}
          <ThemeToggle />
          <button className="p-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="xl:hidden border-t border-border bg-background animate-fade-in">
          <nav className="container flex flex-col py-4 gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="flex items-center gap-2 px-4 py-2">
              <button
                onClick={() => setLang(nextLang)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted"
              >
                <Globe className="h-3.5 w-3.5" />
                {lang === "en" ? "English" : lang === "rw" ? "Kinyarwanda" : lang === "sw" ? "Kiswahili" : lang === "fr" ? "Français" : "中文"}
              </button>
            </div>
            <div className="flex flex-col gap-2 mt-4 px-4">
              {user ? (
                <>
                  <Link to="/my-orders" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">{t("nav.myOrders")}</Button>
                  </Link>
                  <Link to="/insights" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">{t("nav.insights")}</Button>
                  </Link>
                  <Link to="/seller" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">{t("nav.seller")}</Button>
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="w-full">{t("nav.admin")}</Button>
                    </Link>
                  )}
                  <Link to="/subscription" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">{t("nav.subscription")}</Button>
                  </Link>
                  <Button className="w-full" onClick={() => { handleLogout(); setMobileOpen(false); }}>{t("nav.logout")}</Button>
                </>
              ) : (
                <>
                  <Link to="/become-seller" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">{t("nav.becomeSeller")}</Button>
                  </Link>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full">{t("nav.login")}</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
