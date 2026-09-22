import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Plus, Power, Trash2 } from "lucide-react";

// Training Center programs are stored in software_courses and
// applications in course_registrations (RLS: admins manage both).
type Program = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  mode: string;
  price: number;
  duration: string | null;
  active: boolean;
};

type Application = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  course_title: string;
  mode: string;
  experience_level: string;
  status: string;
  created_at: string;
};

const STATUSES = ["pending", "approved", "enrolled", "completed", "rejected"];

const statusVariant = (s: string) =>
  s === "rejected" ? "destructive" : s === "pending" ? "secondary" : "default";

const emptyForm = { title: "", description: "", level: "beginner", mode: "online", price: "", duration: "" };

const TrainingCenterAdmin = () => {
  const { toast } = useToast();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, a] = await Promise.all([
      (supabase as any).from("software_courses").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("course_registrations").select("*").order("created_at", { ascending: false }),
    ]);
    if (!p.error) setPrograms((p.data ?? []) as Program[]);
    if (!a.error) setApplications((a.data ?? []) as Application[]);
  };

  useEffect(() => { load(); }, []);

  const addProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from("software_courses").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      level: form.level,
      mode: form.mode,
      price: Math.max(0, parseInt(form.price || "0", 10) || 0),
      duration: form.duration.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not add program", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Program added" });
    setForm(emptyForm);
    load();
  };

  const toggleProgram = async (p: Program) => {
    const { error } = await (supabase as any).from("software_courses").update({ active: !p.active }).eq("id", p.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  const deleteProgram = async (p: Program) => {
    if (!confirm(`Delete the program "${p.title}"? Existing applications are kept.`)) return;
    const { error } = await (supabase as any).from("software_courses").delete().eq("id", p.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else load();
  };

  const setStatus = async (a: Application, status: string) => {
    const { error } = await (supabase as any).from("course_registrations").update({ status }).eq("id", a.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  const pending = applications.filter((a) => a.status === "pending").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Training Center Programs ({programs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addProgram} className="mb-6 p-4 border border-border rounded-lg space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Add program</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input value={form.duration} placeholder="e.g. 8 weeks" onChange={(e) => setForm({ ...form, duration: e.target.value })} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label>Fee (RWF, 0 = free)</Label>
                <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="physical">Physical</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
              </div>
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Program"}</Button>
          </form>

          {programs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No programs yet. Add one above to show it on the Training Center page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.title}</div>
                      {p.description && <div className="text-xs text-muted-foreground line-clamp-2 max-w-xs">{p.description}</div>}
                    </TableCell>
                    <TableCell className="capitalize">{p.level}</TableCell>
                    <TableCell className="capitalize">{p.mode}</TableCell>
                    <TableCell>{p.duration || "—"}</TableCell>
                    <TableCell>{p.price > 0 ? `${p.price.toLocaleString()} RWF` : "Free"}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Open" : "Hidden"}</Badge>
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => toggleProgram(p)}>
                        <Power className="h-3 w-3" /> {p.active ? "Hide" : "Open"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteProgram(p)} aria-label={`Delete ${p.title}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applications ({applications.length}{pending > 0 ? `, ${pending} pending` : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.full_name}</div>
                      <div className="text-xs text-muted-foreground">{a.email}{a.phone ? ` · ${a.phone}` : ""}</div>
                    </TableCell>
                    <TableCell>{a.course_title}</TableCell>
                    <TableCell className="capitalize">{a.mode}</TableCell>
                    <TableCell className="capitalize">{a.experience_level}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(a.status)} className="capitalize">{a.status}</Badge>
                        <Select value={a.status} onValueChange={(v) => setStatus(a, v)}>
                          <SelectTrigger className="h-8 w-32" aria-label={`Status for ${a.full_name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainingCenterAdmin;
