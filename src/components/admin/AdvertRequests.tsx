import { useMemo, useState } from "react";
import { AlertCircle, FileText, Mail, Megaphone, MessageCircle, Phone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import {
  PLACEMENTS, STATUS_LABEL, advertMailto, artworkUrl, setAdvertStatus, statusTone, telHref,
  useAdvertRequests, whatsappHref,
  type AdvertRequest,
} from "@/features/adverts/api";

const rwf = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("en-RW")} RWF`);
const when = (iso: string) => new Date(iso).toLocaleDateString();
const placementLabel = (key: string) => PLACEMENTS.find((p) => p.key === key)?.label ?? key;

/**
 * How long somebody has been waiting, in words.
 *
 * The desk is a call-back list, so the age of an enquiry is the thing that
 * decides what to do next: a business that asked this morning and one that
 * asked a fortnight ago need opposite amounts of hurry, and a date alone makes
 * that arithmetic the reader's problem.
 */
const waited = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

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
 *
 * Everything on this screen follows from that one sentence. The address and
 * the number are links, not text to be copied out by hand; how long somebody
 * has been waiting is shown beside the date, because that is what decides who
 * to ring first; and a request can be marked contacted from the row, since
 * that is the usual next step and opening a dialog to change one word is a
 * toll on the commonest action there is.
 */
export default function AdvertRequests() {
  const requests = useAdvertRequests();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AdvertRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("new");
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => requests.data ?? [], [requests.data]);

  // One box over every field somebody might remember: the reference they were
  // given, the company, the person, or the address they wrote from.
  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.reference, r.company, r.full_name, r.email, r.phone, r.industry, r.what_to_advertise]
        .join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const waiting = found.filter((r) => r.status === "new");
  const dealtWith = found.filter((r) => r.status !== "new");
  const counted = (n: number) => (requests.isSuccess ? ` (${n})` : "");

  const openArtwork = async (path: string) => {
    try {
      window.open(await artworkUrl(path), "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Could not open the artwork", description: errorText(e), variant: "destructive" });
    }
  };

  /** The commonest next step, without opening anything. */
  const markContacted = async (r: AdvertRequest) => {
    setMarking(r.id);
    try {
      await setAdvertStatus(r.id, "contacted");
      toast({ title: `${r.company} marked contacted` });
      await requests.refetch();
    } catch (e) {
      toast({ title: "Could not update it", description: errorText(e), variant: "destructive" });
    } finally {
      setMarking(null);
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

  // Escape and a click outside both close a dialog, and typed notes are easy
  // to lose that way without ever pressing Cancel.
  const closeReview = () => {
    const changed = editing && (status !== editing.status || notes !== editing.staff_notes);
    if (changed && !window.confirm("Close without saving? Your notes and status change will be lost.")) return;
    setEditing(null);
  };

  const contactButtons = (r: AdvertRequest, size: "sm" | "default" = "sm") => (
    <>
      <a href={advertMailto(r)}>
        <Button variant="outline" size={size} className="gap-2"><Mail className="h-4 w-4" /> Email</Button>
      </a>
      <a href={telHref(r.phone)}>
        <Button variant="outline" size={size} className="gap-2"><Phone className="h-4 w-4" /> Call</Button>
      </a>
      <a href={whatsappHref(r.phone)} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size={size} className="gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
      </a>
    </>
  );

  const table = (list: AdvertRequest[], empty: string, isWaiting: boolean) => (
    list.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Asked</TableHead>
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
              <TableCell className="whitespace-nowrap text-sm">
                <p>{when(r.created_at)}</p>
                <p className="text-xs text-muted-foreground">{waited(r.created_at)}</p>
              </TableCell>
              <TableCell>
                <p className="font-medium">{r.company}</p>
                <p className="text-xs text-muted-foreground">{r.full_name} · {r.industry}</p>
                <p className="text-xs">
                  <a className="text-primary hover:underline" href={advertMailto(r)}>{r.email}</a>
                  <span className="text-muted-foreground"> · </span>
                  <a className="text-primary hover:underline" href={telHref(r.phone)}>{r.phone}</a>
                </p>
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
              <TableCell className="whitespace-nowrap">
                <Badge className={statusTone(r.status)} variant="outline">
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {isWaiting && (
                    <Button size="sm" variant="secondary" disabled={marking === r.id}
                      onClick={() => markContacted(r)}>
                      {marking === r.id ? "Saving…" : "Mark contacted"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditing(r); setStatus(r.status); setNotes(r.staff_notes);
                  }}>Review</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Megaphone className="h-5 w-5 text-primary" /> Advertising requests
          </h2>
          <p className="text-sm text-muted-foreground">
            Businesses asking to advertise with ISOKO GROUP. Nothing here is published and nobody has
            been charged: each one is somebody to contact.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-9"
            placeholder="Reference, company, person, email…"
            aria-label="Search advertising requests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Waiting to be contacted{counted(waiting.length)}</CardTitle></CardHeader>
        <CardContent>
          {requests.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : requests.isError ? <LoadFailed onRetry={() => requests.refetch()} />
            : table(waiting, search ? "No waiting request matches that." : "No new advertising requests.", true)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Everything else{counted(dealtWith.length)}</CardTitle></CardHeader>
        <CardContent>
          {requests.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : requests.isError ? <LoadFailed onRetry={() => requests.refetch()} />
            : table(dealtWith, search ? "Nothing dealt with matches that." : "Nothing has been dealt with yet.", false)}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeReview()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.company} · {editing?.reference}</DialogTitle>
            <DialogDescription>
              Reach the advertiser, then record how far it got. They see the status; the notes stay with the office.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p><span className="text-muted-foreground">Contact:</span> {editing.full_name} · {editing.email} · {editing.phone}</p>
                <p><span className="text-muted-foreground">Industry:</span> {editing.industry}</p>
                <p><span className="text-muted-foreground">Placement:</span> {placementLabel(editing.placement)} · {editing.duration}</p>
                <p><span className="text-muted-foreground">Budget:</span> {rwf(editing.budget_rwf)}</p>
                <p><span className="text-muted-foreground">Asked:</span> {when(editing.created_at)} ({waited(editing.created_at)})</p>
                {editing.reviewed_at && (
                  <p><span className="text-muted-foreground">Last moved on:</span> {when(editing.reviewed_at)}</p>
                )}
                <p className="whitespace-pre-line pt-1">{editing.what_to_advertise}</p>
                {editing.message && <p className="whitespace-pre-line text-muted-foreground">{editing.message}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                {contactButtons(editing)}
                {editing.artwork_path && (
                  <Button variant="outline" size="sm" className="gap-2"
                    onClick={() => openArtwork(editing.artwork_path!)}>
                    <FileText className="h-4 w-4" /> Artwork
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="advert-status">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="advert-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="advert-notes">Notes for the team</label>
                <Textarea id="advert-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeReview} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
