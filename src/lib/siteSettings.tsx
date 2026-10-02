import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The company's details that admins edit in Admin > Settings (platform_settings,
// read through site_settings()): contacts, payment accounts, social links and
// the marketplace commission. The defaults are what the site showed before the
// settings existed, so pages render at once and stay right if the database
// can't be reached.

export type SocialNetwork = "youtube" | "instagram" | "tiktok" | "facebook" | "x" | "linkedin" | "whatsapp" | "other";
export type SocialLink = { network: SocialNetwork; label: string; url: string };

export type SiteSettings = {
  companyName: string;
  email: string;
  phones: string[];
  address: string;
  /** what Google Maps searches for */
  mapQuery: string;
  /** international format, no "+" (wa.me links) */
  whatsappOffice: string;
  whatsappIct: string;
  momo: { code: string; label: string; name: string };
  bank: { name: string; accountNumber: string; accountName: string; swift: string };
  social: SocialLink[];
  /** e.g. 7 for 7% */
  commissionPercent: number;
  /** the seller subscription, per month (RWF): normal access plus the seller dashboard */
  sellerMonthlyPrice: number;
};

export const SITE_DEFAULTS: SiteSettings = {
  companyName: "ISOKO GROUPS COMPANY LTD",
  email: "isokogrou93@gmail.com",
  phones: ["0788 481 648", "0793 736 574", "0790 176 547"],
  address: "Kimironko, KG 15 Ave (around the market), Kigali",
  mapQuery: "Kimironko Market, KG 15 Ave, Kigali",
  whatsappOffice: "250788481648",
  whatsappIct: "250790176547",
  momo: { code: "*182*8*1*871951#", label: "Mobile Money (MTN MoMo)", name: "ISOKO GROUPS COMPANY LTD" },
  bank: { name: "BANK OF KIGALI", accountNumber: "100139730547", accountName: "ISOKO GROUPS COMPANY LTD", swift: "" },
  social: [
    { network: "youtube", label: "ISOKO ENTERTAINMENT", url: "https://youtu.be/KjN65T1qA7c?si=8RPTzXJNhZI1b3Bs" },
    { network: "youtube", label: "Isoko Group", url: "https://youtube.com/shorts/2zXVi01BI9s?si=ly0LXTSTdbTkWYJk" },
    { network: "youtube", label: "Isoko Studioz", url: "https://youtube.com/shorts/SRKsJk6D8aY?si=uhQ0Xgu3dqUvsZ6h" },
    { network: "instagram", label: "Star Wax", url: "https://www.instagram.com/p/DXv9vurjI45/?igsh=dTg1OTk0ODlpZGNp" },
    { network: "instagram", label: "Isoko Studioz", url: "https://www.instagram.com/p/DU0vkdpDete/?igsh=MWp2cHVkYzVxdTZlaw==" },
    { network: "instagram", label: "Isoko Group Logistics", url: "https://www.instagram.com/reel/DWvjvOkCE8p/?igsh=MTQwNmd5eWZ2c2FkZA==" },
    { network: "instagram", label: "Isoko Group Ltd", url: "https://www.instagram.com/isokogrou?igsh=bXM1OHpndno0Y3Bv" },
    { network: "tiktok", label: "Isoko Group Ltd", url: "https://vt.tiktok.com/ZS9a6kw2e/" },
    { network: "tiktok", label: "Isoko Studioz", url: "https://vt.tiktok.com/ZS9aMNuVe/" },
    { network: "tiktok", label: "Isoko Movie", url: "https://vt.tiktok.com/ZS9aMx5rj/" },
  ],
  commissionPercent: 7,
  sellerMonthlyPrice: 1500,
};

