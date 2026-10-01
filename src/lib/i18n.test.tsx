// The language switch really changes the words on the page, remembers the
// choice, and no language shows a raw key or a broken {placeholder}.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { I18nProvider, LANGS, LANG_STORAGE_KEY, translate, translations, useI18n, type Lang } from "./i18n";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  it("every key has English", () => {
    for (const [key, byLang] of Object.entries(translations)) {
      expect(byLang.en, key).toBeTruthy();
    }
  });

  it("no translation keeps a different set of {placeholders} than the English", () => {
    for (const [key, byLang] of Object.entries(translations)) {
      const en = placeholders(byLang.en!);
      for (const lang of LANGS) {
        const text = byLang[lang];
        if (text) expect(placeholders(text), `${key} (${lang})`).toEqual(en);
      }
    }
  });

  it("the keys other parts of the site rely on exist in all five languages", () => {
    const required = ["nav.register", "nav.signIn", "nav.language", "nav.theme", "ent.film", "ent.genre", "ent.movies", "ent.tvSeries",
      "hub.title", "hub.ask", "hub.request", "hub.status.submitted", "sub.status.trial", "sub.until", "access.accountRequired", "access.register"];
    for (const key of required) {
      for (const lang of LANGS) expect(translations[key]?.[lang], `${key} (${lang})`).toBeTruthy();
    }
  });

  it("fills {placeholders} and leaves unknown ones visible for the test to catch", () => {
    expect(translate("en", "sub.until", { date: "1 May" })).toBe("Until 1 May");
    expect(translate("fr", "auth.resendIn", { s: 12 })).toBe("Renvoyer le lien dans 12 s");
    expect(translate("en", "sub.left", {})).toBe("{time} left");
  });

  it("falls back to English, then to the key", () => {
    expect(translate("zh", "nav.home")).toBe("首页");
    expect(translate("rw", "no.such.key")).toBe("no.such.key");
  });
});

function Probe() {
  const { lang, setLang, t } = useI18n();
  return (
    <div>
      <p data-testid="home">{t("nav.home")}</p>
      <p data-testid="lang">{lang}</p>
      {LANGS.map((l) => (
        <button key={l} onClick={() => setLang(l)}>{`to-${l}`}</button>
      ))}
    </div>
  );
}

describe("I18nProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("switching en → fr → sw → en changes the words and remembers the choice", () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId("home").textContent).toBe("Home");
    const go = (l: Lang) => act(() => screen.getByText(`to-${l}`).click());
    go("fr");
    expect(screen.getByTestId("home").textContent).toBe("Accueil");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    go("sw");
    expect(screen.getByTestId("home").textContent).toBe("Nyumbani");
    go("en");
    expect(screen.getByTestId("home").textContent).toBe("Home");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");
  });

  it("starts in the language saved last time", () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, "zh");
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("zh");
    expect(screen.getByTestId("home").textContent).toBe("首页");
  });

  it("ignores a saved value that isn't a language", () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, "xx");
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });
});
