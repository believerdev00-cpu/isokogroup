import { supabase } from "@/integrations/supabase/client";

/** The API refused the token because it has expired (not because of who the person is). */
export const isExpiredTokenError = (error: { message?: string } | null | undefined) =>
  /jwt expired/i.test(error?.message ?? "");

/**
 * Gets a new token when the API said the current one has expired, so the next
 * attempt can succeed. Other token errors (such as "JWT issued at future", which
 * comes from the server's side) are not helped by a new token: those are only
 * retried, and reported if they last.
 */
export async function refreshIfTokenExpired(error: { message?: string } | null | undefined) {
  if (!isExpiredTokenError(error)) return;
  try {
    await supabase.auth.refreshSession();
  } catch (e) {
    console.error("session refresh failed", e);
  }
}
