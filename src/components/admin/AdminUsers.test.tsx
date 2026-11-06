// The user management page: what needs the admin first, anyone easy to find, and
// email confirmation (Supabase Auth's email_confirmed_at) kept apart from payments.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const db = vi.hoisted(() => ({ accounts: { data: [] as any[], error: null as any }, payments: { data: [] as any[], error: null as any } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async (name: string) => (name === "admin_user_confirmations" ? db.accounts : db.payments) },
}));
vi.mock("@/components/admin/SubscriptionPaymentsAdmin", () => ({
  default: ({ waitingApplications }: { waitingApplications: unknown[] }) => <div>PAYMENTS PANEL, {waitingApplications.length} applications</div>,
}));

import AdminUsers from "./AdminUsers";

const account = (id: string, confirmed: boolean, extra: object = {}) => ({
  user_id: id, full_name: `Name ${id}`, email: `${id}@test.local`, account_type: "buyer", is_admin: false,
  email_confirmed_at: confirmed ? "2026-11-01T10:00:00Z" : null, registered_at: "2026-11-01T09:00:00Z", ...extra,
});
const profile = (id: string, role = "buyer", extra: object = {}) => ({
  id: `p-${id}`, user_id: id, full_name: `Name ${id}`, role, business_name: null, phone: null, created_at: "2026-11-01T09:00:00Z", ...extra,
});
const open = async (name: RegExp) => {
  fireEvent.mouseDown(await screen.findByRole("tab", { name }), { button: 0 });
};

beforeEach(() => {
  db.accounts = { data: [], error: null };
  db.payments = { data: [], error: null };
});

describe("User management", () => {
  it("opens on what needs a decision, with the waiting applications", async () => {
    const application = { id: "s1", user_id: "a", full_name: "Name a", business_name: "Shop", email: "a@test.local", status: "pending", created_at: "2026-11-01T09:00:00Z" };
    db.accounts.data = [account("a", true), account("b", true)];
    render(<AdminUsers profiles={[profile("a"), profile("b")]} title="Users" sellerApplications={[application, { ...application, id: "s2", user_id: "b", status: "rejected" }]} />);
    expect(await screen.findByText("PAYMENTS PANEL, 1 applications")).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Needs your decision (1)" })).toBeInTheDocument();
  });

  it("lists exactly the unconfirmed accounts, each once, with the right count", async () => {
    db.accounts.data = [account("a", false), account("b", true), account("c", false, { account_type: "seller" })];
    render(<AdminUsers profiles={[profile("a"), profile("b"), profile("c")]} title="Users" />);
    await open(/Email not confirmed \(2\)/);
    expect(await screen.findByText("Waiting for Confirmation (2)")).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("a@test.local")).toBeInTheDocument();
    expect(table.getByText("c@test.local")).toBeInTheDocument();
    expect(table.queryByText("b@test.local")).toBeNull();
    expect(table.getByText("Seller")).toBeInTheDocument();
    expect(table.getByText("Buyer")).toBeInTheDocument();
  });

  it("removes someone once they confirm, on refresh", async () => {
    db.accounts.data = [account("a", false)];
    render(<AdminUsers profiles={[profile("a")]} title="Users" />);
    await open(/Email not confirmed \(1\)/);
    expect(await screen.findByText("Waiting for Confirmation (1)")).toBeInTheDocument();
    db.accounts.data = [account("a", true)];
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findByText("Waiting for Confirmation (0)")).toBeInTheDocument();
    expect(screen.getByText("Everyone has confirmed their email.")).toBeInTheDocument();
  });

  it("does not mix up email confirmation and a confirmed payment", async () => {
    db.accounts.data = [account("a", false)];
    db.payments.data = [{ user_id: "a", customer_email: "a@test.local", status: "confirmed", submitted_at: "2026-11-01" }];
    render(<AdminUsers profiles={[profile("a")]} title="Users" />);
    await open(/All users/);
    const row = within(await screen.findByRole("row", { name: /a@test.local/ }));
    expect(await row.findByText("Waiting for confirmation")).toBeInTheDocument();
    expect(row.getByText("Confirmed")).toBeInTheDocument();
  });

  it("marks the administrator as admin, not by their profile's buyer label", async () => {
    db.accounts.data = [account("a", true, { is_admin: true })];
    render(<AdminUsers profiles={[profile("a")]} title="Users" />);
    await open(/All users/);
    const row = within(await screen.findByRole("row", { name: /a@test.local/ }));
    expect(row.getByText("Admin")).toBeInTheDocument();
    expect(row.queryByText("Buyer")).toBeNull();
  });

  it("finds people by search and by filter, and can clear them", async () => {
    db.accounts.data = [account("a", true), account("b", false), account("c", true)];
    render(<AdminUsers profiles={[profile("a", "buyer", { phone: "0788" }), profile("b", "seller", { business_name: "Chicken farm" }), profile("c")]} title="Users" />);
    await open(/All users/);
    expect(await screen.findByText("Showing 1-3 of 3")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "chicken" } });
    expect(screen.getByText("Showing 1-1 of 1")).toBeInTheDocument();
    expect(screen.getByText("b@test.local")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "waiting" } });
    expect(screen.getByText("Showing 1-1 of 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByLabelText("User type"), { target: { value: "seller" } });
    expect(screen.getByText("b@test.local")).toBeInTheDocument();
    expect(screen.queryByText("a@test.local")).toBeNull();
  });

  it("splits a long list into pages", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    db.accounts.data = ids.map((id) => account(id, true));
    render(<AdminUsers profiles={ids.map((id) => profile(id))} title="Users" />);
    await open(/All users \(30\)/);
    expect(await screen.findByText("Showing 1-25 of 30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 26-30 of 30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("the tiles lead to the list they count", async () => {
    db.accounts.data = [account("a", true), account("b", true)];
    render(<AdminUsers profiles={[profile("a", "seller"), profile("b")]} title="Users" />);
    fireEvent.click(await screen.findByRole("button", { name: /^Sellers/ }));
    expect(await screen.findByText("Showing 1-1 of 1")).toBeInTheDocument();
    expect(screen.getByText("a@test.local")).toBeInTheDocument();
  });

  it("says when it could not load, instead of claiming everyone confirmed", async () => {
    db.accounts = { data: null as any, error: { message: "Only administrators can see this" } };
    render(<AdminUsers profiles={[profile("a")]} title="Users" />);
    await open(/Email not confirmed/);
    expect(await screen.findByText(/Couldn't load who has confirmed/)).toBeInTheDocument();
    expect(screen.queryByText("Everyone has confirmed their email.")).toBeNull();
  });
});
