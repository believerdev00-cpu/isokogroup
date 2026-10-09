import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, MapPin, MessageSquare, Phone, Send } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/features/services/api";
import { localPhone, telHref, useSiteSettings } from "@/lib/siteSettings";
import { TOPICS, contactProblem, sendContactMessage, type ContactInput } from "@/features/contact/api";

const EMPTY: ContactInput = { full_name: "", email: "", phone: "", topic: "enquiry", subject: "", message: "" };

/**
 * Writing to ISOKO Groups.
 *
 * Deliberately open to anyone. A complaint that needs an account is a complaint
 * nobody makes, and the people most worth hearing from are often the ones least
 * likely to register first. Signing in only means the message is linked to the
 * account, so the sender can see the reply alongside everything else.
 *
 * The page also shows the real published contact details, because a form is not
 * always what somebody wants.
 */
export default function Contact() {
  const { user } = useAuth();
  const site = useSiteSettings();
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setForm((f) => (f.email ? f : { ...f, email: user?.email ?? "" }));
  }, [user?.email]);

  const set = (k: keyof ContactInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const problem = contactProblem(form);

  const submit = async () => {
    setError(null);
    const bad = contactProblem(form);
    if (bad) return setError(bad);
    setSending(true);
    try {
      const { reference } = await sendContactMessage(form);
      setDone(reference);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Talk to us</p>
            <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">Contact ISOKO Groups</h1>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Questions, suggestions, complaints or business enquiries. Write to us here and a
              person will read it. You do not need an account.
            </p>
          </div>

          {/* The real published details, for anyone who would rather not use a form */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {site.email && (
              <a href={`mailto:${site.email}`} className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm transition-colors hover:border-primary">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <span className="break-all">{site.email}</span>
              </a>
            )}
            {site.phones[0] && (
              <a href={telHref(site.phones[0])} className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm transition-colors hover:border-primary">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span>{localPhone(site.phones[0])}</span>
              </a>
            )}
            {site.address && (
              <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <span>{site.address}</span>
              </div>
            )}
          </div>

          {done ? (
            <div className="mt-8 space-y-4 rounded-xl border border-border bg-muted/30 p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
              <div className="space-y-1">
                <p className="font-semibold">Thank you — your message has been sent.</p>
                <p className="text-sm text-muted-foreground">
                  Your reference is <span className="font-mono font-semibold text-foreground">{done}</span>.
                  Our team will read it and reply to the email address you gave us.
                </p>
              </div>
              <Button variant="outline" onClick={() => { setDone(null); setForm({ ...EMPTY, email: user?.email ?? "" }); }}>
                Write another message
              </Button>
            </div>
          ) : (
            <div className="mt-8 space-y-4 rounded-xl border border-border p-6 md:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Your name</Label>
                  <Input id="c-name" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} autoComplete="name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-email">Email address</Label>
                  <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">Phone or WhatsApp (optional)</Label>
                  <Input id="c-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} autoComplete="tel" placeholder="+250 7.." />
                </div>
                <div className="space-y-1.5">
                  <Label>What is it about?</Label>
                  <Select value={form.topic} onValueChange={set("topic")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TOPICS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-subject">Subject</Label>
                <Input id="c-subject" value={form.subject} onChange={(e) => set("subject")(e.target.value)} placeholder="A line about what you need" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-message">Your message</Label>
                <Textarea id="c-message" rows={6} value={form.message} onChange={(e) => set("message")(e.target.value)} />
                <p className="text-xs text-muted-foreground">{form.message.trim().length} of 5,000 characters</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="button" size="lg" className="w-full gap-2" disabled={sending || !!problem} onClick={submit}>
                {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send message</>}
              </Button>
              {problem && <p className="text-center text-xs text-muted-foreground">{problem}</p>}

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Your message is private. Only the ISOKO Groups team can read it, and we will only
                use your details to reply to you.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
