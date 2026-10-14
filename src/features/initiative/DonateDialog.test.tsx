// Getting from the amount to the payment step.
//
// Continue is disabled until there is a valid amount, which is right. What
// was wrong is that it said nothing about why: while there were four
// suggested amounts, one click filled the field and the button lit up at
// once, so nobody ever met it greyed out. Removing them made an empty field
// the first thing a donor sees, and a dead button that explains nothing
// reads as a broken page rather than a form waiting for an answer.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const useSupportableProjects = vi.hoisted(() => vi.fn());
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  useSupportableProjects,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", email: "donor@example.test" }, loading: false }) }));

// The field asks for dollars when a rate is known and francs when it is not,
// so the rate is the switch between the two and both are worth testing.
const useUsdRate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/usdRate", async (orig) => ({
  ...(await orig<typeof import("@/lib/usdRate")>()),
  useUsdRate,
}));
const RATE = 1450;
const withRate = () =>
  useUsdRate.mockReturnValue({ data: { rate: RATE, fetchedAt: new Date("2026-10-13T06:00:00Z"), minimumRwf: RATE } });
/** What the page falls back to when the provider has never answered. */
const withoutRate = () => useUsdRate.mockReturnValue({ data: undefined });

const { default: DonateDialog } = await import("./DonateDialog");
const { MIN_DONATION_RWF, DONOR_NOTE_MAX } = await import("@/lib/initiative");

const open = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}><DonateDialog open onOpenChange={() => {}} /></QueryClientProvider></MemoryRouter>,
  );
};
const amountBox = () => screen.getByLabelText(/any amount you wish/i);
const continueButton = () => screen.getByRole("button", { name: /continue/i });

describe("choosing what to give", () => {
  beforeEach(() => {
    useSupportableProjects.mockReturnValue({ isLoading: false, isError: false, data: [] });
    withoutRate();
  });

  it("offers no suggested amounts", () => {
    open();
    for (const preset of ["1,000", "5,000", "10,000", "25,000"]) {
      expect(screen.queryByRole("button", { name: preset })).not.toBeInTheDocument();
    }
  });

  it("says why Continue cannot be pressed yet, instead of looking broken", () => {
    open();
    expect(continueButton()).toBeDisabled();
    expect(screen.getByText(/enter how much you would like to give/i)).toBeInTheDocument();
  });

  it("explains an amount that is too small", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: "5" } });
    expect(continueButton()).toBeDisabled();
    expect(screen.getByText(/smallest contribution/i)).toBeInTheDocument();
  });

  it("lets a dollar's worth through and moves to the payment step", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: "1300" } });
    expect(continueButton()).toBeEnabled();
    expect(screen.queryByText(/enter how much you would like to give/i)).not.toBeInTheDocument();
    fireEvent.click(continueButton());
    expect(screen.getByLabelText(/transaction reference/i)).toBeInTheDocument();
  });

  it("accepts exactly the minimum", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: String(MIN_DONATION_RWF) } });
    expect(continueButton()).toBeEnabled();
  });

  it("asks for the donor's message on the same screen as the amount, with a counter", () => {
    open();
    const box = screen.getByLabelText(/your message to the isoko global initiative/i);
    expect(screen.getByText(`0/${DONOR_NOTE_MAX}`)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "Please support farming." } });
    expect(screen.getByText(`23/${DONOR_NOTE_MAX}`)).toBeInTheDocument();
  });

  it("promises the Premium month before the amount is chosen, not after", () => {
    open();
    expect(screen.getByText(/every confirmed donation earns a month of premium access/i)).toBeInTheDocument();
  });

  it("says the message stays private", () => {
    open();
    expect(screen.getByText(/never published on the website/i)).toBeInTheDocument();
  });
});

// The campaign is called "$1 One Project", so the field asks for dollars and
// works out the francs. The francs are what Mobile Money takes, what the
// payment instructions have to say, and what is recorded -- so the conversion
// is the part worth pinning down.
describe("giving in dollars", () => {
  beforeEach(() => {
    useSupportableProjects.mockReturnValue({ isLoading: false, isError: false, data: [] });
    withRate();
  });

  it("asks for dollars, and says what a dollar costs today", () => {
    open();
    expect(screen.getByLabelText(/in whole US dollars/i)).toBeInTheDocument();
    expect(screen.getByText(/Minimum:/)).toHaveTextContent(`US$1, which is ${RATE.toLocaleString()} RWF`);
  });

  it("takes one dollar -- the whole point of the campaign", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: "1" } });
    expect(continueButton()).toBeEnabled();
  });

  it("refuses less than a dollar, in dollars", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: "0" } });
    expect(continueButton()).toBeDisabled();
    expect(screen.getByText("The smallest contribution is US$1.")).toBeInTheDocument();
  });

  it("shows the francs the donor will actually send", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: "5" } });
    expect(screen.getByText(/You will send/)).toHaveTextContent(`${(5 * RATE).toLocaleString()} RWF`);
  });

  it("carries the francs, not the dollars, to the payment step", () => {
    open();
    fireEvent.change(amountBox(), { target: { value: "2" } });
    fireEvent.click(continueButton());
    // 2 dollars is 2,900 francs: what the instructions must say, and what is
    // recorded. "2" reaching the database would be rejected by its own
    // minimum, and a donor told to send 2 francs would be nonsense.
    expect(screen.getByRole("button", { name: /Record my contribution of 2,900 RWF/i })).toBeInTheDocument();
  });

  it("rounds a fractional conversion up, never under the minimum", () => {
    // A rate with a fraction is the normal case, and the database refuses
    // anything below ceil(rate): rounding down would refuse the donation at
    // the last step.
    useUsdRate.mockReturnValue({ data: { rate: 1450.4, fetchedAt: new Date("2026-10-13T06:00:00Z"), minimumRwf: 1451 } });
    open();
    fireEvent.change(amountBox(), { target: { value: "1" } });
    fireEvent.click(continueButton());
    expect(screen.getByRole("button", { name: /Record my contribution of 1,451 RWF/i })).toBeInTheDocument();
  });
});
