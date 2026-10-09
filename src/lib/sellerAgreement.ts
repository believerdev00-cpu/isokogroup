// The ISOKO Seller Registration and Compliance Agreement (company document,
// 2026-10-01), shown at /seller-agreement and accepted when a seller applies.
//
// The version is sent with every seller application and the database only
// accepts the current one (seller_agreement_version() in
// 20261001100000_seller_agreement.sql). When the text changes, bump both.
export const SELLER_AGREEMENT_VERSION = "2026-10-01";

export const MAX_PRODUCT_IMAGES = 4;

export type AgreementSection = { title: string; paragraphs: string[]; bullets?: string[]; after?: string[] };

export const SELLER_AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: "1. Seller Registration",
    paragraphs: ["The Seller must provide accurate and complete information about:"],
    bullets: [
      "Full Name",
      "Telephone Number",
      "Email Address",
      "Country",
      "Business Name",
      "TIN (Tax Identification Number)",
      "Business Address / Location",
      "Bank / Mobile Money Payment Details",
    ],
    after: ["ISOKO may verify the information provided before approving the Seller account."],
  },
  {
    title: "2. Product Registration",
    paragraphs: ["For each product, the Seller must provide:"],
    bullets: [
      "Product Name",
      "Additional Information About the Product",
      "Price",
      "Available Stock",
      `Product Image(s) — Maximum ${MAX_PRODUCT_IMAGES} Images`,
    ],
    after: [
      "The Seller must ensure that the product information, price, stock, and images are accurate and represent the actual product being offered.",
      "The Seller can edit and update the available stock whenever the quantity changes.",
      `The Seller must not upload more than ${MAX_PRODUCT_IMAGES} images for one product.`,
    ],
  },
  {
    title: "3. Selling Through ISOKO",
    paragraphs: [
      "Products registered by the Seller are made available to customers through the ISOKO platform.",
      "Customers purchase products through ISOKO and do not need to deal directly with the Seller.",
      "ISOKO or an authorized ISOKO agent is responsible for coordinating the product with the customer according to ISOKO's applicable order and delivery process.",
      "The Seller agrees to provide accurate product information and make the registered products available when they are ordered.",
    ],
  },
  {
    title: "4. Product Sales and Seller Payouts",
    paragraphs: [
      "When a Seller's product is sold through the ISOKO platform, the sale is recorded by ISOKO.",
      "The Seller may request a payout for products that have been successfully sold through the platform, subject to ISOKO's applicable payout procedures.",
      "The Seller must provide accurate bank or Mobile Money payment details so that ISOKO can process approved payouts.",
      "Payment details provided by the Seller are private and will not be visible to customers.",
      "ISOKO will use the verified payment information provided by the Seller to make approved payouts.",
    ],
  },
  {
    title: "5. Prices and Stock",
    paragraphs: [
      "The Seller is responsible for keeping product prices and available stock accurate.",
      "The Seller can edit and update the stock whenever the quantity changes.",
      "If a product is no longer available, the Seller must update the stock or otherwise notify ISOKO.",
    ],
  },
  {
    title: "6. EBM and Business Compliance",
    paragraphs: [
      "The Seller is responsible for complying with applicable business, tax, EBM, invoicing, and other legal requirements relating to their business and products.",
      "Where EBM invoicing is required, the Seller must comply with the applicable requirements.",
    ],
  },
  {
    title: "7. Payment Information",
    paragraphs: ["The Seller must provide correct:"],
    bullets: ["Bank / Mobile Money Provider", "Account / Mobile Money Number", "Account Holder Name"],
    after: [
      "These details are private seller information.",
      "They will not be displayed to customers and will be used by ISOKO for seller verification and approved payouts.",
      "The Seller must update ISOKO if their payment information changes.",
    ],
  },
  {
    title: "8. Genuine Seller and Products",
    paragraphs: [
      "The Seller confirms that they are a genuine seller or authorized representative and have the right to sell the products registered on ISOKO.",
      "The Seller must provide genuine products and accurate product information.",
      "The Seller must not provide false or misleading information.",
    ],
  },
  {
    title: "9. Information Updates",
    paragraphs: ["The Seller must keep their information, products, prices, and stock up to date.", "Any changes to the Seller's:"],
    bullets: ["Name", "Country", "Business", "TIN", "Address", "Products", "Prices", "Stock", "Payment details"],
    after: ["must be updated with ISOKO."],
  },
  {
    title: "10. Verification and Account Action",
    paragraphs: [
      "ISOKO may verify the Seller's information and products.",
      "If a Seller provides false information, lists unauthorized products, repeatedly fails to make products available, or violates ISOKO requirements, ISOKO may review, restrict, suspend, or terminate the Seller account.",
    ],
  },
];

export const SELLER_DECLARATION = [
  "The information I provide is true and accurate.",
  "I am a genuine seller or authorized representative.",
  "I have the right to sell the products I register.",
  "My product information, prices, stock, and images are accurate.",
  `I will upload a maximum of ${MAX_PRODUCT_IMAGES} images for each product.`,
  "I will keep my available stock updated.",
  "I understand that customers purchase through ISOKO.",
  "I understand that ISOKO or an ISOKO agent handles the customer-facing product delivery process.",
  "I understand that when my product is sold, I can request a payout through ISOKO.",
  "I understand that my bank or Mobile Money details are private and will be used by ISOKO to process approved payouts.",
  "My TIN and payment information are correct.",
  "I will comply with applicable laws and ISOKO requirements.",
  "I will update my information whenever it changes.",
  "I understand that ISOKO may verify my information.",
];

export const AGREEMENT_CHECKBOX_LABEL = "I have read, understood, and agree to the ISOKO Seller Registration and Compliance Agreement.";

// The payment providers sellers in Rwanda use most; "Other" lets them type one
export const PAYMENT_PROVIDERS = ["MTN Mobile Money", "Airtel Money", "Bank of Kigali", "Equity Bank", "I&M Bank", "Other bank"];

// Every country, not just the neighbours: ISOKO GROUPS sells worldwide.
export { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
