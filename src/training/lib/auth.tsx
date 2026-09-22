import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth as useIsokoAuth } from "@/lib/auth";
import { api, ApiError } from "@/training/lib/api";

export type Role = "admin" | "trainer" | "student";

export type Me = {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  phone: string | null;
  must_change_password: boolean;
  student_id: string | null;
  student_number: string | null;
  trainer_id: string | null;
};

type AuthContextValue = {
  /** The Training Center role of the signed-in Isoko account, if it has one */
  user: Me | null;
  /** Email of the signed-in Isoko account (also when it has no Training Center role) */
  accountEmail: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where each role lands after signing in. */
export const HOME_FOR: Record<Role, string> = {
  admin: "/training-center/admin",
  trainer: "/training-center/trainer",
  student: "/training-center/student",
};

// Signing in is Isoko's own account (Supabase Auth). The API says which Training
// Center role that account has; the role shown here only decides which screens
// to render, and the server checks it again on every request.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading } = useIsokoAuth();
  const [user, setUser] = useState<Me | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const accountId = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<Me | null>("/auth/me"));
    } catch {
      setUser(null);
    }
  }, []);

  // Reload the role whenever a different account signs in or out
  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    (accountId ? api.get<Me | null>("/auth/me").catch(() => null) : Promise.resolve(null)).then((me) => {
      if (cancelled) return;
      queryClient.clear();
      setUser(me);
      setLoadedFor(accountId);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, sessionLoading, queryClient]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new ApiError(error.message === "Invalid login credentials" ? "Incorrect email or password" : error.message, 401);
    const me = await api.get<Me | null>("/auth/me");
    if (!me) throw new ApiError("You're signed in to Isoko, but this account has no Training Center access yet.", 403, "no_role");
    queryClient.clear();
    setUser(me);
    return me;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    setUser(null);
  };

  const changePassword = async (current: string, next: string) => {
    setUser(await api.post<Me>("/auth/change-password", { current_password: current, new_password: next }));
  };

  const loading = sessionLoading || loadedFor !== accountId;

  return (
    <AuthContext.Provider
      value={{ user: loading ? null : user, accountEmail: session?.user.email ?? null, loading, signIn, signOut, changePassword, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside the Training Center AuthProvider");
  return ctx;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");
