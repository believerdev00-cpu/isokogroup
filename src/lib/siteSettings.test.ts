import { describe, expect, it } from "vitest";
import { localPhone, telHref, ussdHref } from "./siteSettings";

describe("contact and payment links", () => {
  it("makes a tel: link from a local or international number", () => {
    expect(telHref("0788 481 648")).toBe("tel:+250788481648");
    expect(telHref("+250 790 176 547")).toBe("tel:+250790176547");
  });

  it("shows a Rwandan number the local way", () => {
    expect(localPhone("250788481648")).toBe("0788 481 648");
    expect(localPhone("971500000000")).toBe("+971500000000");
  });

  it("makes a dialer link from the Mobile Money code, with # encoded", () => {
    expect(ussdHref("*182*8*1*871951#")).toBe("tel:*182*8*1*871951%23");
    expect(ussdHref(" *182*8*1*871951# ")).toBe("tel:*182*8*1*871951%23");
    // a plain number (a merchant line) stays a normal phone link
    expect(ussdHref("0788 481 648")).toBe("tel:+250788481648");
  });
});
