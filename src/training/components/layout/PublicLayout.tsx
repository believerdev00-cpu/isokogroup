import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { HOME_FOR, useAuth } from "@/training/lib/auth";
import { useApi } from "@/training/lib/query";
import type { Center } from "@/training/lib/types";
import { cn } from "@/lib/utils";
import { IctWhatsAppFloat, ictWhatsappLink } from "@/components/IctWhatsApp";
import { ICT_CONTACT } from "@/lib/company";
import { MessageCircle } from "lucide-react";

const NAV = [
  { to: "/training-center", label: "Home", end: true },
  { to: "/training-center/programs", label: "Programs" },
  { to: "/training-center/intakes", label: "Available Intakes" },
  { to: "/training-center/about", label: "About" },
  { to: "/training-center/contact", label: "Contact" },
];

export function useCenter() {
  return useApi<Center>("/public/center");
}

// The Training Center's public pages sit inside the Isoko site: the Isoko header
// and footer, with the Training Center's own menu underneath the header.
export default function PublicLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="border-b bg-muted/40">
        <div className="container flex items-center gap-2 py-2">
          <Link to="/training-center" className="mr-2 hidden shrink-0 text-sm font-bold text-primary sm:block">
            Training Center
          </Link>
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Training Center">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "bg-background text-primary shadow-sm",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <Button asChild size="sm" variant="outline">
                <Link to={HOME_FOR[user.role]}>My portal</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link to="/training-center/login">Portal sign in</Link>
              </Button>
            )}
            {pathname !== "/training-center/apply" && (
              <Button asChild size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90">
                <Link to="/training-center/apply">Apply Now</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <main id="main" className="flex-1">
        {/* Questions about applying go to the ICT team on WhatsApp */}
        {pathname === "/training-center/apply" && (
          <div className="container max-w-4xl pt-6">
            <a
              href={ictWhatsappLink("a training program")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4 text-[#1f9d55]" aria-hidden />
              Questions about a program? WhatsApp us on <span className="font-semibold text-foreground">{ICT_CONTACT.display}</span>
            </a>
          </div>
        )}
        <Outlet />
      </main>
      <IctWhatsAppFloat topic="the Training Center" compact />

      <div className="border-t bg-muted/40">
        <div className="container flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm text-muted-foreground">
          <Link className="hover:text-primary" to="/training-center/application-status">Check application status</Link>
          <Link className="hover:text-primary" to="/training-center/verify">Verify a certificate</Link>
          <Link className="hover:text-primary sm:hidden" to="/training-center/login">Portal sign in</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
