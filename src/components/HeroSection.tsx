import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Truck, Package, ShoppingBag, BookOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const HeroSection = () => {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-card text-foreground border-b border-border bg-animated-gradient">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-primary blur-3xl animate-float-soft" />
        <div className="absolute bottom-10 right-20 w-96 h-96 rounded-full bg-primary blur-3xl animate-float-soft" style={{ animationDelay: "1.5s" }} />
      </div>

      <div className="container relative py-24 md:py-32 lg:py-40">
        <div className="max-w-3xl space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground animate-fade-in">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            {t("hero.badge")}
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight animate-slide-up">
            {t("hero.title1")} {" "}
            <span className="text-primary">{t("hero.logistics")}</span>,{" "}
            <span className="text-primary">{t("hero.marketplace")}</span> &{" "}
            <span className="text-primary">{t("hero.knowledge")}</span>
          </h1>

          {t("hero.subtitle").split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index} className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed animate-slide-up" style={{ animationDelay: "0.15s" }}>
              {paragraph}
            </p>
          ))}

          <div className="flex flex-wrap gap-4 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <Link to="/login">
              <Button size="lg" className="gap-2 text-base px-8">
                {t("hero.getStarted")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button size="lg" variant="outline" className="text-base px-8 font-semibold">
                {t("hero.browseMarketplace")}
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-border animate-slide-up" style={{ animationDelay: "0.45s" }}>
            {[
              { icon: Truck, label: t("hero.logistics"), desc: t("hero.fastDelivery") },
              { icon: Package, label: t("nav.packaging"), desc: t("hero.securePacking") },
              { icon: ShoppingBag, label: t("hero.marketplace"), desc: t("hero.buySell") },
              { icon: BookOpen, label: t("nav.elibrary"), desc: t("hero.readOnline") },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-3" data-aos="fade-up" data-aos-delay={i * 80}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 animate-float-soft" style={{ animationDelay: `${i * 0.4}s` }}>
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
