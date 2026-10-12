// The packaging price list, read from the database.
//
// It used to be a literal array in the Packaging page, which meant a price
// could only be changed by editing the page, rebuilding and deploying. The
// rows are now in packaging_products, seeded with exactly that array, and
// an administrator can change a figure from the admin desk.
//
// There is deliberately no hardcoded fallback. A fallback would be the old
// array all over again, and the day it diverged the page would quote a
// price nobody at Isoko had agreed to -- quietly, and only for the visitors
// unlucky enough to load it while the database was unreachable. Better to
// say the list could not be loaded than to show a number that may be wrong.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PackagingProduct = { code: string; name: string; price: number; unit: string };
export type PackagingCategory = { id: string; title: string; note?: string; products: PackagingProduct[] };

type CategoryRow = { id: string; title: string; note: string | null; sort: number };
type ProductRow = { code: string; category_id: string; name: string; price: number; unit: string; sort: number; is_active: boolean };

/** Categories in their order, each with its active products in theirs. */
export function usePackagingCatalogue() {
  return useQuery({
    queryKey: ["packaging", "catalogue"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PackagingCategory[]> => {
      const [cats, prods] = await Promise.all([
        supabase.from("packaging_categories").select("id, title, note, sort").order("sort"),
        supabase.from("packaging_products").select("code, category_id, name, price, unit, sort, is_active").order("sort"),
      ]);
      if (cats.error) throw cats.error;
      if (prods.error) throw prods.error;

      const byCategory = new Map<string, PackagingProduct[]>();
      for (const p of (prods.data ?? []) as ProductRow[]) {
        if (!p.is_active) continue;
        const list = byCategory.get(p.category_id) ?? [];
        list.push({ code: p.code, name: p.name, price: p.price, unit: p.unit });
        byCategory.set(p.category_id, list);
      }
      // A category with nothing left in it is not a heading worth printing.
      return ((cats.data ?? []) as CategoryRow[])
        .map((c) => ({ id: c.id, title: c.title, note: c.note ?? undefined, products: byCategory.get(c.id) ?? [] }))
        .filter((c) => c.products.length > 0);
    },
  });
}
