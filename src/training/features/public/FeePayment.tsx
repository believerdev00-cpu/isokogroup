// The registration fee of an application, paid from the phone (ItecPay) with the
// application's private payment link. Used after applying, on the payment page
// the link opens, and when checking an application's status.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Smartphone } from "lucide-react";
import { db, formatMoney } from "@/features/services/api";
import { MobileMoneyPay, useMobileMoneyAvailable } from "@/features/finance/MobileMoneyPay";
import { cn } from "@/lib/utils";

export type ApplicationFee = {
  reference: string;
  full_name: string;
  status: string;
  program: string;
  intake: string;
  currency: string;
  charged: number;
  paid: number;
  pending: number;
  balance: number;
  payable: boolean;
};

export function useApplicationFee(token: string | null | undefined) {
  return useQuery({
    queryKey: ["training-application-fee", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await db.rpc("training_application_payment", { p_token: token });
      if (error) throw new Error(error.message);
      return data as ApplicationFee;
    },
  });
}

export function FeePayment({ token, className, showHeading = true }: { token: string; className?: string; showHeading?: boolean }) {
  const qc = useQueryClient();
  const fee = useApplicationFee(token);
  const canPayByPhone = useMobileMoneyAvailable(fee.data?.currency ?? "RWF");
  const refresh = () => qc.invalidateQueries({ queryKey: ["training-application-fee", token] });

  if (fee.isLoading) {
    return <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}><Loader2 className="h-4 w-4 animate-spin" /> Loading the registration fee…</p>;
  }
  if (fee.error || !fee.data) {
    return <p className={cn("text-sm text-destructive", className)}>{fee.error instanceof Error ? fee.error.message : "This payment link isn't valid."}</p>;
  }
  const f = fee.data;
  if (f.charged <= 0) return null;

  return (
    <section className={cn("rounded-2xl border bg-card p-5 text-left shadow-sm sm:p-6", className)} aria-labelledby="fee-title">
      {showHeading && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="fee-title" className="text-lg font-bold">Registration fee</h3>
          <p className="text-2xl font-extrabold tabular">{formatMoney(f.charged, f.currency)}</p>
        </div>
      )}
      {f.paid >= f.charged ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Paid. Thank you! Your application will be reviewed.
        </p>
      ) : !f.payable ? (
        <p className="text-sm text-muted-foreground">This application has been {f.status.replace("_", " ")}, so the fee can't be paid online any more.</p>
      ) : canPayByPhone ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pay {formatMoney(f.balance, f.currency)} now from MTN MoMo, Airtel Money or SPENN. You'll approve it with your PIN on your phone.
          </p>
          <MobileMoneyPay
            target={{ entityTable: "training.applications", token }}
            amountDue={f.balance}
            currency={f.currency}
            onPaid={refresh}
          />
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-muted p-4 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Paying from your phone opens soon. Keep your application number: the Training Center will contact you about paying the fee.</span>
        </p>
      )}
      {f.pending > 0 && f.paid < f.charged && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Smartphone className="h-4 w-4" /> A payment is waiting for approval on your phone.</p>
      )}
    </section>
  );
}
