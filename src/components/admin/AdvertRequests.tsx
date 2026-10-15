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
import { findCurrency, useCurrencies } from "@/lib/currencies";
import { formatAmount, moneyFromDb } from "@/lib/money";
import AdvertQuoteDialog from "@/components/admin/AdvertQuoteDialog";
import {
  PLACEMENTS, STATUS_LABEL, advertMailto, agreementTone, artworkUrl,
  setAdvertStatus, statusTone, telHref, useAdvertDesk, whatsappHref,
  type AdvertAgreement, type AdvertDeskRow,
} from "@/features/adverts/api";

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
 * ISOKO GROUP, and what has been quoted on each.
 *
 * It began as a call-back list and still reads as one -- the address and the
 * number are links, how long somebody has been waiting is beside the date,
 * and "Mark contacted" sits on the rows where that is the next step. What is
 * new is that the money is here too: the budget in the currency the
 * advertiser named it in, the quotes against it, and whether the fee has
 * been paid.
 *
 * Every amount on this screen carries its currency, and two amounts in
 * different currencies are never put in the same column. A budget of 450,000
 * RWF and one of 500 USD are not comparable and the desk does not pretend
 * they are: it sorts by date, not by money.
 */
export default function AdvertRequests() {
  const desk = useAdvertDesk();
  const { data: currencies } = useCurrencies();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AdvertDeskRow | null>(null);
  const [quoting, setQuoting] = useState<AdvertDeskRow | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("new");
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => desk.data ?? [], [desk.data]);

  // One box over every field somebody might remember: the reference they were
  // given, the company, the person, or the address they wrote from.
  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ request: r }) =>
      [r.reference, r.company, r.full_name, r.email, r.phone, r.industry, r.what_to_advertise]
        .join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const waiting = found.filter((r) => r.request.status === "new");
  const dealtWith = found.filter((r) => r.request.status !== "new");
  const counted = (n: number) => (desk.isSuccess ? ` (${n})` : "");

  /** The budget, in the currency it was given in, or a dash. */
  const budgetOf = (row: AdvertDeskRow) => {
    const { budget_amount, budget_currency } = row.request;
    if (!budget_amount || !budget_currency) return "—";
    const currency = findCurrency(currencies, budget_currency);
    const minor = moneyFromDb(budget_amount, currency.minor_units);
    return minor === null ? "—" : formatAmount(minor, currency, { code: true });
  };

  /** The quote that is on the table, or the one that was agreed. */
  const liveQuote = (row: AdvertDeskRow): AdvertAgreement | undefined =>
    row.agreements.find((a) => a.status === "accepted")
    ?? row.agreements.find((a) => a.status === "proposed");

  const quoteOf = (row: AdvertDeskRow) => {
    const quote = liveQuote(row);
    if (!quote) return null;
    const currency = findCurrency(currencies, quote.currency);
    const minor = moneyFromDb(quote.total, currency.minor_units);
    return { quote, currency, text: minor === null ? "—" : formatAmount(minor, currency, { code: true }) };
  };

  const openArtwork = async (path: string) => {
    try {
      window.open(await artworkUrl(path), "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Could not open the artwork", description: errorText(e), variant: "destructive" });
    }
  };

  /** The commonest next step, without opening anything. */
  const markContacted = async (row: AdvertDeskRow) => {
    setMarking(row.request.id);
    try {
      await setAdvertStatus(row.request.id, "contacted");
      toast({ title: `${row.request.company} marked contacted` });
      await desk.refetch();
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
      await setAdvertStatus(editing.request.id, status, notes);
      toast({ title: "Request updated" });
      setEditing(null);
      await desk.refetch();
    } catch (e) {
      toast({ title: "Could not update it", description: errorText(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Escape and a click outside both close a dialog, and typed notes are easy
  // to lose that way without ever pressing Cancel.
  const closeReview = () => {
    const changed = editing && (status !== editing.request.status || notes !== editing.request.staff_notes);
    if (changed && !window.confirm("Close without saving? Your notes and status change will be lost.")) return;
    setEditing(null);
  };

  const contactButtons = (row: AdvertDeskRow, size: "sm" | "default" = "sm") => (
    <>
      <a href={advertMailto(row.request)}>
        <Button variant="outline" size={size} className="gap-2"><Mail className="h-4 w-4" /> Email</Button>
      </a>
      <a href={telHref(row.request.phone)}>
        <Button variant="outline" size={size} className="gap-2"><Phone className="h-4 w-4" /> Call</Button>
      </a>
      <a href={whatsappHref(row.request.phone)} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size={size} className="gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
      </a>
    </>
  );

  const table = (list: AdvertDeskRow[], empty: string, isWaiting: boolean) => (
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
            <TableHead>Their maximum</TableHead>
            <TableHead>Quoted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => {
            const r = row.request;
            const quoted = quoteOf(row);
            return (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{r.reference}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  <p>{when(r.created_at)}</p>
                  <p className="text-xs text-muted-foreground">{waited(r.created_at)}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{r.company}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.full_name} · {r.industry}{r.country ? ` · ${r.country}` : ""}
                  </p>
                  <p className="text-xs">
                    <a className="text-primary hover:underline" href={advertMailto(r)}>{r.email}</a>
                    <span className="text-muted-foreground"> · </span>
                    <a className="text-primary hover:underline" href={telHref(r.phone)}>{r.phone}</a>
                  </p>
                </TableCell>
                <TableCell className="max-w-sm">
                  <p className="line-clamp-2 text-sm">{r.what_to_advertise}</p>
                  {row.products.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {row.products.length === 1
                        ? `Listing: ${row.products[0].name}`
                        : `${row.products.length} listings to carry`}
                    </p>
                  )}
                  {r.artwork_path && (
                    <Button variant="outline" size="sm" className="mt-1 gap-1"
                      onClick={() => openArtwork(r.artwork_path!)}>
                      <FileText className="h-3.5 w-3.5" /> Artwork
                    </Button>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{placementLabel(r.placement)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{r.duration}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{budgetOf(row)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {quoted ? (
                    <>
                      <p>{quoted.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {quoted.quote.status === "accepted" ? "accepted" : "awaiting their answer"}
                      </p>
                    </>
                  ) : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge className={statusTone(r.status)} variant="outline">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {isWaiting && (
                      <Button size="sm" variant="secondary" disabled={marking === r.id}
                        onClick={() => markContacted(row)}>
                        {marking === r.id ? "Saving…" : "Mark contacted"}
                      </Button>
                    )}
                    {r.status !== "accepted" && (
                      <Button size="sm" onClick={() => setQuoting(row)}>
                        {row.agreements.length > 0 ? "Re-quote" : "Quote"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditing(row); setStatus(r.status); setNotes(r.staff_notes);
                    }}>Review</Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    )
  );

  /** Every quote on a request, newest first, with the rate behind each. */
  const quoteHistory = (row: AdvertDeskRow) => (
    <div className="space-y-2">
      {row.agreements.map((a) => {
        const currency = findCurrency(currencies, a.currency);
        const total = moneyFromDb(a.total, currency.minor_units);
        const daily = moneyFromDb(a.daily_rate, currency.minor_units);
        return (
          <div key={a.id} className="rounded-lg border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                Revision {a.revision}: {total !== null ? formatAmount(total, currency, { code: true }) : "—"}
                <span className="font-normal text-muted-foreground">
                  {" "}· {a.days} day{a.days === 1 ? "" : "s"}
                  {daily !== null ? ` at ${formatAmount(daily, currency)}` : ""}
                </span>
              </p>
              <Badge className={agreementTone(a.status)} variant="outline">{a.status}</Badge>
            </div>
            {/* When it is running, and so when the listings are on air. */}
            {a.status === "accepted" && (
              <p className="pt-1 text-muted-foreground">
                {a.starts_on
                  ? `Running ${when(a.starts_on)}${a.ends_on ? ` to ${when(a.ends_on)}` : ""}`
                  : `Running ${a.days} day${a.days === 1 ? "" : "s"} from acceptance`}
              </p>
            )}
            {a.decline_reason && <p className="pt-1 text-muted-foreground">Declined: {a.decline_reason}</p>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Megaphone className="h-5 w-5 text-primary" /> Advertising requests
          </h2>
          <p className="text-sm text-muted-foreground">
            Businesses asking to advertise with ISOKO GROUP. Each one is somebody to contact, and
            then to quote — in the currency they asked in.
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
          {desk.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : desk.isError ? <LoadFailed onRetry={() => desk.refetch()} />
            : table(waiting, search ? "No waiting request matches that." : "No new advertising requests.", true)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Everything else{counted(dealtWith.length)}</CardTitle></CardHeader>
        <CardContent>
          {desk.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : desk.isError ? <LoadFailed onRetry={() => desk.refetch()} />
            : table(dealtWith, search ? "Nothing dealt with matches that." : "Nothing has been dealt with yet.", false)}
        </CardContent>
      </Card>

      <AdvertQuoteDialog
        row={quoting}
        open={!!quoting}
        onOpenChange={(o) => !o && setQuoting(null)}
        onQuoted={() => desk.refetch()}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeReview()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.request.company} · {editing?.request.reference}</DialogTitle>
            <DialogDescription>
              Reach the advertiser, then record how far it got. They see the status; the notes stay with the office.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p><span className="text-muted-foreground">Contact:</span> {editing.request.full_name} · {editing.request.email} · {editing.request.phone}</p>
                <p><span className="text-muted-foreground">Industry:</span> {editing.request.industry}</p>
                <p><span className="text-muted-foreground">Placement:</span> {placementLabel(editing.request.placement)} · {editing.request.duration}</p>
                <p><span className="text-muted-foreground">Their maximum:</span> {budgetOf(editing)}</p>
                <p><span className="text-muted-foreground">Asked:</span> {when(editing.request.created_at)} ({waited(editing.request.created_at)})</p>
                {editing.request.reviewed_at && (
                  <p><span className="text-muted-foreground">Last moved on:</span> {when(editing.request.reviewed_at)}</p>
                )}
                <p className="whitespace-pre-line pt-1">{editing.request.what_to_advertise}</p>
                {editing.request.message && <p className="whitespace-pre-line text-muted-foreground">{editing.request.message}</p>}
              </div>

              {/* Every maximum they have named, because a quote refused for
                  being over budget only makes sense beside the budget it was
                  over. */}
              {editing.budgets.length > 1 && (
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-medium">Budgets they have given</p>
                  {editing.budgets.map((b, i) => (
                    <p key={`${b.created_at}-${i}`} className="text-muted-foreground">
                      {b.amount} {b.currency} — {when(b.created_at)}
                      {b.by_staff ? " (recorded by the office)" : ""}{b.note ? ` · ${b.note}` : ""}
                    </p>
                  ))}
                </div>
              )}

              {editing.agreements.length > 0 && quoteHistory(editing)}

              {editing.finance && (
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-medium">Account ({editing.finance.currency})</p>
                  <p className="text-muted-foreground">
                    Charged {editing.finance.totals.charged} · paid {editing.finance.totals.paid} ·
                    outstanding {editing.finance.totals.balance}
                    {Number(editing.finance.totals.pending) > 0
                      ? ` · ${editing.finance.totals.pending} reported and waiting to be checked`
                      : ""}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {contactButtons(editing)}
                {editing.request.artwork_path && (
                  <Button variant="outline" size="sm" className="gap-2"
                    onClick={() => openArtwork(editing.request.artwork_path!)}>
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
