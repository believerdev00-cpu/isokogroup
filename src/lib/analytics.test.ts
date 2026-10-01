import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Google tag loads only with a configured id AND the visitor's consent,
// and nothing is pushed to Google before that.
describe("analytics (Google tag with consent)", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.head.querySelectorAll("script[data-isoko-gtag]").forEach((s) => s.remove());
    delete (window as { dataLayer?: unknown[] }).dataLayer;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing without a tag id", async () => {
    vi.stubEnv("VITE_GOOGLE_TAG_ID", "");
    const a = await import("./analytics");
    expect(a.analyticsEnabled()).toBe(false);
    a.setConsent("granted");
    a.pageView("/x");
    expect(document.head.querySelector("script[data-isoko-gtag]")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("does not load the tag before consent", async () => {
    vi.stubEnv("VITE_GOOGLE_TAG_ID", "AW-TEST");
    const a = await import("./analytics");
    expect(a.analyticsEnabled()).toBe(true);
    a.pageView("/x");
    a.trackEvent("sign_up");
    expect(document.head.querySelector("script[data-isoko-gtag]")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("loads once consent is granted, with denied defaults updated to granted", async () => {
    vi.stubEnv("VITE_GOOGLE_TAG_ID", "AW-TEST");
    const a = await import("./analytics");
    a.setConsent("granted");
    expect(localStorage.getItem("isoko-consent")).toBe("granted");
    const script = document.head.querySelector("script[data-isoko-gtag]") as HTMLScriptElement;
    expect(script.src).toContain("googletagmanager.com/gtag/js?id=AW-TEST");
    const snapshot = () => (window.dataLayer ?? []).map((args) => Array.from(args as ArrayLike<unknown>));
    const calls = snapshot();
    expect(calls[0]).toEqual(["consent", "default", expect.objectContaining({ ad_storage: "denied", analytics_storage: "denied" })]);
    expect(calls[1]).toEqual(["consent", "update", expect.objectContaining({ ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" })]);
    expect(calls.some((c) => c[0] === "config" && c[1] === "AW-TEST")).toBe(true);
    a.pageView("/subscription");
    expect(snapshot().at(-1)).toEqual(["event", "page_view", expect.objectContaining({ page_path: "/subscription" })]);
    // a second grant does not add a second script
    a.setConsent("granted");
    expect(document.head.querySelectorAll("script[data-isoko-gtag]").length).toBe(1);
  });

  it("remembers a decline and sends nothing", async () => {
    vi.stubEnv("VITE_GOOGLE_TAG_ID", "AW-TEST");
    const a = await import("./analytics");
    a.setConsent("denied");
    expect(a.readConsent()).toBe("denied");
    expect(document.head.querySelector("script[data-isoko-gtag]")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });
});
