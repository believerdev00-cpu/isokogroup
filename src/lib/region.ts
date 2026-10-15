/**
 * Which country to suggest, without asking anybody where they are.
 *
 * A currency has to be suggested from something, and the usual something is
 * the visitor's IP address through a geolocation service -- which means
 * telling a third party that this person is on this page, for a guess that is
 * wrong behind every VPN and every corporate proxy. Nothing here leaves the
 * browser.
 *
 * In order of how much it is worth trusting:
 *
 *   1. The country on the seller's own profile. They typed it. It is not a
 *      guess at all, which is why it wins.
 *   2. The time zone the device is set to. "Africa/Kigali" is a statement
 *      about where the machine thinks it is, and it is not derived from
 *      language settings.
 *   3. The region subtag of the browser's locale -- the "KE" in "sw-KE", not
 *      the "sw". A language is not a country: English is spoken in Kigali and
 *      in Kansas, and a Rwandan running an English-language browser must not
 *      be quoted in dollars because of it. So a locale with no region subtag
 *      ("en", "fr") yields nothing rather than a default.
 *
 * When all three come up empty the answer is "ask them", and the form does.
 */

export type RegionSource = "profile" | "timezone" | "locale" | "unknown";

export type RegionGuess = {
  /** ISO 3166-1 alpha-2, or null when nothing here is worth guessing from. */
  country: string | null;
  how: RegionSource;
};

/**
 * Time zones for the countries ISOKO quotes a currency for, plus the ones
 * common enough among visitors to be worth naming. Deliberately short: a zone
 * that is not here falls through to the locale and then to the question,
 * which is a better outcome than a map that is subtly wrong.
 */
const ZONE_COUNTRY: Record<string, string> = {
  "Africa/Kigali": "RW",
  "Africa/Nairobi": "KE",
  "Africa/Kampala": "UG",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Bujumbura": "BI",
  // Both Congos keep Kinshasa/Lubumbashi; neither is a currency we quote, but
  // naming them stops a Kinshasa seller being guessed as Rwandan by locale.
  "Africa/Kinshasa": "CD",
  "Africa/Lubumbashi": "CD",
  "Europe/Vienna": "AT", "Europe/Brussels": "BE", "Europe/Zagreb": "HR",
  "Asia/Nicosia": "CY", "Europe/Tallinn": "EE", "Europe/Helsinki": "FI",
  "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Athens": "GR",
  "Europe/Dublin": "IE", "Europe/Rome": "IT", "Europe/Riga": "LV",
  "Europe/Vilnius": "LT", "Europe/Luxembourg": "LU", "Europe/Malta": "MT",
  "Europe/Amsterdam": "NL", "Europe/Lisbon": "PT", "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI", "Europe/Madrid": "ES",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Guayaquil": "EC", "America/El_Salvador": "SV", "America/Panama": "PA",
};

/** The country a time zone names, or null for one this list does not cover. */
export const countryFromTimeZone = (zone: string | undefined | null): string | null =>
  (zone && ZONE_COUNTRY[zone]) || null;

/**
 * The region subtag of a locale, if it has one.
 *
 * "sw-KE" gives KE. "en" gives null, and that is the important case: a
 * language on its own is not evidence about a country.
 */
export function countryFromLocale(locale: string | undefined | null): string | null {
  const tag = String(locale ?? "").trim();
  if (!tag) return null;
  // The region subtag is two letters in the second position: language-REGION,
  // or language-Script-REGION. A three-digit UN M.49 code ("419") is a group
  // of countries, not a country, so it is not used.
  const match = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?-([A-Z]{2})(?:-|$)/.exec(tag);
  return match ? match[1] : null;
}

/** What the browser itself says, with no network call and no fingerprinting. */
export function guessRegion(profileCountryCode?: string | null): RegionGuess {
  const fromProfile = String(profileCountryCode ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(fromProfile)) return { country: fromProfile, how: "profile" };

  const zone = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : undefined;
  const fromZone = countryFromTimeZone(zone);
  if (fromZone) return { country: fromZone, how: "timezone" };

  const locale = typeof navigator !== "undefined"
    ? navigator.language
    : undefined;
  const fromLocale = countryFromLocale(locale);
  if (fromLocale) return { country: fromLocale, how: "locale" };

  return { country: null, how: "unknown" };
}

/** How the suggestion is explained on the form, so it can be disagreed with. */
export const regionExplanation = (how: RegionSource): string =>
  how === "profile" ? "from the country on your profile"
  : how === "timezone" ? "from your device's time zone"
  : how === "locale" ? "from your browser's region setting"
  : "";
