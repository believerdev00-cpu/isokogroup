import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Is the person signed in an admin?
 *
 * This used to ask once, in an effect, and treat any failure as "no". Two
 * things made that wrong. The auth provider settles `user` from whichever of
 * onAuthStateChange and getSession answers first, so there is a moment where a
 * user exists but the client has no token attached yet; a query sent in that
 * moment is unauthenticated, row-level security returns nothing, and the answer
 * came back "not an admin". And because the effect never ran again, that answer
 * stuck for the rest of the page's life -- which is why an admin who opened
 * /admin directly, or simply refreshed it, was bounced to the customer
 * dashboard while the same account worked fine after browsing there.
 *
 * So: do not ask until there is a token to ask with, and treat an error as "ask
 * again", not as "no". `loading` stays true through both, so a caller that
 * redirects on !isAdmin waits for a real answer instead of racing one.
 */
export const useIsAdmin = () => {
  const { user, session, loading: authLoading } = useAuth();
  const token = session?.access_token;

  const { data, isPending } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user && !!token,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      // Thrown, not swallowed: a failed question is not a "no".
      if (error) throw error;
      return !!data;
    },
  });

  return {
    isAdmin: data === true,
    // Signed out is a settled answer. Signed in without a token yet, or still
    // asking, is not.
    loading: authLoading || (!!user && (!token || isPending)),
  };
};
