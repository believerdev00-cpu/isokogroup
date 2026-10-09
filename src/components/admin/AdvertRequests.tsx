import { useState } from "react";
import { AlertCircle, FileText, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import {
  PLACEMENTS, STATUS_LABEL, artworkUrl, setAdvertStatus, useAdvertRequests,
  type AdvertRequest,
} from "@/features/adverts/api";

const rwf = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("en-RW")} RWF`);
const placementLabel = (key: string) => PLACEMENTS.find((p) => p.key === key)?.label ?? key;

const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-wrap items-center gap-3">
    <AlertCircle className="h-4 w-4 text-destructive" />
    <p className="text-sm text-muted-foreground">We couldn&apos;t load the advertising requests. Please try again.</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);

/**
 * The advertising desk: enquiries from businesses who want to advertise with
 * ISOKO GROUP. Nothing here publishes an advert or takes a payment -- it is a
 * list of people to call back, and the status is a record of how far that got.
 */
export default function AdvertRequests() {
  const requests = useAdvertRequests();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AdvertRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("new");
  const [saving, setSaving] = useState(false);

  const rows = requests.data ?? [];
  const waiting = rows.filter((r) => r.status === "new");
  const counted = (n: number) => (requests.isSuccess ? ` (${n})` : "");

  const openArtwork = async (path: string) => {
    try {
      window.open(await artworkUrl(path), "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Could not open the artwork", description: errorText(e), variant: "destructive" });
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await setAdvertStatus(editing.id, status, notes);
      toast({ title: "Request updated" });
      setEditing(null);
      await requests.refetch();
    } catch (e) {
      toast({ title: "Could not update it", description: errorText(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const table = (list: AdvertRequest[], empty: string) => (
    list.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Wants to advertise</TableHead>
            <TableHead>Placement</TableHead>
            <TableHead>For</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap font-mono text-xs">{r.reference}</TableCell>
              <TableCell>
                <p className="font-medium">{r.company}</p>
                <p className="text-xs text-muted-foreground">{r.full_name} · {r.industry}</p>
                <p className="text-xs text-muted-foreground">{r.email} · {r.phone}</p>
              </TableCell>
              <TableCell className="max-w-sm">
                <p className="line-clamp-2 text-sm">{r.what_to_advertise}</p>
                {r.artwork_path && (
                  <Button variant="outline" size="sm" className="mt-1 gap-1"
                    onClick={() => openArtwork(r.artwork_path!)}>
                    <FileText className="h-3.5 w-3.5" /> Artwork
                  </Button>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{placementLabel(r.placement)}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{r.duration}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{rwf(r.budget_rwf)}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{STATUS_LABEL[r.status] ?? r.status}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => {
                  setEditing(r); setStatus(r.status); setNotes(r.staff_notes);
                }}>Review</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Megaphone className="h-5 w-5 text-primary" /> Advertising requests
        </h2>
        <p className="text-sm text-muted-foreground">
          Businesses asking to advertise with ISOKO GROUP. Nothing here is published and nobody has
          been charged: each one is somebody to contact.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Waiting to be contacted{counted(waiting.length)}</CardTitle></CardHeader>
        <CardContent>
          {requests.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : requests.isError ? <LoadFailed onRetry={() => requests.refetch()} />
            : table(waiting, "No new advertising requests.")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Everything else{counted(rows.length - waiting.length)}</CardTitle></CardHeader>
        <CardContent>
          {requests.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : requests.isError ? <LoadFailed onRetry={() => requests.refetch()} />
            : table(rows.filter((r) => r.status !== "new"), "Nothing has been dealt with yet.")}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.company} · {editing?.reference}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p><span className="text-muted-foreground">Contact:</span> {editing.full_name} · {editing.email} · {editing.phone}</p>
                <p><span className="text-muted-foreground">Industry:</span> {editing.industry}</p>
                <p><span className="text-muted-foreground">Placement:</span> {placementLabel(editing.placement)} · {editing.duration}</p>
                <p><span className="text-muted-foreground">Budget:</span> {rwf(editing.budget_rwf)}</p>
                <p className="whitespace-pre-line pt-1">{editing.what_to_advertise}</p>
                {editing.message && <p className="whitespace-pre-line text-muted-foreground">{editing.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes for the team</label>
                <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
