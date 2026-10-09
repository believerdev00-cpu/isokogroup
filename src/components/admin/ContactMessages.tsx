import { useState } from "react";
import { AlertCircle, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import {
  STATUS_LABEL, TOPICS, setContactStatus, useContactMessages, type ContactMessage,
} from "@/features/contact/api";

const topicLabel = (key: string) => TOPICS.find((t) => t.key === key)?.label ?? key;
const when = (iso: string) => new Date(iso).toLocaleDateString();

const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-wrap items-center gap-3">
    <AlertCircle className="h-4 w-4 text-destructive" />
    <p className="text-sm text-muted-foreground">We couldn&apos;t load the messages. Please try again.</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);

/**
 * Messages people have written to ISOKO Groups.
 *
 * Private correspondence: it is shown here and nowhere else. A complaint that
 * nobody answers is worse than one never sent, so the unanswered ones are
 * listed first and separately.
 */
export default function ContactMessages() {
  const messages = useContactMessages();
  const { toast } = useToast();
  const [open, setOpen] = useState<ContactMessage | null>(null);
  const [status, setStatus] = useState("new");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = messages.data ?? [];
  const waiting = rows.filter((m) => m.status === "new" || m.status === "read");
  const counted = (n: number) => (messages.isSuccess ? ` (${n})` : "");

  const save = async () => {
    if (!open) return;
    setSaving(true);
    try {
      await setContactStatus(open.id, status, notes);
      toast({ title: "Message updated" });
      setOpen(null);
      await messages.refetch();
    } catch (e) {
      toast({ title: "Could not update it", description: errorText(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const table = (list: ContactMessage[], empty: string) =>
    list.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>From</TableHead>
            <TableHead>About</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => (
            <TableRow key={m.id} className={m.topic === "complaint" ? "bg-amber-500/5" : undefined}>
              <TableCell className="whitespace-nowrap font-mono text-xs">{m.reference}</TableCell>
              <TableCell>
                <p className="font-medium">{m.full_name}</p>
                <p className="text-xs text-muted-foreground">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{topicLabel(m.topic)}</TableCell>
              <TableCell className="max-w-xs"><p className="line-clamp-2 text-sm">{m.subject}</p></TableCell>
              <TableCell className="whitespace-nowrap text-sm">{when(m.created_at)}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{STATUS_LABEL[m.status] ?? m.status}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => {
                  setOpen(m); setStatus(m.status === "new" ? "read" : m.status); setNotes(m.staff_notes);
                }}>Open</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <MessageSquare className="h-5 w-5 text-primary" /> Messages
        </h2>
        <p className="text-sm text-muted-foreground">
          Enquiries, suggestions, complaints and business questions sent through the website.
          These are private: nobody outside this desk can read them.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Needing an answer{counted(waiting.length)}</CardTitle></CardHeader>
        <CardContent>
          {messages.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : messages.isError ? <LoadFailed onRetry={() => messages.refetch()} />
            : table(waiting, "Nothing is waiting for an answer.")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Answered and closed{counted(rows.length - waiting.length)}</CardTitle></CardHeader>
        <CardContent>
          {messages.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : messages.isError ? <LoadFailed onRetry={() => messages.refetch()} />
            : table(rows.filter((m) => m.status === "replied" || m.status === "closed"), "Nothing has been answered yet.")}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.subject}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p><span className="text-muted-foreground">From:</span> {open.full_name} · {open.email}{open.phone ? ` · ${open.phone}` : ""}</p>
                <p><span className="text-muted-foreground">About:</span> {topicLabel(open.topic)} · {open.reference} · {when(open.created_at)}</p>
              </div>
              {/* Rendered as text, never as markup: whatever somebody typed is
                  shown as the characters they typed. */}
              <p className="whitespace-pre-line rounded-lg bg-muted/40 p-4 leading-relaxed">{open.message}</p>

              <a href={`mailto:${open.email}?subject=${encodeURIComponent("Re: " + open.subject + " [" + open.reference + "]")}`}>
                <Button variant="outline" size="sm" className="gap-2"><Mail className="h-4 w-4" /> Reply by email</Button>
              </a>

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
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
