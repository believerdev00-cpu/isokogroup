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
