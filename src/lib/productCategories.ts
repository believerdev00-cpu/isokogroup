/**
 * The only categories a marketplace product may be listed under.
 *
 * Buyers filter on an exact match, so every product belongs to exactly one of
 * these: "Food" is edible goods, "Beverages" is anything drinkable and
 * "Fashion Hub" is clothing and wearables. A database CHECK constraint on
 * products.category keeps the list and the table in step, because products are
 * inserted straight from the browser and there is no server to validate them.
 *
 * Adding one here means adding it to that constraint too (see the
 * marketplace_categories migration).
 */
export const PRODUCT_CATEGORIES = [
  "Electronics",
  "Fashion Hub",
  "Food",
  "Beverages",
  "Beauty & Cosmetics",
  "Health & Pharmaceuticals",
  "Home",
  "Construction Materials",
  "Packaging and branding",
  "Accessories",
];

/** Drinkable goods, by name — the same test the migration uses to split the old bucket. */
const DRINKABLE =
  /beverage|drink|juice|water|soda|beer|wine|spirit|liquor|whisk|vodka|gin|rum|tea|coffee|milk|smoothie|cola|cider|lemonade/i;

/**
 * The category to show a product under, whatever is stored on the row.
 *
 * A product listed before the rename still says "Fashion" or "Food & Drink", and
 * since buyers filter on an exact match it would otherwise appear under no tab
 * but "All". Mapping at read time means the site is right before the migration
 * renames the rows and unchanged after it, so the two can ship in either order.
 * Anything already current, or genuinely unknown, is returned untouched.
 */
export const displayCategory = (category: string | null | undefined, name = ""): string => {
  if (!category) return "";
  if (category === "Fashion") return "Fashion Hub";
  if (category === "Crafts") return "Packaging and branding";
  if (category === "Food & Drink") return DRINKABLE.test(name) ? "Beverages" : "Food";
  return category;
};
