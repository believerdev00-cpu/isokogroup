import { CreditCard, Receipt } from "lucide-react";
import { EmptyState, QueryView, Section, StatCard, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { StudentEnrollmentPage, type StudentEnrollment } from "@/training/features/student/useStudent";
import { openApiFile } from "@/training/lib/api";
import { formatDate, formatMoney, humanize } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import { cn } from "@/lib/utils";

type Finance = {
  charges: { id: string; type: string; description: string; amount: number; created_at: string }[];
  adjustments: { id: number; kind: string; amount: number; created_at: string }[];
  payments: {
    id: string; amount: number; refunded_amount: number; method: string; reference: string; paid_on: string;
    voided_at: string | null; receipt_number: string;
  }[];
};

export default function StudentPayments() {
  return <StudentEnrollmentPage title="Payments">{(e, d) => <PaymentsView e={e} currency={d.currency} />}</StudentEnrollmentPage>;
}

function PaymentsView({ e, currency }: { e: StudentEnrollment; currency: string }) {
  const q = useApi<Finance>(`/student/enrollments/${e.id}/payments`);
  const f = e.finance;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total fees" value={formatMoney(f.total_fees, currency)} />
        <StatCard label="Paid" value={formatMoney(f.total_paid, currency)} />
        <StatCard label="Balance" value={formatMoney(Math.max(f.balance, 0), currency)} tone={f.balance > 0 ? "danger" : "primary"} />
        <StatCard label="Status" value={<StatusBadge status={f.payment_status} className="text-sm" />} />
      </div>
      {f.balance > 0 && (
        <p className="rounded-lg bg-gold-soft px-4 py-3 text-sm">
          Please pay the remaining <strong>{formatMoney(f.balance, currency)}</strong> at the training center office, by mobile money or bank transfer, and keep your receipt.
        </p>
      )}
      <QueryView query={q}>
        {(fin) => (
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Fees">
              {fin.charges.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fees recorded.</p>
              ) : (
                <ul className="divide-y">
                  {fin.charges.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                      <div>
                        <p className="font-medium">{c.description}</p>
                        <p className="text-xs text-muted-foreground">{humanize(c.type)}</p>
                      </div>
                      <span className="tabular whitespace-nowrap font-semibold">{formatMoney(c.amount, currency)}</span>
                    </li>
                  ))}
                  {fin.adjustments.map((a) => (
                    <li key={`adj-${a.id}`} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p className="font-medium">{humanize(a.kind)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                      </div>
                      <span className="tabular whitespace-nowrap font-semibold text-success">
                        {a.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(a.amount), currency)}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between py-2.5 text-sm font-bold">
                    <span>Total</span>
                    <span className="tabular">{formatMoney(f.total_fees, currency)}</span>
                  </li>
                </ul>
              )}
            </Section>
            <Section title="Payment history">
              {fin.payments.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payments yet" description="Payments recorded by the office will appear here with a receipt." />
              ) : (
                <ul className="divide-y">
                  {fin.payments.map((p) => {
                    const voided = !!p.voided_at;
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className={cn("min-w-0 text-sm", voided && "text-muted-foreground line-through")}>
                          <p className="tabular font-semibold">{formatMoney(p.amount, currency)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(p.paid_on)} · {p.method.toUpperCase()}{p.reference && ` · ${p.reference}`} · {p.receipt_number}
                            {p.refunded_amount > 0 && ` · ${formatMoney(p.refunded_amount, currency)} refunded`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {voided && <StatusBadge status="void" label="Voided" />}
                          <Button variant="outline" size="sm" onClick={() => openApiFile(`/student/payments/${p.id}/receipt`)}>
                            <Receipt className="mr-1.5 h-4 w-4" /> Receipt
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        )}
      </QueryView>
    </div>
  );
}
