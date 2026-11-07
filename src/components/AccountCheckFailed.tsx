import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

/**
 * We could not find out what this account may do (the check failed; the answer
 * was not "no"). Saying so is what keeps an admin from being sent away, or a
 * paying customer from being shown the prices, because of a passing fault. It
 * grants nothing: the database still decides every request.
 */
const AccountCheckFailed = ({ onRetry }: { onRetry: () => unknown }) => {
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-12 sm:py-20">
        <div className="container max-w-md text-center" role="alert">
          <AlertTriangle className="mx-auto h-12 w-12 text-warning" aria-hidden />
          <h1 className="mt-4 text-2xl font-display font-bold">We couldn't check your account</h1>
          <p className="mt-2 text-muted-foreground">
            This is a problem on our side, not with your account or your subscription. Please try again in a moment.
          </p>
          <Button className="mt-6" onClick={retry} disabled={retrying}>
            {retrying ? "Checking..." : "Try again"}
          </Button>
        </div>
      </section>
    </div>
  );
};

export default AccountCheckFailed;
