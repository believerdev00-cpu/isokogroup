import { Truck, Package, ShoppingBag, BookOpen, Film, Code2, ArrowRight, ShoppingCart, Network, CalendarCheck, GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

const ServicesSection = () => {
  const { t } = useI18n();

  const services = [
    {
      icon: Truck,
      title: t("nav.logistics"),
      description: "Reliable pickup, delivery & courier services across Kigali and beyond.",
      path: "/logistics",
    },
    {
      icon: Package,
      title: t("nav.packaging"),
      description: "Branded paper bags and secure packaging for shops and businesses.",
      path: "/logistics/packaging",
    },
    {
      icon: ShoppingBag,
      title: t("nav.marketplace"),
      description: "Buy from trusted local sellers or open your own shop online.",
      path: "/marketplace",
    },
    {
      icon: BookOpen,
      title: t("nav.elibrary"),
      description: "Read curated books, guides and study material — anywhere, anytime.",
      path: "/e-library",
    },
    {
      icon: Film,
      title: t("nav.entertainment"),
      description: "Stream Isoko Studioz films, shorts and podcasts in one place.",
      path: "/entertainment",
    },
    {
      icon: Code2,
      title: t("services.softwareTitle"),
      description: t("services.softwareDesc"),
      path: "/software",
    },
    {
      icon: ShoppingCart,
      title: t("services.sourcingTitle"),
      description: t("services.sourcingDesc"),
      path: "/logistics/sourcing",
    },
    {
      icon: Network,
      title: t("services.supplyChainTitle"),
      description: t("services.supplyChainDesc"),
      path: "/logistics/supply-chain",
    },
    {
      icon: CalendarCheck,
      title: t("services.softwareBookingTitle"),
      description: t("services.softwareBookingDesc"),
      path: "/software/booking",
    },
    {
      icon: GraduationCap,
      title: t("services.academyTitle"),
      description: t("services.academyDesc"),
      path: "/software/academy",
    },
  ];

  return (
    <section className="py-20 md:py-28">
      <div className="container">
        <div className="text-center mb-16 space-y-4" data-aos="fade-up">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("services.ourServices")}</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold">{t("services.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">{t("services.subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, i) => (
            <Link
              key={service.title}
              to={service.path}
              data-aos="fade-up"
              data-aos-delay={Math.min(i * 60, 400)}
              className="group relative rounded-xl border border-border bg-card p-6 hover-lift press"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                <service.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{service.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{service.description}</p>
              <span className="inline-flex items-center text-sm font-medium text-primary gap-1 group-hover:gap-2 transition-all">
                {t("services.learnMore")} <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
