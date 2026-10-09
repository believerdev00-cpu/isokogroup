// A product's images: up to four (Seller Agreement, section 2), in order.
// `image_urls` holds them; `image_url` is always the first, because the
// marketplace, cart and admin pages were built around one image.
import { MAX_PRODUCT_IMAGES } from "@/lib/sellerAgreement";
import { isImagePath, isMediaFile } from "@/lib/mediaKind";
import { tooLargeMessage, uploadLimitMb } from "@/lib/uploadLimits";

export { MAX_PRODUCT_IMAGES };

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_IMAGE_SIZE = uploadLimitMb("product-images") * 1024 * 1024;

type ProductLike = { image_url?: string | null; image_urls?: string[] | null; stock?: number | null };

/** The images to show, in order: the list, or the single older image, or none. */
export const productImages = (p: ProductLike): string[] =>
  p.image_urls?.length ? p.image_urls.filter(Boolean) : p.image_url ? [p.image_url] : [];

/** Sold out when nothing is left in stock. */
export const isProductInStock = (p: ProductLike) => (p.stock ?? 0) > 0;

/**
 * The columns to save for a new media list.
 *
 * image_url is the cover: it is what the marketplace card, the cart and the
 * admin table show, and those are all <img>. A seller may now add a video, so
 * the cover is the first still rather than simply the first item -- otherwise
 * putting a clip first would leave a broken thumbnail everywhere.
 */
export const imagesPatch = (urls: string[]) => {
  const list = urls.filter(Boolean).slice(0, MAX_PRODUCT_IMAGES);
  return { image_urls: list, image_url: list.find(isImagePath) ?? list[0] ?? null };
};

/** Why a file can't be product media, or null when it can. */
export const imageFileProblem = (file: File): string | null => {
  if (!isMediaFile(file)) return `${file.name} is not a picture, a video or a sound.`;
  if (file.size > MAX_IMAGE_SIZE) return tooLargeMessage(file, uploadLimitMb("product-images"));
  return null;
};

/** How many more images fit before the limit. */
export const imagesLeft = (count: number) => Math.max(0, MAX_PRODUCT_IMAGES - count);

/** The storage path of an image this seller uploaded, or null for any other address. */
export const ownStoragePath = (url: string, sellerId: string): string | null => {
  const m = url.match(/\/storage\/v1\/object\/public\/product-images\/([^?#]+)$/);
  if (!m) return null;
  const path = decodeURIComponent(m[1]);
  return path.startsWith(`${sellerId}/`) ? path : null;
};

/** A new file name in the seller's folder: the time plus a counter keeps uploads apart. */
export const newImagePath = (sellerId: string, file: File, n: number) =>
  `${sellerId}/${Date.now()}-${n}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`;
