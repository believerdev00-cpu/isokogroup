import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import SubscriptionRequired from "@/components/SubscriptionRequired";
import { TrialBanner } from "@/components/TrialCountdown";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading, reason } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // The free trial or the month ran out (checked live): the page locks
  if (!isActive && reason) return <SubscriptionRequired reason={reason} />;

  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
};

export default ProtectedRoute;
