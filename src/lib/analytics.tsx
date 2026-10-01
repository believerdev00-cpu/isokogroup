import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Google tag (Google Ads remarketing and, if the same tag is linked to it,
// Google Analytics), loaded only when two things are true:
//   1. VITE_GOOGLE_TAG_ID is set at build time (the "G-…" or "AW-…" id from
//      Google Ads > Tools > Google tag). Without it nothing is loaded and
//      nothing is sent: there is no tag to send to.
//   2. The visitor accepted it in the consent bar (ConsentBanner). Until then
//      the tag is not even downloaded; the choice is kept in this browser.
// Consent Mode v2 defaults are "denied" and are updated to "granted" before
// the tag loads, so Google records the choice too. No account data, email or
// phone is ever sent: audiences are built by Google from the visited pages.
// docs/GOOGLE_ADS.md explains the Google Ads side.

export const TAG_ID = ((import.meta.env.VITE_GOOGLE_TAG_ID as string | undefined) ?? "").trim() || null;

export type Consent = "granted" | "denied";
const CONSENT_KEY = "isoko-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** True when a Google tag id is configured for this build. */
export const analyticsEnabled = () => TAG_ID !== null;

/** The visitor's stored choice, or null when they haven't chosen yet. */
export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer ?? [];
  // Google's snippet pushes the arguments object itself, not an array
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

const CONSENT_TYPES = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"] as const;
const consentState = (value: Consent) => Object.fromEntries(CONSENT_TYPES.map((k) => [k, value]));

let loaded = false;

/** Loads the Google tag once (only after consent). */
export function loadTag() {
  if (!TAG_ID || loaded || typeof document === "undefined") return;
  loaded = true;
  gtag("consent", "default", { ...consentState("denied"), wait_for_update: 500 });
  gtag("consent", "update", consentState("granted"));
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(TAG_ID)}`;
  script.setAttribute("data-isoko-gtag", "");
  document.head.appendChild(script);
  gtag("js", new Date());
  // the page view is sent by <Analytics /> on each route change instead
  gtag("config", TAG_ID, { send_page_view: false, anonymize_ip: true });
}

export const tagLoaded = () => loaded;

/** Records the visitor's choice; "granted" loads the tag right away. */
export function setConsent(choice: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // private mode: the bar shows again next time, nothing else changes
  }
  if (choice === "granted") loadTag();
  else if (loaded) gtag("consent", "update", consentState("denied"));
}

/** A page view for the current route (no-op until the tag is loaded). */
export function pageView(path: string) {
  if (!loaded) return;
  gtag("event", "page_view", { page_path: path, page_location: window.location.href, page_title: document.title });
}

/**
 * A conversion-style event, e.g. "sign_up" or "subscription_payment_reported".
 * Only the event name and these parameters go to Google; never the person.
 */
export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}) {
  if (!loaded) return;
  gtag("event", name, params);
}

/** Loads the tag when consent was given earlier, and sends a page view per route. */
export function Analytics() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (readConsent() === "granted") loadTag();
  }, []);
  useEffect(() => {
    pageView(`${pathname}${search}`);
  }, [pathname, search]);
  return null;
}

/** For tests: forget that the tag was loaded. */
export function _resetForTests() {
  loaded = false;
}
