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
  "Crafts",
  "Accessories",
];
