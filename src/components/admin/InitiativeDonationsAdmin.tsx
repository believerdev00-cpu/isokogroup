// Checking the donations people say they have made.
//
// This screen did not exist. The database has had the whole workflow since
// the initiative shipped -- admins may review, a guard refuses any second
// review, and only a confirmed row counts as money -- but there was nowhere
// in the site to do it, so the two confirmations on the live site were made
// by hand in the database console. A workflow with no door is a workflow
// somebody performs incorrectly at two in the morning.
//
// Confirming is the moment money becomes real here, so the screen says what
// it is asking: check the reference against the actual Mobile Money or bank
// statement first. Nothing on this page can see whether the payment landed;
// only the person reading the statement can.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorText } from "@/features/services/api";
import { rwf } from "@/lib/initiative";

type Donation = {
  id: string; amount: number; donor_name: string | null; donor_email: string | null;
  anonymous: boolean; payment_method: string; reference: string | null; donor_note: string | null;
  focus_area: string | null; status: string; submitted_at: string; reviewed_at: string | null; review_note: string | null;
};

const STATUS_TONE: Record<string, string> = {
  pending: "text-amber-700 dark:text-amber-400",
  confirmed: "text-emerald-700 dark:text-emerald-400",
  rejected: "text-destructive",
};

export default function InitiativeDonationsAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const donations = useQuery({
    queryKey: ["admin", "initiative_donations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("initiative_donations")
        .select("id, amount, donor_name, donor_email, anonymous, payment_method, reference, donor_note, focus_area, status, submitted_at, reviewed_at, review_note")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Donation[];
    },
  });

  const review = async (d: Donation, status: "confirmed" | "rejected") => {
    setBusy(d.id);
    try {
      const { error } = await supabase
        .from("initiative_donations")
        .update({ status, review_note: notes[d.id]?.trim() || null })
        .eq("id", d.id);
      if (error) throw error;
      // The month of access is granted by the database in the same
      // transaction as the confirmation, so there is nothing to do here but
      // say what happened.
      toast({
        title: status === "confirmed" ? "Confirmed" : "Rejected",
        description: status === "confirmed"
          ? "The donor has been given 30 days of Premium access and written to."
          : "The donor has not been given any access.",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "initiative_donations"] });
    } catch (e) {
      toast({ title: "Not saved", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const rows = donations.data ?? [];
  const waiting = rows.filter((d) => d.status === "pending");
  const done = rows.filter((d) => d.status !== "pending");

  const table = (list: Donation[], empty: string, reviewable: boolean) =>
    list.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Donor</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Paid by</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>{reviewable ? "Note to file" : "Status"}</TableHead>
            <TableHead>{reviewable ? "Check the statement, then" : "Reviewed"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="align-top">
                <span className="block font-medium">{d.donor_name || (d.anonymous ? "Anonymous" : "—")}</span>
                <span className="block text-xs text-muted-foreground">{d.donor_email ?? "—"}</span>
                {d.anonymous && <span className="block text-xs text-muted-foreground">Not to be named publicly</span>}
                {d.donor_note && (
                  <span className="mt-1 block max-w-xs whitespace-pre-line rounded bg-muted p-1.5 text-xs">{d.donor_note}</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap align-top font-medium">{rwf(d.amount)}</TableCell>
              <TableCell className="align-top text-sm capitalize">{d.payment_method}</TableCell>
              <TableCell className="align-top font-mono text-xs">{d.reference ?? "—"}</TableCell>
              <TableCell className="align-top">
                {reviewable ? (
                  <Input
                    value={notes[d.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                    placeholder="optional"
                    className="h-8 w-40 text-xs"
                  />
                ) : (
                  <>
                    <span className={`text-sm font-medium capitalize ${STATUS_TONE[d.status] ?? ""}`}>{d.status}</span>
                    {d.review_note && <span className="block text-xs text-muted-foreground">{d.review_note}</span>}
                  </>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap align-top">
                {reviewable ? (
                  <span className="flex gap-2">
                    <Button size="sm" disabled={busy === d.id} onClick={() => review(d, "confirmed")} className="gap-1.5">
                      {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => review(d, "rejected")} className="gap-1.5">
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {d.reviewed_at ? new Date(d.reviewed_at).toLocaleString("en-GB") : "—"}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Donations awaiting a check ({waiting.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          A donation is a claim until somebody checks it. Match the reference against the company Mobile Money or bank
          statement before confirming — this page cannot see whether the money arrived. Confirming grants the donor 30
          days of Premium access and emails them; it cannot be undone from here.
        </p>

        {donations.isLoading ? (
          <p className="py-6 text-center text-muted-foreground">Loading…</p>
        ) : donations.isError ? (
          <p className="py-6 text-center text-destructive">The donations could not be loaded.</p>
        ) : (
          <>
            {table(waiting, "Nothing is waiting to be checked.", true)}
            <div>
              <p className="mb-2 text-sm font-semibold">Already reviewed ({done.length})</p>
              {table(done, "No donations have been reviewed yet.", false)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
