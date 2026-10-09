// An admin who opened /admin directly was thrown out to the customer dashboard.
// The hook asked once, before the client had a token, got nothing back because
// row-level security had nothing to go on, and recorded that as "not an admin"
// for good. What is held here is that an unanswerable question stays
// unanswered: the hook reports it is still loading rather than reporting "no".
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const auth = vi.hoisted(() => ({ value: { user: null as any, session: null as any, loading: false } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.value }));

const db = vi.hoisted(() => ({ result: { data: null as any, error: null as any }, calls: 0 }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => { db.calls++; return db.result; },
          }),
        }),
      }),
    }),
  },
}));

import { useIsAdmin } from "./use-is-admin";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const USER = { id: "11111111-1111-1111-1111-111111111111" };

beforeEach(() => { db.calls = 0; db.result = { data: null, error: null }; });

describe("knowing whether someone is an admin", () => {
  it("waits rather than answering while the session has no token yet", async () => {
    auth.value = { user: USER, session: null, loading: false };
    const { result } = renderHook(() => useIsAdmin(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    // and it has not asked, because there is nothing to ask with
    expect(db.calls).toBe(0);
  });

  it("says yes once there is a token and a row", async () => {
    auth.value = { user: USER, session: { access_token: "tok" }, loading: false };
    db.result = { data: { role: "admin" }, error: null };
    const { result } = renderHook(() => useIsAdmin(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("says no when there is genuinely no admin row", async () => {
    auth.value = { user: USER, session: { access_token: "tok" }, loading: false };
    db.result = { data: null, error: null };
    const { result } = renderHook(() => useIsAdmin(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("does not turn a failed lookup into a no", async () => {
    auth.value = { user: USER, session: { access_token: "tok" }, loading: false };
    db.result = { data: null, error: { message: "JWT expired" } };
    const { result } = renderHook(() => useIsAdmin(), { wrapper });
    // It asks again. The old hook asked once and recorded the failure as a "no",
    // so one call is the bug and more than one is the fix.
    await waitFor(() => expect(db.calls).toBeGreaterThan(1), { timeout: 8000 });
    expect(result.current.isAdmin).toBe(false);
  });

  it("settles immediately for someone who is signed out", () => {
    auth.value = { user: null, session: null, loading: false };
    const { result } = renderHook(() => useIsAdmin(), { wrapper });
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });
});
