import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { refreshSession } } }));

import { refreshIfTokenExpired } from "./authRecovery";

beforeEach(() => refreshSession.mockClear());

describe("recovering from a refused token", () => {
  it("gets a new token when the old one expired", async () => {
    await refreshIfTokenExpired({ message: "JWT expired" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone for other errors, which a new token wouldn't fix", async () => {
    await refreshIfTokenExpired({ message: "JWT issued at future" });
    await refreshIfTokenExpired({ message: "permission denied" });
    await refreshIfTokenExpired(null);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not throw when the refresh fails", async () => {
    refreshSession.mockRejectedValueOnce(new Error("network"));
    await expect(refreshIfTokenExpired({ message: "JWT expired" })).resolves.toBeUndefined();
  });
});
