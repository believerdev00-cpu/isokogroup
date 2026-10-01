import { describe, expect, it } from "vitest";
import {
  MAX_PRODUCT_IMAGES,
  imageFileProblem,
  imagesLeft,
  imagesPatch,
  isProductInStock,
  ownStoragePath,
  productImages,
} from "./productImages";

const seller = "00000000-0000-4000-8000-000000000001";
const url = (name: string) => `https://xyz.supabase.co/storage/v1/object/public/product-images/${seller}/${name}`;

describe("productImages", () => {
  it("shows an older single-image product's picture", () => {
    expect(productImages({ image_url: "https://cdn/x.jpg", image_urls: [] })).toEqual(["https://cdn/x.jpg"]);
    expect(productImages({ image_url: "https://cdn/x.jpg" })).toEqual(["https://cdn/x.jpg"]);
  });
  it("shows the list, in order, when there is one", () => {
    expect(productImages({ image_url: url("a.jpg"), image_urls: [url("a.jpg"), url("b.jpg")] })).toEqual([url("a.jpg"), url("b.jpg")]);
  });
  it("shows nothing for a product without images", () => {
    expect(productImages({ image_url: null, image_urls: [] })).toEqual([]);
  });
});

describe("imagesPatch", () => {
  it("keeps image_url as the first image", () => {
    expect(imagesPatch([url("b.jpg"), url("a.jpg")])).toEqual({ image_urls: [url("b.jpg"), url("a.jpg")], image_url: url("b.jpg") });
  });
  it("clears image_url when every image is removed", () => {
    expect(imagesPatch([])).toEqual({ image_urls: [], image_url: null });
  });
  it("never saves more than four", () => {
    const five = ["1", "2", "3", "4", "5"].map((n) => url(`${n}.jpg`));
    expect(imagesPatch(five).image_urls).toHaveLength(MAX_PRODUCT_IMAGES);
    expect(imagesLeft(4)).toBe(0);
    expect(imagesLeft(1)).toBe(3);
  });
});

describe("imageFileProblem", () => {
  it("accepts an image under 5MB", () => {
    expect(imageFileProblem(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
  });
  it("refuses a file that is not an image", () => {
    expect(imageFileProblem(new File(["x"], "a.pdf", { type: "application/pdf" }))).toMatch(/not an image/);
  });
  it("refuses a file over 5MB", () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    expect(imageFileProblem(big)).toMatch(/over 5MB/);
  });
});

describe("ownStoragePath", () => {
  it("finds the path of the seller's own upload", () => {
    expect(ownStoragePath(url("1.jpg"), seller)).toBe(`${seller}/1.jpg`);
  });
  it("ignores other sellers' files and pictures from elsewhere", () => {
    expect(ownStoragePath(url("1.jpg"), "someone-else")).toBeNull();
    expect(ownStoragePath("https://cdn.example.com/x.jpg", seller)).toBeNull();
  });
});

describe("isProductInStock", () => {
  it("is false at zero stock", () => {
    expect(isProductInStock({ stock: 0 })).toBe(false);
    expect(isProductInStock({ stock: 2 })).toBe(true);
  });
});
