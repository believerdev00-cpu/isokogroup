import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CATEGORIES, SERVICES } from "@/lib/services";

// Homepage: the other services, as five clear categories instead of a wall of
// cards. Each opens its section of the Service Hub.
const ServicesSection = () => {
  const { t } = useI18n();
  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4" data-aos="fade-up">
          <div>
            <h2 className="font-display text-3xl font-bold md:text-4xl">{t("home.explore")}</h2>
            <p className="mt-2 text-muted-foreground">{t("home.exploreSub")}</p>
          </div>
          <Link to="/services" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            {t("home.allServices")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c, i) => {
            const items = SERVICES.filter((s) => s.category === c.key);
            return (
              <Link
                key={c.key}
                to={`/services#${c.key}`}
                data-aos="fade-up"
                data-aos-delay={i * 70}
                className="card-interactive group flex flex-col overflow-hidden rounded-2xl border bg-card"
              >
                <div className={cn("flex items-center gap-3 bg-gradient-to-br p-5 text-white", c.tint)}>
                  <c.icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                  <span className="font-semibold leading-tight">{c.title}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-sm text-muted-foreground">{c.blurb}</p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                    {items.slice(0, 4).map((s) => (
                      <li key={s.id} className="flex items-center gap-2">
                        <s.icon className="h-3.5 w-3.5 text-primary" /> {s.name}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    {t("nav.services")} <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
