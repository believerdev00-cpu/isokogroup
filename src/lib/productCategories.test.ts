import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_CATEGORIES, displayCategory } from "./productCategories";

// Products are inserted straight from the browser under RLS, so the list the UI
// offers is only as good as the CHECK constraint behind it. If the two drift, a
// seller picks a category the database rejects, or a category nobody can reach.
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261013100000_marketplace_categories.sql"),
  "utf8",
);

/** The quoted values inside the products_known_category CHECK (...) list. */
const constraintCategories = () => {
  const check = migration.match(/ADD CONSTRAINT products_known_category CHECK \(([\s\S]*?)\) NOT VALID;/);
  if (!check) throw new Error("products_known_category CHECK not found in the migration");
  return [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe("product categories", () => {
  it("is the list the marketplace was asked for", () => {
    expect(PRODUCT_CATEGORIES).toEqual([
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
    ]);
  });

  it("matches the database CHECK constraint exactly", () => {
    expect([...constraintCategories()].sort()).toEqual([...PRODUCT_CATEGORIES].sort());
  });

  it("keeps food and drink apart, and has retired the combined bucket", () => {
    expect(PRODUCT_CATEGORIES).toContain("Food");
    expect(PRODUCT_CATEGORIES).toContain("Beverages");
    expect(PRODUCT_CATEGORIES).not.toContain("Food & Drink");
    // "Fashion" was renamed, not kept alongside
    expect(PRODUCT_CATEGORIES).toContain("Fashion Hub");
    expect(PRODUCT_CATEGORIES).not.toContain("Fashion");
    // and so was "Crafts"
    expect(PRODUCT_CATEGORIES).toContain("Packaging and branding");
    expect(PRODUCT_CATEGORIES).not.toContain("Crafts");
  });

  it("has no duplicates and nothing blank", () => {
    expect(new Set(PRODUCT_CATEGORIES).size).toBe(PRODUCT_CATEGORIES.length);
    for (const c of PRODUCT_CATEGORIES) expect(c.trim()).toBe(c);
    expect(PRODUCT_CATEGORIES).not.toContain("");
  });

  it("renames the old rows before closing the list, so nothing vanishes", () => {
    // Order matters: a CHECK added before the UPDATEs would reject its own data.
    const rename = migration.indexOf("SET category = 'Fashion Hub'");
    const constraint = migration.indexOf("ADD CONSTRAINT products_known_category");
    expect(rename).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(rename);
    expect(migration).toMatch(/UPDATE public\.products SET category = 'Food' WHERE category = 'Food & Drink';/);
  });

  it("leaves pre-existing rows alone instead of failing the migration", () => {
    expect(migration).toMatch(/\) NOT VALID;/);
  });
});

// The site must read correctly whether or not the migration has run, so the two
// can ship in either order.
describe("displayCategory", () => {
  it("shows a product listed before the rename under its new tab", () => {
    expect(displayCategory("Fashion", "Kitenge Fabric")).toBe("Fashion Hub");
    expect(displayCategory("Crafts", "Handwoven Basket")).toBe("Packaging and branding");
    expect(displayCategory("Food & Drink", "Bottled Water 1L")).toBe("Beverages");
    expect(displayCategory("Food & Drink", "Organic Coffee Beans")).toBe("Beverages");
    expect(displayCategory("Food & Drink", "Akabanga Chilli Oil")).toBe("Food");
    expect(displayCategory("Food & Drink", "Dried Beans 5kg")).toBe("Food");
  });

  it("splits the old bucket the same way the migration does", () => {
    // Both read the same word list, so a row renamed by SQL and a row mapped in
    // the browser land in the same tab.
    const sql = migration.match(/AND name ~\* '\(([^)]+)\)'/);
    if (!sql) throw new Error("drinkable pattern not found in the migration");
    for (const word of sql[1].split("|")) {
      expect(displayCategory("Food & Drink", `Some ${word} product`)).toBe("Beverages");
    }
  });

  it("leaves a current category untouched, so nothing changes after the migration", () => {
    for (const c of PRODUCT_CATEGORIES) expect(displayCategory(c, "anything")).toBe(c);
  });

  it("does not invent a category for an unknown or missing one", () => {
    expect(displayCategory("Vintage Vinyl", "A record")).toBe("Vintage Vinyl");
    expect(displayCategory(null)).toBe("");
    expect(displayCategory(undefined)).toBe("");
    expect(displayCategory("")).toBe("");
  });
});
