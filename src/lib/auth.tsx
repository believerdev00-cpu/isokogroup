import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any; alreadyRegistered: boolean }>;
  resendConfirmation: (email: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: any }>;
  updatePassword: (password: string) => Promise<{ error: any }>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A reset link lands on the Site URL when /reset-password isn't in Auth's redirect
      // list; the recovery session is already stored, so send them to choose a password.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        window.location.replace("/reset-password");
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    // With email confirmation on, an address that already has an account gets no
    // error, just a placeholder user with no identities (and no email is sent).
    const alreadyRegistered = !error && data.user?.identities?.length === 0;
    return { error, alreadyRegistered };
  };

  const resendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  /** Sets the new password, then ends every other session (e.g. one someone else holds). */
  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) await supabase.auth.signOut({ scope: "others" });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, resendConfirmation, signIn, signOut, requestPasswordReset, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
