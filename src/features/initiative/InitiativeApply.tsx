import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import { errorText } from "@/features/services/api";
import {
  APPLICANT_STATUS_LABEL, FOCUS_AREAS, areaOf, classificationLabel, isValidClassification, subcategoryOf,
} from "@/lib/initiative";
import {
  DOCUMENT_TYPES, INITIATIVE, INITIATIVE_NAME, MAX_DOCUMENT_BYTES, submitApplication, useMyApplications,
} from "./api";
import { ArrowRight, CheckCircle, Clock, Upload, X, XCircle } from "lucide-react";

// The bucket enforces the same size and the same four kinds of file, so a file
// refused here would be refused again by the server.

/** Applying for Global Initiative support. No money is handled here. */
export default function InitiativeApply() {
  useSeo({
    title: `Apply for project support — ${INITIATIVE_NAME}`,
    description: "Tell ISOKO GROUP about your project and which focus area it belongs to.",
    canonical: `${INITIATIVE}/apply`,
    noindex: true,
  });

  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = useMyApplications(user?.id);

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [areaKey, setAreaKey] = useState("");
  const [subKey, setSubKey] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [doc, setDoc] = useState<File | null>(null);

  const area = useMemo(() => areaOf(areaKey), [areaKey]);
  const sub = useMemo(() => subcategoryOf(area, subKey), [area, subKey]);
  const items = sub?.items ?? [];

  const pending = (mine.data ?? []).find((a) => a.status === "submitted");

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!DOCUMENT_TYPES.includes(f.type)) {
      toast({ title: "Invalid file type", description: "Upload a JPG, PNG, WEBP or PDF file.", variant: "destructive" });
      return;
    }
    if (f.size > MAX_DOCUMENT_BYTES) {
      toast({ title: "File too large", description: "Keep the document under 5MB.", variant: "destructive" });
      return;
    }
    setDoc(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!isValidClassification(areaKey, subKey, itemKey || null)) {
      toast({ title: "Choose a focus area", description: "Pick an area, a subcategory, and an option where one is offered.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await submitApplication(
        user.id,
        {
          title: title.trim(),
          description: description.trim(),
          focus_area: areaKey,
          subcategory: subKey,
          item: items.length > 0 ? itemKey : null,
          location: location.trim(),
          amount_required: Number(amount),
        },
        doc,
      );
      toast({ title: "Application submitted", description: "ISOKO GROUP will review your project and get back to you." });
      navigate(INITIATIVE);
    } catch (err) {
      toast({ title: "Could not submit", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-br from-background via-background to-card">
          <div className="container py-16 md:py-20">
            <div className="max-w-3xl space-y-4">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">{INITIATIVE_NAME}</span>
              <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl lg:text-5xl">
                Apply for project support
              </h1>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Tell us about your project and which focus area it belongs to. Our team reviews every
                application and will let you know the outcome.
              </p>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container max-w-3xl">
            {authLoading || (user && mine.isLoading) ? (
              <div className="flex justify-center py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              </div>
            ) : !user ? (
              <div className="space-y-4 rounded-xl border border-border bg-card p-8 text-center">
                <h2 className="text-xl font-semibold">Sign in to apply</h2>
                <p className="text-muted-foreground">
                  You need an ISOKO GROUP account so we can keep you updated on your application.
                </p>
                <Link to="/login">
                  <Button size="lg" className="gap-2">Sign in or register <ArrowRight className="h-4 w-4" /></Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-8">
                {(mine.data ?? []).length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold">Your applications</h2>
                    {(mine.data ?? []).map((row) => (
                      <div key={row.id} className="space-y-2 rounded-xl border border-border bg-card p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{row.title}</p>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs">
                            {row.status === "submitted" && <Clock className="h-3.5 w-3.5 text-primary" />}
                            {row.status === "rejected" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                            {!["submitted", "rejected"].includes(row.status) && <CheckCircle className="h-3.5 w-3.5 text-primary" />}
                            {APPLICANT_STATUS_LABEL[row.status] ?? row.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{classificationLabel(row)}</p>
                        {row.rejection_reason && (
                          <p className="text-sm text-muted-foreground">Reason: {row.rejection_reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {pending ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
                    <Clock className="mx-auto h-6 w-6 text-primary" />
                    <p className="font-semibold">Your application is under review</p>
                    <p className="text-sm text-muted-foreground">
                      You can submit another project once this one has been reviewed.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={submit} className="space-y-6 rounded-xl border border-border bg-card p-6 md:p-8">
                    <div className="space-y-2">
                      <Label htmlFor="title">Project title</Label>
                      <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                        placeholder="A short name for your project" required minLength={5} maxLength={160} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Focus area</Label>
                        <Select value={areaKey} onValueChange={(v) => { setAreaKey(v); setSubKey(""); setItemKey(""); }}>
                          <SelectTrigger><SelectValue placeholder="Choose an area" /></SelectTrigger>
                          <SelectContent>
                            {FOCUS_AREAS.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Subcategory</Label>
                        <Select value={subKey} onValueChange={(v) => { setSubKey(v); setItemKey(""); }} disabled={!area}>
                          <SelectTrigger>
                            <SelectValue placeholder={area ? "Choose a subcategory" : "Pick an area first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(area?.subcategories ?? []).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {items.length > 0 && (
                      <div className="space-y-2">
                        <Label>{sub?.label}</Label>
                        <Select value={itemKey} onValueChange={setItemKey}>
                          <SelectTrigger><SelectValue placeholder="Choose an option" /></SelectTrigger>
                          <SelectContent>
                            {items.map((i) => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="description">Describe the project</Label>
                      <Textarea id="description" rows={6} value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="What will you do, who does it help, and what will the support pay for?"
                        required minLength={40} maxLength={5000} />
                      <p className="text-xs text-muted-foreground">{description.trim().length}/40 characters minimum</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. city and country" required maxLength={160} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount needed (RWF)</Label>
                        <Input id="amount" type="number" min={1} step={1} value={amount}
                          onChange={(e) => setAmount(e.target.value)} placeholder="500000" required />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Supporting document (optional)</Label>
                      {doc ? (
                        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                          <span className="truncate text-sm">{doc.name}</span>
                          <Button type="button" variant="ghost" size="icon" aria-label="Remove the attached document"
                            onClick={() => setDoc(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                          <Upload className="h-4 w-4" /> Upload a plan, quote or proposal
                        </Button>
                      )}
                      <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={pickFile} />
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG, WEBP or PDF, up to 5MB. Only you and the ISOKO GROUP review team can open it.
                      </p>
                    </div>

                    <Button type="submit" size="lg" className="w-full" disabled={saving}>
                      {saving ? "Submitting…" : "Submit application"}
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
