import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Megaphone, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/features/services/api";
import {
  ARTWORK_ACCEPT, DURATIONS, PLACEMENTS, advertProblem, artworkProblem,
  submitAdvertRequest, uploadArtwork, type AdvertInput,
} from "./api";

const EMPTY: AdvertInput = {
  full_name: "", company: "", email: "", phone: "", industry: "",
  what_to_advertise: "", placement: "", duration: "", budget_rwf: "", message: "",
};

/**
 * Asking ISOKO GROUP to carry your advertising.
 *
 * It does not need an account: an advertiser should not have to register to ask
 * a question. Artwork is the one thing that does, because a file has to belong
 * to somebody for storage to accept it; without an account the form says so
 * plainly rather than hiding the field.
 *
 * Nothing here publishes an advert or takes a payment. It records an enquiry,
 * tells the office, and says that somebody will be in touch.
 */
export default function AdvertiseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<AdvertInput>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A fresh form every time it is opened, so a previous enquiry is never half
  // left behind in the fields.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, email: user?.email ?? "" });
      setFile(null);
      setError(null);
      setDone(null);
      setSaving(false);
    }
  }, [open, user?.email]);

  const set = (k: keyof AdvertInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const problem = advertProblem(form);

  const pickFile = (chosen: File | undefined) => {
    if (!chosen) return;
    const bad = artworkProblem(chosen);
    if (bad) return setError(bad);
    setError(null);
    setFile(chosen);
  };

  const submit = async () => {
    setError(null);
    const bad = advertProblem(form);
    if (bad) return setError(bad);
    setSaving(true);
    try {
      let artwork_path: string | null = null;
      if (file && user) artwork_path = await uploadArtwork(user.id, file);
      const { reference } = await submitAdvertRequest({ ...form, artwork_path });
      setDone(reference);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Megaphone className="h-5 w-5 text-primary" />
            Advertise with ISOKO GROUP
          </DialogTitle>
          <DialogDescription>
            Tell us what you would like to advertise and our team will come back to you with
            placements and pricing. Sending this does not publish anything or commit you to a cost.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <div className="space-y-1">
              <p className="font-semibold">Thank you — we have your request.</p>
              <p className="text-sm text-muted-foreground">
                Your reference is <span className="font-mono font-semibold text-foreground">{done}</span>.
                Our team will review it and contact you on the email or number you gave us.
                Nothing has been published and you have not been charged.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="adv-name" label="Full name">
                <Input id="adv-name" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} autoComplete="name" />
              </Field>
              <Field id="adv-company" label="Company or business name">
                <Input id="adv-company" value={form.company} onChange={(e) => set("company")(e.target.value)} autoComplete="organization" />
              </Field>
              <Field id="adv-email" label="Email address">
                <Input id="adv-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" />
              </Field>
              <Field id="adv-phone" label="Phone or WhatsApp">
                <Input id="adv-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} autoComplete="tel" placeholder="+250 7.." />
              </Field>
              <Field id="adv-industry" label="Type of business or industry">
                <Input id="adv-industry" value={form.industry} onChange={(e) => set("industry")(e.target.value)} placeholder="Coffee, logistics, fashion.." />
              </Field>
              <Field id="adv-budget" label="Proposed budget in RWF (optional)">
                <Input id="adv-budget" inputMode="numeric" value={form.budget_rwf} onChange={(e) => set("budget_rwf")(e.target.value)} placeholder="450000" />
              </Field>
            </div>

            <Field id="adv-what" label="What would you like to advertise?">
              <Textarea id="adv-what" rows={3} value={form.what_to_advertise} onChange={(e) => set("what_to_advertise")(e.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Preferred placement</Label>
                <Select value={form.placement} onValueChange={set("placement")}>
                  <SelectTrigger><SelectValue placeholder="Where should it appear?" /></SelectTrigger>
                  <SelectContent>
                    {PLACEMENTS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How long should it run?</Label>
                <Select value={form.duration} onValueChange={set("duration")}>
                  <SelectTrigger><SelectValue placeholder="Choose a duration" /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Field id="adv-message" label="Anything else? (optional)">
              <Textarea id="adv-message" rows={2} value={form.message} onChange={(e) => set("message")(e.target.value)} />
            </Field>

            {/* Artwork needs an account, because storage will only take a file
                that belongs to somebody. Saying so beats a field that fails. */}
            <div className="space-y-1.5">
              <Label>Advert image, banner or logo (optional)</Label>
              {user ? (
                file ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                    <span className="truncate">{file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)} aria-label="Remove the file">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary">
                    <Upload className="h-4 w-4" />
                    Choose a JPG, PNG, WEBP, AVIF or PDF, up to 10 MB
                    <input type="file" accept={ARTWORK_ACCEPT} className="hidden"
                      onChange={(e) => pickFile(e.target.files?.[0])} />
                  </label>
                )
              ) : (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Sign in to attach artwork, or send this request now and reply to our email with the file.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="button" className="w-full gap-2" size="lg" disabled={saving || !!problem} onClick={submit}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Megaphone className="h-4 w-4" /> Submit Advertising Request</>}
            </Button>
            {problem && <p className="text-center text-xs text-muted-foreground">{problem}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