export const SOCIAL_NETWORKS: { key: SocialNetwork; name: string }[] = [
  { key: "youtube", name: "YouTube" }, { key: "instagram", name: "Instagram" }, { key: "tiktok", name: "TikTok" },
  { key: "facebook", name: "Facebook" }, { key: "x", name: "X (Twitter)" }, { key: "linkedin", name: "LinkedIn" },
  { key: "whatsapp", name: "WhatsApp" }, { key: "other", name: "Other" },
];

type Raw = Record<string, unknown>;
const text = (raw: Raw, key: string, fallback: string) => (typeof raw[key] === "string" && raw[key] !== "" ? (raw[key] as string) : fallback);

export function fromRaw(raw: Raw): SiteSettings {
  const d = SITE_DEFAULTS;
  const commission = Number(raw.marketplace_commission_percent);
  const sellerPrice = Number(raw.seller_monthly_price);
  return {
    companyName: text(raw, "company_name", d.companyName),
    email: text(raw, "company_email", d.email),
    phones: Array.isArray(raw.company_phones) ? (raw.company_phones as string[]) : d.phones,
    address: text(raw, "company_address", d.address),
    mapQuery: text(raw, "company_map_query", d.mapQuery),
    whatsappOffice: text(raw, "whatsapp_office", d.whatsappOffice),
    whatsappIct: text(raw, "whatsapp_ict", d.whatsappIct),
    momo: {
      code: text(raw, "company_momo_code", d.momo.code),
      label: text(raw, "momo_label", d.momo.label),
      name: text(raw, "momo_account_name", d.momo.name),
    },
    bank: {
      name: text(raw, "bank_name", d.bank.name),
      accountNumber: text(raw, "bank_account_number", d.bank.accountNumber),
      accountName: text(raw, "bank_account_name", d.bank.accountName),
      swift: typeof raw.bank_swift === "string" ? raw.bank_swift : d.bank.swift,
    },
    social: Array.isArray(raw.social_links) ? (raw.social_links as SocialLink[]) : d.social,
    commissionPercent: Number.isFinite(commission) ? commission : d.commissionPercent,
    sellerMonthlyPrice: Number.isFinite(sellerPrice) && sellerPrice > 0 ? sellerPrice : d.sellerMonthlyPrice,
  };
}

// For code outside React (links built in helpers): the latest loaded values
let current: SiteSettings = SITE_DEFAULTS;
export const siteSettingsNow = () => current;

const SiteSettingsContext = createContext<SiteSettings>(SITE_DEFAULTS);

export const SITE_SETTINGS_KEY = ["site_settings"];

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: SITE_SETTINGS_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("site_settings");
      if (error) throw error;
      return fromRaw((data ?? {}) as Raw);
    },
    staleTime: 5 * 60 * 1000,
  });
  const value = data ?? SITE_DEFAULTS;
  current = value;
  useEffect(() => {
    current = value;
  }, [value]);
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export const useSiteSettings = () => useContext(SiteSettingsContext);

/** "0790 176 547" from "250790176547" (a Rwandan number shown the local way) */
export const localPhone = (international: string) =>
  international.startsWith("250") && international.length === 12
    ? `0${international.slice(3, 6)} ${international.slice(6, 9)} ${international.slice(9)}`
    : `+${international}`;

/** tel: link for a number written the local way ("0788 481 648") or with + */
export const telHref = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits.startsWith("0") ? `+250${digits.slice(1)}` : digits}`;
};

/**
 * Dialer link for the company Mobile Money code ("*182*8*1*871951#"): tapping
 * it opens the phone app with the code filled in, as the phone numbers in the
 * footer do. "#" must be written %23 in a link. A plain number is a tel: link.
 * (iPhones refuse to dial codes with * and # from a link; the pages offer a
 * Copy button next to it for them.)
 */
export const ussdHref = (code: string) => {
  const value = code.trim();
  if (!/[*#]/.test(value)) return telHref(value);
  return `tel:${value.replace(/[^\d*#+]/g, "").replace(/#/g, "%23")}`;
};

export const mapEmbedUrl = (query: string) => `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
export const mapLinkUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
