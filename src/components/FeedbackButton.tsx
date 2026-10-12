// One icon, on every page, for anyone who wants to say something.
//
// The channel already existed: /contact writes to contact_messages through
// contact_submit_message(), and it deliberately needs no account -- "a
// complaint that requires one is a complaint you never hear". What it did
// not have was a way in. It was a text link in the footer, under Company,
// between "About us" and "Become a seller", which is where you look when
// you are already looking for it and nowhere near where an opinion
// actually occurs to somebody.
//
// So the same form becomes a button that is always on screen. Nothing new
// behind it: the same validation, the same function, the same reference
// number back, and the same messages arriving in Admin > Messages.
//
// Deliberately NOT /messages, which is the other thing in that footer.
// That one is private conversations between signed-in people, about an
// order or a product -- it needs an account and goes to one person, not to
// Isoko.
import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendContactMessage } from "@/features/contact/api";

/** The three a passer-by actually has. The rest live on the Contact page. */
const TOPICS = [
  { key: "suggestion", label: "A suggestion" },
  { key: "complaint", label: "Something went wrong" },
  { key: "enquiry", label: "A question" },
];

/**
 * A subject, taken from the opinion itself.
 *
 * The office list shows subjects, and contact_submit_message insists on
 * one. Asking for it would add a field to a form whose whole point is being
 * quick to answer, and "Suggestion" on every row tells the office nothing.
 */
const subjectFrom = (message: string, topicLabel: string) => {
  const firstLine = message.trim().split(/\r?\n/)[0].trim();
  if (!firstLine) return topicLabel;
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77).trimEnd()}…`;
};

export default function FeedbackButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0].key);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  // Somebody signed in should not retype what the site already knows.
  const openDialog = () => {
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    setName((n) => n || meta.full_name || meta.name || "");
    setEmail((e) => e || user?.email || "");
    setSent(null);
    setOpen(true);
  };

  const send = async () => {
    setBusy(true);
    try {
      const topicLabel = TOPICS.find((t) => t.key === topic)?.label ?? "Feedback";
      const { reference } = await sendContactMessage({
        full_name: name,
        email,
        topic,
        subject: subjectFrom(message, topicLabel),
        message,
      });
      setSent(reference);
      setMessage("");
    } catch (e) {
      toast({ title: "Not sent", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Left, because the WhatsApp button on the consultancy pages owns the
          right-hand corner. z-40 keeps it under the cookie banner, which is
          a full-width bar and only there until it is dismissed. */}
      <button
        type="button"
        onClick={openDialog}
        aria-label="Tell us what you think"
        title="Tell us what you think"
        className="fixed bottom-5 left-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{sent ? "Thank you" : "Tell us what you think"}</DialogTitle>
            <DialogDescription>
              {sent
                ? "Your message is with the Isoko office."
                : "Anything at all — what works, what doesn't, what is missing. No account needed."}
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <div className="grid gap-3">
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                Your reference is <span className="font-semibold">{sent}</span>. Keep it if you want to ask about this later.
              </p>
              <p className="text-xs text-muted-foreground">We reply to the email address you gave.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>What is it about</Label>
                <Select value={topic} onValueChange={setTopic}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TOPICS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="fb-message">Your message</Label>
                <Textarea
                  id="fb-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Say it in your own words."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-name">Your name</Label>
                  <Input id="fb-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-email">Email</Label>
                  <Input id="fb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="so we can reply" />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {sent ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button onClick={send} disabled={busy} className="gap-1.5">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
