import { useState } from "react";
import { CreditCard, FileText, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmDialog, EmptyState, NativeSelect, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, openApiFile } from "@/training/lib/api";
import { formatDate, formatMoney, humanize } from "@/training/lib/format";
import { useApi, useApiMutation, withQuery } from "@/training/lib/query";
import type { PaymentStatus } from "@/training/lib/types";
import { FINANCE_KEYS, useCurrency, useIntakes, usePrograms } from "@/training/features/admin-ops/lookups";
import RecordPaymentDialog from "@/training/features/finance/RecordPaymentDialog";

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  reference: string;
  paid_on: string;
  voided_at: string | null;
  void_reason: string | null;
  receipt_number: string;
  student_id: string;
  student_number: string;
  full_name: string;
  program_name: string;
  intake_name: string;
  recorded_by_name: string | null;
};

type StudentRow = {
  student_id: string;
  student_number: string;
  full_name: string;
  enrollment_id: string;
  status: string;
  program_name: string;
  intake_name: string;
  balance: number;
  payment_status: PaymentStatus;
};

/** Search a student, then pick which of their enrollments the payment is for. */
function PickEnrollment({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (id: string) => void }) {
  const currency = useCurrency();
  const [q, setQ] = useState("");
  const search = useApi<StudentRow[]>(open && q.trim().length >= 2 ? withQuery("/admin/students", { q: q.trim() }) : null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQ("");
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Find the student by name, student number or phone.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input autoFocus className="pl-9" placeholder="e.g. Aline or ISK-2027-00125" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search student" />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Type at least 2 characters.</p>
          ) : search.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : (search.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No student found.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {search.data!.map((s) => (
                <li key={s.enrollment_id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted"
                    onClick={() => onPick(s.enrollment_id)}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{s.full_name} <span className="text-xs text-muted-foreground">· {s.student_number}</span></span>
                      <span className="block truncate text-xs text-muted-foreground">{s.program_name} · {s.intake_name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block text-sm font-semibold">{formatMoney(Math.max(s.balance, 0), currency)}</span>
                      <StatusBadge status={s.payment_status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Payments() {
  const currency = useCurrency();
  const intakes = useIntakes();
  const programs = usePrograms();
  const [f, setF] = useState({ from: "", to: "", intake_id: "", program_id: "", q: "", include_void: false });
  const q = useApi<{ items: PaymentRow[]; total: number }>(
    withQuery("/admin/payments", { ...f, include_void: f.include_void ? "1" : "" }),
  );
  const [picking, setPicking] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const voidPayment = useApiMutation((v: { id: string; reason: string }) => api.post(`/admin/payments/${v.id}/void`, { reason: v.reason }), {
    invalidate: FINANCE_KEYS,
    success: "Payment voided",
    onSuccess: () => setVoiding(null),
  });
  const filtered = Object.entries(f).some(([k, v]) => k !== "include_void" && v);

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Every payment gets a numbered receipt. Mistakes are voided with a reason, never deleted."
        actions={<Button onClick={() => setPicking(true)}><Plus className="h-4 w-4" /> Record payment</Button>}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input className="lg:col-span-2" placeholder="Student, receipt or reference" aria-label="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <NativeSelect aria-label="Intake" value={f.intake_id} onChange={(e) => setF({ ...f, intake_id: e.target.value })}>
          <option value="">All intakes</option>
          {intakes.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Program" value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
          <option value="">All programs</option>
          {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <Input type="date" aria-label="From date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input type="date" aria-label="To date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Checkbox id="include-void" checked={f.include_void} onCheckedChange={(v) => setF({ ...f, include_void: v === true })} />
        <Label htmlFor="include-void" className="text-sm font-normal">Show voided payments</Label>
      </div>
      <QueryView query={q}>
        {(data) => (
          <>
            <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Collected {filtered ? "(matching the filters)" : "(all time)"}</p>
              <p className="tabular text-2xl font-bold text-primary">{formatMoney(data.total, currency)}</p>
              <p className="text-xs text-muted-foreground">{data.items.filter((p) => !p.voided_at).length} payments</p>
            </div>
            {data.items.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title={filtered ? "No payments match these filters" : "No payments recorded yet"}
                description={filtered ? "Try a wider date range or another intake." : "When a student pays, record it here to issue their receipt."}
                action={!filtered && <Button onClick={() => setPicking(true)}>Record payment</Button>}
              />
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((p) => (
                        <TableRow key={p.id} className={p.voided_at ? "opacity-60" : ""}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {p.receipt_number}
                            {p.voided_at && <StatusBadge status="void" label="Voided" className="ml-2" />}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(p.paid_on)}</TableCell>
                          <TableCell>
                            <Link to={`/training-center/admin/students/${p.student_id}`} className="font-medium hover:text-primary hover:underline">{p.full_name}</Link>
                            <p className="text-xs text-muted-foreground">{p.student_number}</p>
                          </TableCell>
                          <TableCell>
                            <p>{p.program_name}</p>
                            <p className="text-xs text-muted-foreground">{p.intake_name}</p>
                          </TableCell>
                          <TableCell>
                            {humanize(p.method)}
                            {p.reference && <p className="text-xs text-muted-foreground">{p.reference}</p>}
                          </TableCell>
                          <TableCell className={`tabular whitespace-nowrap text-right font-semibold ${p.voided_at ? "line-through" : ""}`}>
                            {formatMoney(p.amount, currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => openApiFile(`/admin/payments/${p.id}/receipt`)}>
                                <FileText className="h-4 w-4" /> Receipt
                              </Button>
                              {!p.voided_at && (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setVoiding(p)}>Void</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </div>
            )}
          </>
        )}
      </QueryView>

      <PickEnrollment
        open={picking}
        onOpenChange={setPicking}
        onPick={(id) => {
          setPicking(false);
          setEnrollmentId(id);
        }}
      />
      {enrollmentId && (
        <RecordPaymentDialog enrollmentId={enrollmentId} open onOpenChange={(o) => !o && setEnrollmentId(null)} onDone={() => setEnrollmentId(null)} />
      )}
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
        title={`Void receipt ${voiding?.receipt_number ?? ""}?`}
        description="The payment stays on record, marked void, and no longer counts toward the student's payments."
        confirmLabel="Void payment"
        destructive
        noteLabel="Reason"
        noteRequired
        pending={voidPayment.isPending}
        onConfirm={(reason) => voiding && voidPayment.mutate({ id: voiding.id, reason })}
      />
    </div>
  );
}
