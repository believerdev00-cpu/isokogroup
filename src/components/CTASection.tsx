import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const CTASection = () => {
  const { t } = useI18n();
  const benefits = [
    t("cta.benefit1"),
    t("cta.benefit2"),
    t("cta.benefit3"),
    t("cta.benefit4"),
  ];

  return (
    <section className="py-14 sm:py-20 bg-card text-foreground relative overflow-hidden border-y border-border">
      <div className="pointer-events-none absolute inset-0 opacity-10" aria-hidden>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary blur-3xl" />
      </div>

      <div className="container relative">
        <div className="max-w-3xl mx-auto text-center space-y-6 sm:space-y-8">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("cta.joinToday")}</span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold [text-wrap:balance]">
            {t("cta.title")} <span className="text-primary">50 RWF</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">{t("cta.subtitle")}</p>

          {/* Left-aligned inside the centred block, so wrapped lines line up with their tick */}
          <ul className="flex flex-col max-w-md mx-auto gap-3 text-left">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-muted-foreground">
                <CheckCircle className="mt-0.5 h-5 w-5 text-primary flex-shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="w-full gap-2 text-base px-10 mt-2 sm:mt-4 sm:w-auto">
            <Link to="/login">
              {t("cta.getStarted")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
