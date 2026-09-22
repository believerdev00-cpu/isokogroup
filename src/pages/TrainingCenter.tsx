import { useEffect, useState } from "react";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Clock, BookOpen, CheckCircle2, ClipboardCheck, Users, Award } from "lucide-react";

type Course = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  mode: string;
  price: number;
  duration: string | null;
};

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional(),
  course_title: z.string().min(1),
  mode: z.enum(["online", "physical"]),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
});

const steps = [
  { icon: ClipboardCheck, title: "Apply", text: "Choose a program and send your application online." },
  { icon: Users, title: "Join an intake", text: "Once approved, you join the next class for your program." },
  { icon: BookOpen, title: "Learn by doing", text: "Hands-on lessons with Isoko trainers, online or at our center." },
  { icon: Award, title: "Get certified", text: "Finish the program and receive your Isoko certificate." },
];

const TrainingCenter = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    course_title: "",
    course_id: "",
    mode: "online" as "online" | "physical",
    experience_level: "beginner" as "beginner" | "intermediate" | "advanced",
  });

  const fetchCourses = async () => {
    const { data } = await (supabase as any).from("software_courses").select("*").eq("active", true).order("created_at");
    if (data) setCourses(data);
  };

  useEffect(() => { fetchCourses(); }, []);
  useEffect(() => { if (user?.email) setForm((f) => ({ ...f, email: f.email || user.email! })); }, [user]);

  const openFor = (c: Course) => {
    setForm({ ...form, course_title: c.title, course_id: c.id });
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Please complete the form", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from("course_registrations").insert({
      user_id: user?.id ?? null,
      course_id: form.course_id || null,
      ...parsed.data,
      phone: parsed.data.phone || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Application submitted", description: "The Isoko Training Center team will contact you soon." });
    setOpen(false);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-16">
        <div className="container max-w-6xl">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">Isoko Training Center</span>
            <h1 className="text-3xl md:text-5xl font-display font-bold mt-2">Learn. Build. Launch.</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
              Practical training programs from ISOKO GROUP, taught by our own developers, designers and business team. Online or in person.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{s.text}</p>
              </div>
            ))}
          </div>

          <h2 className="text-2xl font-display font-bold mb-6">Programs</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-10">No programs open yet. Check back soon.</p>
            )}
            {courses.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-6 hover-lift flex flex-col">
                <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4 flex-1">{c.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  <span className="capitalize px-2 py-1 rounded-full bg-muted">{c.level}</span>
                  <span className="capitalize px-2 py-1 rounded-full bg-muted">{c.mode}</span>
                  {c.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.duration}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary">{c.price > 0 ? `${c.price.toLocaleString()} RWF` : "Free"}</span>
                  <Button size="sm" onClick={() => openFor(c)} className="gap-1">
                    <GraduationCap className="h-3 w-3" /> Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply for {form.course_title}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label>Full Name *</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={100} required />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} required />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Mode *</Label>
                    <Select value={form.mode} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="physical">Physical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Experience *</Label>
                    <Select value={form.experience_level} onValueChange={(v: any) => setForm({ ...form, experience_level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full gap-1" disabled={submitting}>
                  <CheckCircle2 className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit Application"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default TrainingCenter;
