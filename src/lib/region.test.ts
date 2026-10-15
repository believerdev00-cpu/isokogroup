// Suggesting a country without asking a geolocation service, and without
// mistaking a language for a country.
//
// The case that matters is the Rwandan seller whose browser is in English: a
// locale of "en" must suggest nothing at all rather than the United States,
// because being quoted in dollars in Kigali is worse than being asked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { countryFromLocale, countryFromTimeZone, guessRegion, regionExplanation } from "./region";

const withTimeZone = (timeZone: string | undefined) =>
  vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
    resolvedOptions: () => ({ timeZone }),
  } as unknown as Intl.DateTimeFormat);

const withLanguage = (language: string) =>
  vi.spyOn(navigator, "language", "get").mockReturnValue(language);

describe("reading a time zone", () => {
  it("knows the zones of the countries we quote a currency for", () => {
    expect(countryFromTimeZone("Africa/Kigali")).toBe("RW");
    expect(countryFromTimeZone("Africa/Nairobi")).toBe("KE");
    expect(countryFromTimeZone("Africa/Kampala")).toBe("UG");
    expect(countryFromTimeZone("Africa/Dar_es_Salaam")).toBe("TZ");
    expect(countryFromTimeZone("Africa/Bujumbura")).toBe("BI");
    expect(countryFromTimeZone("Europe/Paris")).toBe("FR");
    expect(countryFromTimeZone("America/New_York")).toBe("US");
  });

  it("says nothing about a zone it does not carry", () => {
    // Better than a map that is subtly wrong: the form asks instead.
    expect(countryFromTimeZone("Asia/Tokyo")).toBeNull();
    expect(countryFromTimeZone("UTC")).toBeNull();
    expect(countryFromTimeZone(undefined)).toBeNull();
    expect(countryFromTimeZone("")).toBeNull();
  });
});

describe("reading a locale", () => {
  it("takes the region subtag when there is one", () => {
    expect(countryFromLocale("sw-KE")).toBe("KE");
    expect(countryFromLocale("en-GB")).toBe("GB");
    expect(countryFromLocale("rw-RW")).toBe("RW");
    expect(countryFromLocale("zh-Hans-CN")).toBe("CN");
    expect(countryFromLocale("en-US-POSIX")).toBe("US");
  });

  it("refuses to read a country out of a language", () => {
    // This is the whole point. "en" is not a country.
    for (const tag of ["en", "fr", "sw", "rw", "", "   "]) {
      expect(countryFromLocale(tag)).toBeNull();
    }
  });

  it("ignores a region code that names a group of countries", () => {
    // "es-419" is Latin America, not a country, and has no one currency.
    expect(countryFromLocale("es-419")).toBeNull();
  });
});

describe("which signal wins", () => {
  afterEach(() => vi.restoreAllMocks());

  it("takes what the seller told us over anything the browser says", () => {
    withTimeZone("America/New_York");
    withLanguage("en-US");
    expect(guessRegion("KE")).toEqual({ country: "KE", how: "profile" });
  });

  it("falls back to the time zone, which is not a language", () => {
    withTimeZone("Africa/Kigali");
    withLanguage("en-US");
    // A Rwandan with an English browser: the zone is right and the locale is
    // not, so the zone is asked first.
    expect(guessRegion(null)).toEqual({ country: "RW", how: "timezone" });
  });

  it("uses the locale's region only when the zone says nothing", () => {
    withTimeZone("Asia/Tokyo");
    withLanguage("sw-KE");
    expect(guessRegion(null)).toEqual({ country: "KE", how: "locale" });
  });

  it("gives up rather than guessing, and the form then asks", () => {
    withTimeZone("Asia/Tokyo");
    withLanguage("en");
    expect(guessRegion(null)).toEqual({ country: null, how: "unknown" });
  });

  it("ignores a profile country that is not a code", () => {
    withTimeZone("Africa/Nairobi");
    expect(guessRegion("Kenya")).toEqual({ country: "KE", how: "timezone" });
    expect(guessRegion("")).toEqual({ country: "KE", how: "timezone" });
  });

  it("explains itself in words the form can print", () => {
    expect(regionExplanation("profile")).toMatch(/profile/);
    expect(regionExplanation("timezone")).toMatch(/time zone/);
    expect(regionExplanation("locale")).toMatch(/region setting/);
    // Nothing to explain when nothing was guessed.
    expect(regionExplanation("unknown")).toBe("");
  });
});
