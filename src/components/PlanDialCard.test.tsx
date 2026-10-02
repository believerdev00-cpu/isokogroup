import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PlanDialCard, { canDial } from "./PlanDialCard";

const CODE = "*182*8*1*871951#";
const setUA = (ua: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);

describe("PlanDialCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is one link that dials the Mobile Money code", () => {
    setUA("Mozilla/5.0 (Linux; Android 14) Mobile Safari");
    const onSelect = vi.fn();
    render(<PlanDialCard name="7-Day Full Access" price="50 RWF" duration="7 days" includes="Full access, no feature limitations" code={CODE} onSelect={onSelect} />);
    const card = screen.getByRole("link", { name: /7-Day Full Access, 50 RWF/ });
    expect(card.getAttribute("href")).toBe("tel:*182*8*1*871951%23");
    expect(card.textContent).toContain("Duration: 7 days");
    const e = fireEvent.click(card); // true when the browser would follow the link
    expect(e).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(canDial()).toBe(true);
  });

  it("on a computer explains what to dial instead of following the link", () => {
    setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    const onSelect = vi.fn();
    render(<PlanDialCard name="7-Day Full Access" price="50 RWF" duration="7 days" includes="Full access" code={CODE} onSelect={onSelect} />);
    expect(canDial()).toBe(false);
    const followed = fireEvent.click(screen.getByRole("link"));
    expect(followed).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("a plan that is not for this account cannot be tapped", () => {
    setUA("Mozilla/5.0 (Linux; Android 14) Mobile Safari");
    const onSelect = vi.fn();
    render(<PlanDialCard name="Seller Monthly" price="1,500 RWF" duration="1 month" includes="Everything" code={CODE} disabled onSelect={onSelect} />);
    const card = screen.getByRole("link");
    expect(card.getAttribute("aria-disabled")).toBe("true");
    expect(fireEvent.click(card)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
