import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import SubscriptionRequired from "@/components/SubscriptionRequired";
import { TrialBanner } from "@/components/TrialCountdown";

/**
 * A signed-in page. By default it also needs access (trial or paid period):
 * without it the subscription wall shows. `requireAccess={false}` is for the
 * person's own account pages (the dashboard), which stay open after the trial
 * or subscription ends so they can see their status and renew; the database
 * refuses the member services regardless.
 */
const ProtectedRoute = ({ children, requireAccess = true }: { children: ReactNode; requireAccess?: boolean }) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { isActive, loading: subLoading, reason } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  // Remember where they were going, so signing in brings them back there
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  // The free trial or the month ran out (checked live): the page locks
  if (requireAccess && !isActive && reason) return <SubscriptionRequired reason={reason} />;

  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
};

export default ProtectedRoute;
