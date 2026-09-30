import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatPrice, planName } from "@/lib/subscription";

type Row = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  plan: "week" | "monthly" | "seller";
  amount: number;
  currency: string;
  payer_name: string | null;
  payer_phone: string | null;
  reference: string | null;
  proof_path: string | null;
  paid_at: string | null;
  status: "pending" | "confirmed" | "rejected";
  submitted_at: string;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  period_starts_at: string | null;
  period_ends_at: string | null;
};

const FILTERS = [
  { key: "pending", label: "Awaiting confirmation" },
  { key: "confirmed", label: "Confirmed" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;

// Screenshots are private: a two-minute link, opened in a new tab
async function openScreenshot(path: string) {
  const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 120);
  if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

const when = (v: string | null) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

// Subscription payments reported by customers. Nothing here is verified
// automatically: before confirming, check the company Mobile Money account for
// this amount, from this number, with this transaction ID. Confirming starts
// the 7 days or the month; the database records who confirmed and when.
const SubscriptionPaymentsAdmin = () => {
  const { toast } = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<Row | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("subscription_payments_list", { p_status: filter, p_limit: 200 });
    setLoading(false);
    if (error) {
      toast({ title: "Could not load subscription payments", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data ?? []) as Row[]);
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async () => {
    if (!confirming) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("subscription_confirm_payment", { p_payment_id: confirming.id });
    setBusy(false);
    if (error) {
      toast({ title: "Not confirmed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment confirmed", description: `${planName(confirming.plan)} started for ${confirming.customer_name || confirming.customer_email}.` });
    setConfirming(null);
    load();
  };

  const reject = async () => {
    if (!rejecting) return;
    if (reason.trim().length < 3) {
      toast({ title: "Say why the payment is rejected", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any).rpc("subscription_reject_payment", { p_payment_id: rejecting.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) {
      toast({ title: "Not rejected", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment rejected", description: "The customer was told why and can send corrected details." });
    setRejecting(null);
    setReason("");
    load();
  };

  const pendingCount = filter === "pending" ? rows.length : null;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle>Subscription payments{pendingCount != null ? ` to confirm (${pendingCount})` : ""}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Customers pay the company Mobile Money code directly. Confirm only after you see the payment on the company
          account; access starts when you confirm.
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No payments here.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead>Transaction ID / screenshot</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">{r.customer_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.customer_email}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{planName(r.plan)}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{formatPrice(r.amount, r.currency)}</TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium">{r.payer_name || "—"}</p>
                      {r.payer_phone && <p className="font-mono text-muted-foreground">{r.payer_phone}</p>}
                    </TableCell>
                    <TableCell className="text-xs space-y-1">
                      {r.reference && <p className="font-mono">{r.reference}</p>}
                      {r.proof_path && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => openScreenshot(r.proof_path!)}>
                          <ImageIcon className="h-3.5 w-3.5" /> View screenshot
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{when(r.submitted_at)}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={r.status === "confirmed" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                        {r.status === "pending" ? "pending" : r.status}
                      </Badge>
                      {r.status === "confirmed" && (
                        <p className="mt-1 text-muted-foreground">
                          by {r.confirmed_by_name || "staff"}, {when(r.confirmed_at)}
                          <br />access {when(r.period_starts_at)} → {when(r.period_ends_at)}
                        </p>
                      )}
                      {r.status === "rejected" && (
                        <p className="mt-1 text-muted-foreground">
                          by {r.rejected_by_name || "staff"}, {when(r.rejected_at)}: {r.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setConfirming(r)}>Confirm payment</Button>
                          <Button size="sm" variant="outline" onClick={() => { setRejecting(r); setReason(""); }}>Reject</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm this payment?</DialogTitle>
            <DialogDescription>
              Only confirm if the company Mobile Money account received{" "}
              <strong>{confirming && formatPrice(confirming.amount, confirming.currency)}</strong>
              {confirming?.payer_name && <> paid by <strong>{confirming.payer_name}</strong></>}
              {confirming?.reference ? <> with transaction ID <strong className="font-mono">{confirming.reference}</strong></> : " (check the screenshot)"}. This starts{" "}
              {confirming?.plan === "week" ? "7 days" : "a month"} of full access for {confirming?.customer_name || confirming?.customer_email}.
              {confirming?.plan === "seller" && " It's the seller subscription: if they aren't a seller yet, this also approves their seller application and opens their seller dashboard."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
            <Button onClick={confirm} disabled={busy}>{busy ? "Confirming…" : "Yes, the money arrived"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this payment</DialogTitle>
            <DialogDescription>
              The customer is told the reason by e-mail and in the app, and can send corrected details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. No payment with this transaction ID on the company account" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>{busy ? "Rejecting…" : "Reject payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SubscriptionPaymentsAdmin;
