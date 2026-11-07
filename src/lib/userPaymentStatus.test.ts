import { describe, expect, it } from "vitest";
import { currentPaymentByUser, type UserPayment } from "./userPaymentStatus";

const pay = (user_id: string | null, status: UserPayment["status"], submitted_at: string): UserPayment => ({
  user_id, customer_email: null, status, submitted_at,
});

describe("where a registered user stands", () => {
  it("uses their most recent payment", () => {
    const map = currentPaymentByUser([pay("a", "rejected", "2026-01-01"), pay("a", "confirmed", "2026-02-01")]);
    expect(map.get("a")?.status).toBe("confirmed");
  });

  it("gives the order of the list no say", () => {
    const map = currentPaymentByUser([pay("a", "confirmed", "2026-02-01"), pay("a", "rejected", "2026-01-01")]);
    expect(map.get("a")?.status).toBe("confirmed");
  });

  it("puts a waiting payment first, even when an older one was confirmed later in the list", () => {
    const map = currentPaymentByUser([pay("a", "pending", "2026-01-01"), pay("a", "confirmed", "2026-02-01")]);
    expect(map.get("a")?.status).toBe("pending");
    const reversed = currentPaymentByUser([pay("a", "confirmed", "2026-02-01"), pay("a", "pending", "2026-01-01")]);
    expect(reversed.get("a")?.status).toBe("pending");
  });

  it("keeps people apart, and leaves out anyone with no payment", () => {
    const map = currentPaymentByUser([pay("a", "confirmed", "2026-01-01"), pay("b", "rejected", "2026-01-01"), pay(null, "pending", "2026-01-01")]);
    expect(map.get("a")?.status).toBe("confirmed");
    expect(map.get("b")?.status).toBe("rejected");
    expect(map.get("c")).toBeUndefined();
    expect(map.size).toBe(2);
  });
});
