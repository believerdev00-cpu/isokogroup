import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Radio, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { isLiteMotion } from "@/lib/motion";
import { displayCategory } from "@/lib/productCategories";
import { rpc } from "@/features/services/api";
import type { LiveAdvertProduct } from "@/features/adverts/api";
import { isProductInStock, productImages } from "@/lib/productImages";

/**
 * The advertising band's shop window, presented the way a shopping channel
 * presents stock.
 *
 * The band above it has always invited businesses to advertise and shown
 * nothing being sold, which is a poor argument for buying a placement: the
 * best case for advertising here is the catalogue itself. So one real listing
 * holds the stage at a time with its price and category over the picture, the
 * rest wait in a strip below, and the stage moves on by itself every few
 * seconds.
 *
 * It stops the moment it is hovered, focused or touched -- nothing should
 * slide out from under somebody who is reading it -- and a visitor who asked
 * for less motion (see src/lib/motion.ts) gets the same showcase standing
 * still, with the controls doing the moving.
 *
 * Every listing is read from the database. Only one that is active, in stock
 * and photographed goes on air: a placeholder square is not a product shot,
 * and advertising something that cannot be bought would send a visitor to a
 * marketplace that does not have it.
 */

const ROTATE_MS = 6500;
const ON_AIR_MAX = 6;

type ShowProduct = {
  id: string;
  name: string;
  price: number | null;
  category: string;
  image: string;
  description: string | null;
};

const francs = (price: number | null) =>
  typeof price === "number" ? `${price.toLocaleString()} RWF` : "Ask for a price";

/** One shape, whether a listing was paid for or picked from the catalogue. */
const asShown = (p: {
  id: string; name: string; price: number | null; category: string;
  description: string | null; image_url?: string | null; image_urls?: string[] | null;
}): ShowProduct => ({
  id: p.id,
  name: p.name,
  price: p.price,
  category: displayCategory(p.category, p.name),
  image: productImages(p)[0],
  description: p.description ?? null,
});

/**
 * The listings actually being advertised: a seller pressed "Advertise Here",
 * picked some of their products, and agreed a price with the office. The
 * database decides what that means -- an accepted agreement, inside the run
 * it covers -- so nothing here can put a product on the stage for free.
 */
function usePaidPlacements() {
  return useQuery({
    queryKey: ["advert-showcase", "paid"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ShowProduct[]> => {
      const live = await rpc<LiveAdvertProduct[]>("advert_live_products");
      return (live ?? [])
        .filter((p) => productImages(p).length > 0)
        .map((p) => asShown({ ...p, id: p.product_id }));
    },
  });
}

/**
 * The catalogue, for when nothing is on air.
 *
 * The band's argument has always been that the best case for advertising here
 * is the stock itself, and an empty band on the homepage would look broken
 * rather than available. So paid placements take the stage when there are
 * any, and the shop window falls back to this when there are not.
 */
function useCatalogue() {
  return useQuery({
    queryKey: ["advert-showcase", "catalogue"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ShowProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, category, description, image_url, image_urls, stock")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((p) => isProductInStock(p) && productImages(p).length > 0)
        .map(asShown);
    },
  });
}

export default function AdvertShowcase() {
  const { t } = useI18n();
  const paid = usePaidPlacements();
  const catalogue = useCatalogue();
  // What somebody paid for comes first. The catalogue only fills the stage
  // when nobody has.
  const products = useMemo(
    () => ((paid.data?.length ?? 0) > 0 ? paid.data! : catalogue.data ?? []).slice(0, ON_AIR_MAX),
    [paid.data, catalogue.data],
  );
  const lite = isLiteMotion();
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (lite || held || products.length < 2) return;
    const timer = window.setInterval(() => setAt((n) => (n + 1) % products.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [lite, held, products.length]);

  // A listing can sell out or be taken down between loads, so the stage index
  // is kept inside the list rather than trusted to stay valid.
  if (products.length === 0) return null;
  const shown = at % products.length;
  const current = products[shown];
  const go = (step: number) => setAt((n) => (n + step + products.length) % products.length);

  return (
    <div className="container mb-10">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        onTouchStart={() => setHeld(true)}
      >
        <div className="grid lg:grid-cols-2">
          {/* Taller than 16:9 on a phone: the caption below sits over the
              picture, and at video proportions it buried most of it. */}
          <div className="relative aspect-[4/3] overflow-hidden bg-black sm:aspect-video lg:aspect-auto lg:min-h-[21rem]">
            <img
              key={current.id}
              src={current.image}
              alt={current.name}
              // Not lazy, unlike the strip below: this is the one picture the
              // section is built around, and a lazy one fades in from an empty
              // black box every time the stage turns over.
              className={`h-full w-full object-cover ${lite ? "" : "animate-in fade-in duration-700"}`}
            />
            {/* The lower third: what a broadcast puts over the picture. */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-4 sm:p-5">
              {/* The category is repeated immediately below the picture, so on
                  a phone it is dropped here rather than spent on height. */}
              <p className="hidden text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary sm:block">
                {current.category}
              </p>
              <p className="line-clamp-1 font-display text-lg font-bold text-white sm:mt-1 sm:text-xl">{current.name}</p>
              <p className="mt-0.5 text-base font-bold text-white sm:text-lg">{francs(current.price)}</p>
            </div>
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-destructive-foreground">
              <span className={`h-2 w-2 rounded-full bg-white ${lite ? "" : "animate-pulse"}`} aria-hidden />
              <Radio className="h-3.5 w-3.5" aria-hidden /> On air
            </span>
          </div>

          <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {t("nav.marketplace")} · {current.category}
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold">{current.name}</h3>
              {current.description && (
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{current.description}</p>
              )}
            </div>
            <p className="font-display text-3xl font-bold text-primary">{francs(current.price)}</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/marketplace">
                <Button size="lg" className="gap-2 font-semibold">
                  <ShoppingBag className="h-4 w-4" /> Shop this
                </Button>
              </Link>
              <Link to="/marketplace">
                <Button size="lg" variant="outline" className="gap-2">
                  {t("featured.viewAll")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {products.length > 1 && (
              <div className="flex items-center gap-3 pt-1">
                <Button type="button" size="icon" variant="outline" aria-label="Show the previous product" onClick={() => go(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" aria-label="Show the next product" onClick={() => go(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground" aria-hidden>
                  {shown + 1} / {products.length}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Up next, and the way to jump straight to one. */}
        {products.length > 1 && (
          <div className="border-t border-border bg-muted/40 p-3 sm:p-4">
            <p className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Up next
            </p>
            <ul className="flex gap-3 overflow-x-auto pb-1">
              {products.map((p, i) => (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setAt(i)}
                    aria-current={i === shown ? "true" : undefined}
                    aria-label={`Show ${p.name}, ${francs(p.price)}`}
                    className={`block w-28 overflow-hidden rounded-lg border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-32 ${
                      i === shown ? "border-primary" : "border-transparent hover:border-border"
                    }`}
                  >
                    <span className="block aspect-square overflow-hidden bg-muted">
                      <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </span>
                    <span className="block truncate px-2 pt-1.5 text-xs font-medium">{p.name}</span>
                    <span className="block truncate px-2 pb-1.5 text-[0.7rem] text-muted-foreground">
                      {francs(p.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
