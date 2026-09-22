import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, openApiFile } from "@/training/lib/api";
import { formatMoney } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import { FINANCE_KEYS, useCurrency } from "@/training/features/admin-ops/lookups";

export type EnrollmentFinanceData = {
  id: string;
  full_name: string;
  student_number: string;
  program_name: string;
  intake_name: string;
  total_fees: number;
  total_paid: number;
  balance: number;
  payment_status: "paid" | "partially_paid" | "outstanding";
  charges: { id: string; type: string; description: string; amount: number; created_at: string }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference: string;
    paid_on: string;
    notes: string;
    receipt_number: string;
    voided_at: string | null;
    void_reason: string | null;
  }[];
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Props = { enrollmentId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void };

export default function RecordPaymentDialog({ enrollmentId, open, onOpenChange, onDone }: Props) {
  const currency = useCurrency();
  const fin = useApi<EnrollmentFinanceData>(open ? `/admin/enrollments/${enrollmentId}/finance` : null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("momo");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && fin.data) setAmount(fin.data.balance > 0 ? String(fin.data.balance) : "");
  }, [open, fin.data]);

  useEffect(() => {
    if (!open) {
      setReference("");
      setNotes("");
      setMethod("momo");
      setPaidOn(todayLocal());
    }
  }, [open]);

  const save = useApiMutation(
    () =>
      api.post<{ id: string; receipt_number: string; balance: number }>("/admin/payments", {
        enrollment_id: enrollmentId,
        amount: Number(amount),
        method,
        reference,
        paid_on: paidOn,
        notes,
      }),
    {
      invalidate: FINANCE_KEYS,
      onSuccess: (p) => {
        toast.success(`Payment recorded — receipt ${p.receipt_number}`, {
          action: { label: "Open receipt", onClick: () => openApiFile(`/admin/payments/${p.id}/receipt`) },
          duration: 10000,
        });
        onOpenChange(false);
        onDone?.();
      },
    },
  );

  const balance = fin.data?.balance ?? 0;
  const n = Number(amount);
  const tooMuch = fin.data !== undefined && n > balance + 0.001;
  const valid = n > 0 && !tooMuch && paidOn <= todayLocal();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {fin.data
              ? `${fin.data.full_name} (${fin.data.student_number}) · ${fin.data.program_name}, ${fin.data.intake_name}`
              : "Loading student…"}
          </DialogDescription>
        </DialogHeader>
        {fin.data && (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Fees</p>
              <p className="tabular font-semibold">{formatMoney(fin.data.total_fees, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="tabular font-semibold">{formatMoney(fin.data.total_paid, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="tabular font-semibold text-destructive">{formatMoney(Math.max(balance, 0), currency)}</p>
            </div>
          </div>
        )}
        {fin.data && balance <= 0 ? (
          <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success">
            This student has paid everything they owe. Add a fee first if they are paying for something else.
          </p>
        ) : (
          <form id="record-payment" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount received (${currency})`} htmlFor="pay-amount" required error={tooMuch ? "More than the balance" : null}>
              <Input id="pay-amount" type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Method" htmlFor="pay-method" required>
              <NativeSelect id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="momo">Mobile money</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </NativeSelect>
            </Field>
            <Field label="Reference / transaction ID" htmlFor="pay-ref" hint="MoMo or bank transaction number, if any">
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Payment date" htmlFor="pay-date" required error={paidOn > todayLocal() ? "Can't be in the future" : null}>
              <Input id="pay-date" type="date" max={todayLocal()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
              <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </form>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!(fin.data && balance <= 0) && (
            <Button type="submit" form="record-payment" disabled={!valid || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record payment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
