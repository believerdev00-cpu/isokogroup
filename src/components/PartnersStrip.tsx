import { cn } from "@/lib/utils";
import sweetFactory from "@/assets/partners/sweet-factory.webp";
import faithTrading from "@/assets/partners/faith-trading.webp";
import eawibp from "@/assets/partners/eawibp.webp";
import axeventure from "@/assets/partners/axeventure.webp";
import sine from "@/assets/partners/sine-fashion-house.webp";
import kamiko from "@/assets/partners/kamiko-coffee-shop.webp";
import lis from "@/assets/partners/lis.webp";
import starwax from "@/assets/partners/starwax.webp";
import citadelle from "@/assets/partners/citadelle.webp";
import alMulla from "@/assets/partners/al-mulla-trading.webp";
import koica from "@/assets/partners/koica.webp";

// The organisations ISOKO GROUP works with (from the company profile). Add a
// logo here and it appears everywhere the strip is shown.
export const PARTNERS = [
  { name: "KOICA", logo: koica },
  { name: "East African Women in Business Platform", logo: eawibp },
  { name: "The Sweet Factory", logo: sweetFactory },
  { name: "Faith Trading Co.", logo: faithTrading },
  { name: "Axeventure", logo: axeventure },
  { name: "Sine Fashion House", logo: sine },
  { name: "Kamiko Coffee Shop", logo: kamiko },
  { name: "LIS — Learn. Serve. Lead", logo: lis },
  { name: "Starwax", logo: starwax },
  { name: "Citadelle", logo: citadelle },
  { name: "Al Mulla Trading Company", logo: alMulla },
];

/**
 * "Our partners": a dark band holding a white strip of logos that drifts
 * sideways (paused on hover; a still, wrapped row for reduced motion).
 */
export default function PartnersStrip({ className, dark }: { className?: string; dark?: boolean }) {
  const row = (hidden = false) => (
    <ul className="partners-row flex shrink-0 items-center gap-10 pr-10 sm:gap-16 sm:pr-16" aria-hidden={hidden || undefined}>
      {PARTNERS.map((p) => (
        <li key={p.name} className="flex h-20 w-32 shrink-0 items-center justify-center sm:h-24 sm:w-40">
          <img src={p.logo} alt={hidden ? "" : p.name} title={p.name} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
        </li>
      ))}
    </ul>
  );
  return (
    <section className={cn("py-14 md:py-20", className)} aria-labelledby="partners-title">
      <div className="container">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Trusted by</p>
          <h2 id="partners-title" className={cn("mt-2 font-display text-3xl font-bold md:text-4xl", dark && "text-white")}>Our partners</h2>
          <p className={cn("mx-auto mt-2 max-w-xl", dark ? "text-neutral-400" : "text-muted-foreground")}>
            Businesses and organisations that work hand in hand with ISOKO GROUP.
          </p>
        </div>
      </div>
      {/* The band */}
      <div className="bg-[#0b1530] px-3 py-8 sm:px-6 [clip-path:polygon(0_0,100%_0,98.5%_50%,100%_100%,0_100%,1.5%_50%)] sm:[clip-path:polygon(0_0,100%_0,99%_50%,100%_100%,0_100%,1%_50%)]">
        <div className="partners-strip group mx-auto max-w-6xl overflow-hidden rounded-md bg-white py-4">
          <div className="partners-track flex w-max">
            {row()}
            {row(true)}
          </div>
        </div>
      </div>
    </section>
  );
}
