import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import envelopePlain from "@/assets/packaging/envelope-plain.jpg";
import envelope from "@/assets/packaging/envelope.jpg";
import sackPlain from "@/assets/packaging/sack-plain.jpg";
import sack from "@/assets/packaging/sack.jpg";
import eggTrayPlain from "@/assets/packaging/egg-tray-plain.jpg";
import eggTray from "@/assets/packaging/egg-tray.jpg";
import coffeePouchPlain from "@/assets/packaging/coffee-pouch-plain.jpg";
import coffeePouch from "@/assets/packaging/coffee-pouch.jpg";
import polytheneBagPlain from "@/assets/packaging/polythene-bag-plain.jpg";
import polytheneBag from "@/assets/packaging/polythene-bag.jpg";
import paperBagPlain from "@/assets/packaging/paper-bag-plain.jpg";
import paperBag from "@/assets/packaging/paper-bag.jpg";
import kraftBagPlain from "@/assets/packaging/isoko-kraft-bag-plain.jpg";
import kraftBag from "@/assets/packaging/isoko-kraft-bag.jpg";
import whiteBagPlain from "@/assets/packaging/isoko-white-bag-plain.jpg";
import whiteBag from "@/assets/packaging/isoko-white-bag.jpg";
import blackBagPlain from "@/assets/packaging/isoko-black-bag-plain.jpg";
import blackBag from "@/assets/packaging/isoko-black-bag.jpg";
import kraftBoxes from "@/assets/packaging/kraft-boxes.jpg";
import truck from "@/assets/delivery-truck-marker.png";

// Real photos of packaging, each as it comes and with the ISOKO brand printed on it
const PRODUCTS = [
  { label: "Envelopes", plain: envelopePlain, branded: envelope },
  { label: "Sacks", plain: sackPlain, branded: sack },
  { label: "Kraft bags", plain: kraftBagPlain, branded: kraftBag },
  { label: "Egg trays", plain: eggTrayPlain, branded: eggTray },
  { label: "Coffee pouches", plain: coffeePouchPlain, branded: coffeePouch },
  { label: "White bags", plain: whiteBagPlain, branded: whiteBag },
  { label: "Polythene bags", plain: polytheneBagPlain, branded: polytheneBag },
  { label: "Paper bags", plain: paperBagPlain, branded: paperBag },
  { label: "Black bags", plain: blackBagPlain, branded: blackBag },
];

/** Where the photos come from; their licences ask for this credit. ISOKO branding was added to each. */
export const PHOTO_CREDITS = [
  { title: "Brown envelope 2", author: "Taibhseoir", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Brown_envelope_2.jpg" },
  { title: "Dirty gunny sacks with isolated white background", author: "Miss Puzzle", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Dirty_gunny_sacks_with_isolated_white_background.png" },
  { title: "Empty cardboard egg crate", author: "ChimaBee", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Empty_cardboard_egg_crate.jpg" },
  { title: "Bolsa Doypack de Papel Kraft", author: "Nicole.Gutierrez.F", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Bolsa_Doypack_de_Papel_Kraft.jpg" },
  { title: "Black plastic bag on white counter", author: "999real", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Black_plastic_bag_on_white_counter.jpg" },
  { title: "White paper bag on white and black background", author: "Jeffrey Beall", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:White_paper_bag_on_white_and_black_background.jpg" },
  { title: "Eco-friendly cardboard packaging for takeaways", author: "Meanwell Packaging", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Eco-friendly_cardboard_packaging_for_takeaways.jpg" },
];

const TICK_MS = 1800;

const Photo = ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
  <img src={src} alt={alt} draggable={false} className={cn("h-full w-full rounded-xl object-cover", className)} />
);

/**
 * How packaging works, told with real photos: "Choose" shows each product as it
 * comes, "Brand" shows it with ISOKO printed on it, then it is packed and
 * delivered. The highlight moves from step to step.
 */
export function PackagingSteps({ className }: { className?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  // A new product every full round of the four steps
  const product = PRODUCTS[Math.floor(tick / 4) % PRODUCTS.length];
  const active = tick % 4;
  const steps = [
    { label: "Choose", art: <Photo key={`c-${product.label}`} src={product.plain} alt={product.label} className="pk-swap" /> },
    { label: "Brand", art: <Photo key={`b-${product.label}`} src={product.branded} alt={`${product.label} with the ISOKO brand`} className="pk-swap" /> },
    { label: "Pack", art: <Photo src={kraftBoxes} alt="ISOKO boxes" className="pk-zoom" /> },
    { label: "Deliver", art: <img src={truck} alt="ISOKO delivery truck" draggable={false} className="pk-drive h-full w-full object-contain p-1" /> },
  ];
  return (
    <div className={cn("relative", className)}>
      {/* ISOKO watermark */}
      <span aria-hidden className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden font-display text-6xl font-black tracking-[0.3em] text-white/10 sm:text-7xl">
        ISOKO
      </span>
      <ol className="relative flex items-start justify-center gap-2 sm:gap-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-lg transition-all duration-500 sm:h-24 sm:w-24",
                  i === active ? "scale-110 ring-[3px] ring-primary" : "ring-1 ring-white/30",
                )}
              >
                {s.art}
              </span>
              <span className={cn("text-xs font-semibold transition-colors", i === active ? "text-white" : "text-white/60")}>{s.label}</span>
              {i < 2 && <span className="-mt-1 text-[10px] text-white/50">{product.label}</span>}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className={cn("mb-8 hidden h-4 w-4 shrink-0 self-center transition-opacity sm:block", i === active ? "opacity-100" : "opacity-40")} aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
