// The animation budget for this device. "Lite" motion keeps quick feedback
// (hover, press, fades) but switches off decorative, continuous animation when:
// the visitor asked for reduced motion, the browser is saving data, or the
// device is low-end (little memory or few CPU cores).

type NavigatorHints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

let lite: boolean | null = null;

export function isLiteMotion(): boolean {
  if (lite !== null) return lite;
  if (typeof window === "undefined") return true;
  const nav = navigator as NavigatorHints;
  lite =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    nav.connection?.saveData === true ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) ||
    (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2);
  return lite;
}

/** Marks <html> so CSS can drop heavy animation (see "motion-lite" in index.css). */
export function initMotion() {
  document.documentElement.classList.toggle("motion-lite", isLiteMotion());
}

/** Shared timing so every animation on the platform feels the same. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const DURATION = { fast: 0.18, base: 0.32, slow: 0.6 } as const;
