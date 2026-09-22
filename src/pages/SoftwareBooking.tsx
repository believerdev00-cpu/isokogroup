import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { IctWhatsAppFloat, IctWhatsAppNotice } from "@/components/IctWhatsApp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Info } from "lucide-react";

const SERVICE_TYPES = ["Web Design", "Web Development", "Mobile App Development", "UI/UX Design", "Maintenance"];
const BUDGET_RANGES = ["< $500", "$500 – $1,000", "$1,000 – $5,000", "$5,000 – $10,000", "$10,000+"];

const schema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().min(7, "Phone is required").max(30),
  service_type: z.string().min(1, "Select a service"),
  project_description: z.string().trim().min(10, "Describe your project").max(2000),
  budget_range: z.string().optional(),
  preferred_deadline: z.string().optional(),
  consultation_type: z.enum(["online", "physical"]),
  consultation_date: z.string().optional(),
});

const SoftwareBooking = () => {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    service_type: params.get("service") || "",
    project_description: "",
    budget_range: "",
    preferred_deadline: "",
    consultation_type: "online" as "online" | "physical",
    consultation_date: "",
  });

  useEffect(() => {
    if (user?.email) setForm((f) => ({ ...f, email: f.email || user.email! }));
  }, [user]);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      toast({ title: "Please fix the form", description: first, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const payload: any = {
      ...parsed.data,
      user_id: user?.id ?? null,
      preferred_deadline: parsed.data.preferred_deadline || null,
      consultation_date: parsed.data.consultation_date || null,
      budget_range: parsed.data.budget_range || null,
    };
    const { error } = await (supabase as any).from("software_bookings").insert(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-16">
        <div className="container max-w-5xl">
          <div className="text-center mb-10">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">Booking</span>
            <h1 className="text-3xl md:text-4xl font-display font-bold mt-2">Book a Consultation</h1>
            <p className="text-muted-foreground mt-2">Tell us about your project — we'll get back to you to schedule a meeting.</p>
          </div>

          <IctWhatsAppNotice topic="a software project" className="mb-8" />

          {submitted ? (
            <div className="max-w-xl mx-auto rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
              <h2 className="text-2xl font-display font-bold">Booking submitted successfully!</h2>
              <p className="text-muted-foreground mt-2">
                We will review your request and contact you for consultation.
              </p>
              <div className="mt-6 flex gap-3 justify-center">
                <Link to="/software"><Button variant="outline">Back to Software</Button></Link>
                <Button onClick={() => { setSubmitted(false); setForm({ ...form, project_description: "" }); }}>Submit another</Button>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8">
              <form onSubmit={onSubmit} className="lg:col-span-2 rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name *</Label>
                    <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} maxLength={100} required />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} maxLength={255} required />
                  </div>
                  <div>
                    <Label>Phone *</Label>
                    <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} maxLength={30} required />
                  </div>
                  <div>
                    <Label>Service Type *</Label>
                    <Select value={form.service_type} onValueChange={(v) => update("service_type", v)}>
                      <SelectTrigger><SelectValue placeholder="Choose service" /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Project Description *</Label>
                  <Textarea rows={5} value={form.project_description} onChange={(e) => update("project_description", e.target.value)} maxLength={2000} required />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Budget Range</Label>
                    <Select value={form.budget_range} onValueChange={(v) => update("budget_range", v)}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        {BUDGET_RANGES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Preferred Deadline</Label>
                    <Input type="date" value={form.preferred_deadline} onChange={(e) => update("preferred_deadline", e.target.value)} />
                  </div>
                  <div>
                    <Label>Consultation Type *</Label>
                    <Select value={form.consultation_type} onValueChange={(v) => update("consultation_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="physical">Physical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Consultation Date</Label>
                    <Input type="date" value={form.consultation_date} onChange={(e) => update("consultation_date", e.target.value)} />
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Booking"}
                </Button>
              </form>

              <aside className="rounded-xl border border-primary/30 bg-primary/5 p-6 h-fit">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Payment Policy</h3>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Consultation is <strong className="text-foreground">free</strong>.</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> After agreement, <strong className="text-foreground">50% payment is required to start</strong> the project.</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> The remaining <strong className="text-foreground">50% is paid after project completion</strong>.</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-4">
                  This sets clear expectations from day one and protects both parties.
                </p>
              </aside>
            </div>
          )}
        </div>
      </section>
      <IctWhatsAppFloat topic="a software project" />
      <Footer />
    </div>
  );
};

export default SoftwareBooking;
