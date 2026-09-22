import { useState } from "react";
import { FileText, Plus, Receipt } from "lucide-react";
import { ConfirmDialog, Field, NativeSelect, QueryView, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, openApiFile } from "@/training/lib/api";
import { formatDate, formatMoney, humanize } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import { FINANCE_KEYS, useCurrency } from "@/training/features/admin-ops/lookups";
import RecordPaymentDialog, { type EnrollmentFinanceData } from "./RecordPaymentDialog";

/** Fees, payments and balance for one enrollment, with the actions staff need. */
export default function EnrollmentFinance({ enrollmentId }: { enrollmentId: string }) {
  const currency = useCurrency();
  const q = useApi<EnrollmentFinanceData>(`/admin/enrollments/${enrollmentId}/finance`);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [fee, setFee] = useState({ type: "other", description: "", amount: "" });

  const voidPayment = useApiMutation((v: { id: string; reason: string }) => api.post(`/admin/payments/${v.id}/void`, { reason: v.reason }), {
    invalidate: FINANCE_KEYS,
    success: "Payment voided",
    onSuccess: () => setVoiding(null),
  });
  const addFee = useApiMutation(
    () => api.post(`/admin/enrollments/${enrollmentId}/charges`, { type: fee.type, description: fee.description, amount: Number(fee.amount) }),
    {
      invalidate: FINANCE_KEYS,
      success: "Fee added",
      onSuccess: () => {
        setAdding(false);
        setFee({ type: "other", description: "", amount: "" });
      },
    },
  );

  return (
    <QueryView query={q}>
      {(f) => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total fees</p>
              <p className="tabular text-lg font-bold">{formatMoney(f.total_fees, currency)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="tabular text-lg font-bold text-success">{formatMoney(f.total_paid, currency)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Balance</p>
                <StatusBadge status={f.payment_status} />
              </div>
              <p className="tabular text-lg font-bold">{formatMoney(Math.max(f.balance, 0), currency)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPaying(true)} disabled={f.balance <= 0}>
              <Receipt className="h-4 w-4" /> Record payment
            </Button>
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add fee
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Fees</h3>
            {f.charges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fees recorded.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {f.charges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>
                      {c.description} <span className="text-xs text-muted-foreground">· {humanize(c.type)}</span>
                    </span>
                    <span className="tabular font-medium">{formatMoney(c.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Payments</h3>
            {f.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {f.payments.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className={p.voided_at ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                        <span className="tabular">{formatMoney(p.amount, currency)}</span> · {humanize(p.method)}
                        {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.receipt_number} · {formatDate(p.paid_on)}
                        {p.voided_at && ` · Voided: ${p.void_reason ?? ""}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {p.voided_at && <StatusBadge status="void" label="Voided" />}
                      <Button size="sm" variant="outline" onClick={() => openApiFile(`/admin/payments/${p.id}/receipt`)}>
                        <FileText className="h-4 w-4" /> Receipt
                      </Button>
                      {!p.voided_at && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setVoiding(p.id)}>
                          Void
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <RecordPaymentDialog enrollmentId={enrollmentId} open={paying} onOpenChange={setPaying} />
          <ConfirmDialog
            open={voiding !== null}
            onOpenChange={(o) => !o && setVoiding(null)}
            title="Void this payment?"
            description="The payment stays on record, marked void, and no longer counts toward what the student has paid."
            confirmLabel="Void payment"
            destructive
            noteLabel="Reason"
            noteRequired
            pending={voidPayment.isPending}
            onConfirm={(reason) => voiding && voidPayment.mutate({ id: voiding, reason })}
          />
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add a fee</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Field label="Type" htmlFor="fee-type">
                  <NativeSelect id="fee-type" value={fee.type} onChange={(e) => setFee({ ...fee, type: e.target.value })}>
                    <option value="other">Other approved fee</option>
                    <option value="tuition">Tuition</option>
                    <option value="registration">Registration</option>
                  </NativeSelect>
                </Field>
                <Field label="Description" htmlFor="fee-desc" required hint="e.g. Exam re-sit fee, Materials">
                  <Input id="fee-desc" value={fee.description} onChange={(e) => setFee({ ...fee, description: e.target.value })} />
                </Field>
                <Field label={`Amount (${currency})`} htmlFor="fee-amount" required>
                  <Input id="fee-amount" type="number" min={0} value={fee.amount} onChange={(e) => setFee({ ...fee, amount: e.target.value })} />
                </Field>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={fee.description.trim().length < 2 || !(Number(fee.amount) > 0) || addFee.isPending}
                  onClick={() => addFee.mutate()}
                >
                  Add fee
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </QueryView>
  );
}
