import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Pill } from "@/features/staff/common";
import { errorText, formatDate, formatMoney, PAYMENT_METHOD_LABEL, rpc, type PaymentMethod } from "@/features/services/api";
import {
  accountKey, newIdempotencyKey, PAYMENT_STATUS_LABEL, useAccountSummary,
  type BillableTable, type FinancePayment, type Submission,
} from "./api";

type Action =
  | { kind: "reject"; submission: Submission }
  | { kind: "verify"; submission: Submission }
  | { kind: "refund"; payment: FinancePayment }
  | { kind: "void"; payment: FinancePayment }
  | { kind: "adjust" };

const REVERSED: FinancePayment["status"][] = ["refunded", "partially_refunded", "voided"];

/**
 * Payments of one billable record: what is owed, reports from the customer to
 * check, money received. Staff confirm or reject reports and record payments;
 * finance staff and admins also refund, void and adjust. The database checks
 * every amount and permission; this panel only offers the actions.
 */
export function PaymentsPanel({ entityTable, entityId, onChange }: { entityTable: BillableTable; entityId: string; onChange?: () => void }) {
  const qc = useQueryClient();
  const q = useAccountSummary(entityTable, entityId);
  const [recording, setRecording] = useState<string | null>(null); // idempotency key of the open form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("momo");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjustKind, setAdjustKind] = useState<"discount" | "waiver" | "adjustment">("discount");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: accountKey(entityTable, entityId) });
    qc.invalidateQueries({ queryKey: ["finance_pending"] });
    onChange?.();
  };
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setAction(null);
      setActionAmount("");
      setReason("");
      refresh();
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <Panel title="Payments"><p className="text-sm text-muted-foreground">Loading…</p></Panel>;
  if (q.isError) return <Panel title="Payments"><p className="text-sm text-destructive">{errorText(q.error)}</p></Panel>;
  const s = q.data!;
  const currency = s.currency ?? "USD";
  const money = (n: number) => formatMoney(n, currency);
  const t = s.totals;
  const pending = s.submissions.filter((x) => x.status === "pending");
  const decided = s.submissions.filter((x) => x.status === "rejected");

  const startAction = (a: Action) => {
    setAction(a);
    setReason("");
    setActionAmount(
      a.kind === "verify" ? String(a.submission.amount)
        : a.kind === "refund" ? String(Number(a.payment.amount) - Number(a.payment.refunded_amount))
        : "",
    );
  };

  const submitAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!action) return;
    if (action.kind === "verify") {
      run(() => rpc("finance_verify_submission", { p_submission_id: action.submission.id, p_amount: Number(actionAmount), p_note: reason || null }), "Payment confirmed");
    } else if (action.kind === "reject") {
      run(() => rpc("finance_reject_submission", { p_submission_id: action.submission.id, p_reason: reason }), "Payment report rejected");
    } else if (action.kind === "refund") {
      run(() => rpc("finance_refund_payment", { p_payment_id: action.payment.id, p_amount: Number(actionAmount), p_reason: reason, p_idempotency_key: newIdempotencyKey() }), "Refund recorded");
    } else if (action.kind === "void") {
      run(() => rpc("finance_void_payment", { p_payment_id: action.payment.id, p_reason: reason }), "Payment voided");
    } else {
      run(() => rpc("finance_adjust", { p_entity_table: entityTable, p_entity_id: entityId, p_kind: adjustKind, p_amount: Number(actionAmount), p_reason: reason }), "Saved");
    }
  };

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () => rpc("finance_record_payment", {
        p_entity_table: entityTable, p_entity_id: entityId, p_amount: Number(amount), p_method: method,
        p_reference: ref.trim(), p_note: note.trim() || null, p_idempotency_key: recording,
      }),
      "Payment recorded",
    );
    if (ok) {
      setRecording(null);
      setAmount("");
      setRef("");
      setNote("");
    }
  };

  const actionForm = (forId: string) =>
    action && ((action.kind === "verify" || action.kind === "reject") ? action.submission.id : action.kind === "adjust" ? "adjust" : action.payment.id) === forId && (
      <form onSubmit={submitAction} className="mt-2 grid w-full gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[10rem_1fr_auto_auto]">
        {action.kind === "adjust" && (
          <select aria-label="Kind" className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-4" value={adjustKind} onChange={(e) => setAdjustKind(e.target.value as typeof adjustKind)}>
            <option value="discount">Discount (owes less)</option>
            <option value="waiver">Waiver (owes less)</option>
            <option value="adjustment">Correction (+ owes more, − owes less)</option>
          </select>
        )}
        {action.kind !== "reject" && action.kind !== "void" ? (
          <Input
            type="number" step="any" required aria-label={action.kind === "verify" ? "Amount that arrived" : "Amount"}
            min={action.kind === "adjust" && adjustKind === "adjustment" ? undefined : "0.01"}
            placeholder={`Amount (${currency})`} value={actionAmount} onChange={(e) => setActionAmount(e.target.value)}
          />
        ) : <span className="hidden sm:block" />}
        <Input
          placeholder={action.kind === "verify" ? "Note (optional)" : "Reason (required)"} aria-label="Reason"
          required={action.kind !== "verify"} minLength={action.kind === "verify" ? undefined : 3} maxLength={1000}
          value={reason} onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {{ verify: "Confirm", reject: "Reject", refund: "Refund", void: "Void", adjust: "Save" }[action.kind]}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
      </form>
    );

  return (
    <Panel
      title="Payments"
      right={s.exists && (
        <div className="flex gap-2">
          {s.can_reverse && <Button size="sm" variant="ghost" onClick={() => startAction({ kind: "adjust" })}>Adjust</Button>}
          <Button size="sm" variant="outline" onClick={() => setRecording(recording ? null : newIdempotencyKey())}>{recording ? "Cancel" : "Record payment"}</Button>
        </div>
      )}
    >
      {!s.exists ? (
        <p className="text-sm text-muted-foreground">Payments open once the customer has accepted a price.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Price</dt><dd className="font-semibold tabular-nums">{money(t.charged)}</dd></div>
            {Number(t.credits) !== 0 && <div><dt className="text-muted-foreground">Discounts</dt><dd className="font-semibold tabular-nums">−{money(t.credits)}</dd></div>}
            <div><dt className="text-muted-foreground">Paid</dt><dd className="font-semibold tabular-nums">{money(t.paid)}</dd></div>
            <div>
              <dt className="text-muted-foreground">{Number(t.balance) < 0 ? "Credit (owed to customer)" : "Balance"}</dt>
              <dd className="font-bold tabular-nums">{money(Math.abs(Number(t.balance)))}</dd>
            </div>
          </dl>
          {actionForm("adjust")}

          {recording && (
            <form onSubmit={record} className="mt-3 grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
              <Input type="number" min="0.01" step="any" placeholder={`Amount received (${currency})`} aria-label="Amount received" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <select aria-label="Method" className="h-10 rounded-md border bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select>
              <Input
                placeholder={method === "cash" || method === "other" ? "Reference (optional)" : "Transaction reference"} aria-label="Reference"
                required={method === "momo" || method === "bank" || method === "card"} minLength={method === "cash" || method === "other" ? undefined : 3}
                maxLength={100} value={ref} onChange={(e) => setRef(e.target.value)}
              />
              <Input placeholder="Note (optional)" aria-label="Note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" className="sm:col-span-2" disabled={busy || !amount}>Save payment</Button>
            </form>
          )}

          {pending.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">Reported by the customer · check before confirming</h3>
              <ul className="divide-y text-sm">
                {pending.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-semibold tabular-nums">{money(x.amount)}</span>
                    <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[x.method]} · {x.reference} · {formatDate(x.created_at, { day: "numeric", month: "short" })}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Pill tone="wait">Not yet checked</Pill>
                      <Button size="sm" onClick={() => startAction({ kind: "verify", submission: x })}><Check className="mr-1 h-4 w-4" />Arrived</Button>
                      <Button size="sm" variant="ghost" aria-label="Reject this report" onClick={() => startAction({ kind: "reject", submission: x })}><X className="h-4 w-4" /></Button>
                    </span>
                    {actionForm(x.id)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.payments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">Money received</h3>
              <ul className="divide-y text-sm">
                {s.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className={REVERSED.includes(p.status) && p.status !== "partially_refunded" ? "font-semibold tabular-nums line-through" : "font-semibold tabular-nums"}>{money(p.amount)}</span>
                    <span className="text-muted-foreground">
                      {PAYMENT_METHOD_LABEL[p.method]}{p.reference && ` · ${p.reference}`} · {formatDate(p.confirmed_at ?? p.created_at, { day: "numeric", month: "short" })}
                      {Number(p.refunded_amount) > 0 && ` · ${money(p.refunded_amount)} refunded`}
                      {p.metadata?.note && ` · ${p.metadata.note}`}
                      {p.failure_reason && ` · ${p.failure_reason}`}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <Pill tone={p.status === "successful" ? "done" : p.status === "pending" || p.status === "processing" ? "wait" : "off"}>{PAYMENT_STATUS_LABEL[p.status]}</Pill>
                      {s.can_reverse && (p.status === "successful" || p.status === "partially_refunded") && (
                        <Button size="sm" variant="ghost" onClick={() => startAction({ kind: "refund", payment: p })}>Refund</Button>
                      )}
                      {s.can_reverse && p.status === "successful" && Number(p.refunded_amount) === 0 && (
                        <Button size="sm" variant="ghost" title="The money never arrived: the payment was recorded by mistake" onClick={() => startAction({ kind: "void", payment: p })}>Void</Button>
                      )}
                    </span>
                    {actionForm(p.id)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {decided.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Rejected reports ({decided.length})</summary>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {decided.map((x) => <li key={x.id}>{money(x.amount)} · {x.reference} · {x.review_note}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}
