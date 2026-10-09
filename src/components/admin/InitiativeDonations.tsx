import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import { DONATION_STATUS_LABEL, rwf } from "@/lib/initiative";
import {
  setDonationStatus, useAdminDonations, useAdminProjects, type AdminDonation,
} from "@/features/initiative/api";
import { AlertCircle, Check, X } from "lucide-react";

// Confirming a donation is the only moment a claimed payment becomes money, so
// it is a person reading a bank statement, not a webhook. The database stamps
// who confirmed it and refuses a second review, which is why nothing here sends
// a reviewer or a timestamp.

const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="space-y-3 py-8 text-center">
    <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground" />
    <p className="text-sm text-muted-foreground">We couldn&apos;t load this information just now.</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);

const InitiativeDonations = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const donations = useAdminDonations();
  const projects = useAdminProjects();

  const [rejecting, setRejecting] = useState<AdminDonation | null>(null);
  const [note, setNote] = useState("");

  const titleOf = useMemo(() => {
    const byId = new Map((projects.data ?? []).map((p) => [p.id, p.title]));
    return (id: string | null) => (id ? byId.get(id) ?? "a project" : "Wherever needed most");
  }, [projects.data]);

  const review = async (row: AdminDonation, to: "confirmed" | "rejected", reason?: string) => {
    try {
      await setDonationStatus(row.id, to, reason);
      toast({ title: to === "confirmed" ? "Donation confirmed" : "Donation rejected" });
      await qc.invalidateQueries({ queryKey: ["initiative"] });
      return true;
    } catch (err) {
      toast({ title: "Action failed", description: errorText(err), variant: "destructive" });
      return false;
    }
  };

  const rows = donations.data ?? [];
  const pending = rows.filter((d) => d.status === "pending");
  const reviewed = rows.filter((d) => d.status !== "pending");
  // A queue that could not be read is not an empty queue.
  const counted = (n: number) => (donations.isSuccess ? ` (${n})` : "");

  const table = (list: AdminDonation[], showActions: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Amount</TableHead>
          <TableHead>Donor</TableHead>
          <TableHead>Paid by</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Towards</TableHead>
          <TableHead>{showActions ? "Submitted" : "Outcome"}</TableHead>
          {showActions && <TableHead className="text-right">Checked the statement?</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-semibold">{rwf(d.amount)}</TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span>{d.anonymous ? "Anonymous" : d.donor_name || "—"}</span>
                {d.donor_email && <span className="text-xs text-muted-foreground">{d.donor_email}</span>}
              </div>
            </TableCell>
            <TableCell className="capitalize">{d.payment_method === "momo" ? "Mobile Money" : "Bank"}</TableCell>
            <TableCell className="font-mono text-xs">{d.reference}</TableCell>
            <TableCell className="max-w-[14rem] truncate text-sm">
              {titleOf(d.project_id)}
              {d.designated_by_donor && d.project_id && (
                <span className="block text-xs text-muted-foreground">chosen by the donor</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {showActions ? (
                new Date(d.submitted_at).toLocaleDateString()
              ) : (
                <div className="flex flex-col">
                  <span>{DONATION_STATUS_LABEL[d.status] ?? d.status}</span>
                  {d.review_note && <span className="text-xs">{d.review_note}</span>}
                </div>
              )}
            </TableCell>
            {showActions && (
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => review(d, "confirmed")}>
                    <Check className="h-3.5 w-3.5" /> It is there
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setRejecting(d); setNote(""); }}>
                    <X className="h-3.5 w-3.5" /> Not found
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Donations waiting to be confirmed{counted(pending.length)}</CardTitle>
        </CardHeader>
        <CardContent>
          {donations.isError ? (
            <LoadFailed onRetry={() => donations.refetch()} />
          ) : donations.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>No donation is waiting to be confirmed.</p>
              <p className="mt-1 text-xs">
                A donor pays ISOKO GROUP directly and submits their transaction reference. Check each one
                against the real statement before confirming it: only a confirmed donation counts as money
                raised.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Find each reference on the actual Mobile Money or bank statement before confirming.
                Confirming is recorded against your admin account and cannot be undone.
              </p>
              {table(pending, true)}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Donations already reviewed{counted(reviewed.length)}</CardTitle>
        </CardHeader>
        <CardContent>
          {donations.isError ? (
            <LoadFailed onRetry={() => donations.refetch()} />
          ) : donations.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : reviewed.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing has been reviewed yet.</p>
          ) : (
            table(reviewed, false)
          )}
        </CardContent>
      </Card>

      {/* Rejecting says why, and the donor is shown the reason. */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reference not found on the statement</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>What should the donor be told?</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. No payment of this amount with this reference appears on the statement for that date."
            />
            <p className="text-xs text-muted-foreground">
              The donor can send the same reference again once this is corrected, so a mistaken rejection
              is not final for them.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={note.trim().length === 0}
              onClick={async () => {
                if (!rejecting) return;
                if (await review(rejecting, "rejected", note.trim())) setRejecting(null);
              }}
            >
              Reject this donation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InitiativeDonations;
