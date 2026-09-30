import { useState, type FormEvent } from "react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Pill, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatDateTime } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { Announcement, ClassSummary } from "@/training/lib/types";
import { useIntakes } from "@/training/features/admin-ops/lookups";

const AUDIENCE: Record<Announcement["audience"], string> = {
  all: "Everyone",
  students: "All students",
  trainers: "All trainers",
  intake: "Students of one intake",
  class: "One class",
};

export default function Announcements() {
  const q = useApi<Announcement[]>("/admin/announcements");
  const intakes = useIntakes();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "students" as Announcement["audience"], intake_id: "", class_id: "" });
  const classes = useApi<ClassSummary[]>(creating && form.audience === "class" ? "/admin/classes?status=active" : null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  // correcting the text of one already sent (its audience stays; nobody is notified again)
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const edit = useApiMutation(() => api.patch(`/admin/announcements/${editing!.id}`, draft), {
    invalidate: ["/admin/announcements"],
    success: "Announcement updated",
    onSuccess: () => setEditing(null),
  });

  const create = useApiMutation(
    () =>
      api.post("/admin/announcements", {
        title: form.title,
        body: form.body,
        audience: form.audience,
        intake_id: form.audience === "intake" ? form.intake_id : null,
        class_id: form.audience === "class" ? form.class_id : null,
      }),
    {
      invalidate: ["/admin/announcements"],
      success: "Announcement sent",
      onSuccess: () => {
        setCreating(false);
        setForm({ title: "", body: "", audience: "students", intake_id: "", class_id: "" });
      },
    },
  );
  const remove = useApiMutation((id: string) => api.delete(`/admin/announcements/${id}`), {
    invalidate: ["/admin/announcements"],
    success: "Announcement deleted",
    onSuccess: () => setDeleting(null),
  });

  const valid =
    form.title.trim().length >= 2 &&
    form.body.trim().length >= 2 &&
    (form.audience !== "intake" || form.intake_id) &&
    (form.audience !== "class" || form.class_id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Messages appear in the students' and trainers' portals and in their notifications."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New announcement</Button>}
      />
      <QueryView query={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Send a message to everyone, all students, one intake or a single class."
              action={<Button onClick={() => setCreating(true)}>New announcement</Button>}
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((a) => (
                <li key={a.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{a.title}</h2>
                        <Pill tone="primary">
                          {a.audience === "class" ? `Class ${a.class_code ?? ""}` : a.audience === "intake" ? a.intake_name ?? "Intake" : AUDIENCE[a.audience]}
                        </Pill>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {a.author ?? "—"} · {formatDateTime(a.created_at)}
                        {a.updated_at && <> · edited {formatDateTime(a.updated_at)}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${a.title}`} onClick={() => { setEditing(a); setDraft({ title: a.title, body: a.body }); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>Everyone in the audience gets a notification.</DialogDescription>
          </DialogHeader>
          <form id="announcement" onSubmit={submit} className="space-y-4">
            <Field label="Who should see it?" htmlFor="a-audience" required>
              <NativeSelect id="a-audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as Announcement["audience"] })}>
                {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            {form.audience === "intake" && (
              <Field label="Intake" htmlFor="a-intake" required>
                <NativeSelect id="a-intake" value={form.intake_id} onChange={(e) => setForm({ ...form, intake_id: e.target.value })}>
                  <option value="">Choose an intake…</option>
                  {intakes.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </NativeSelect>
              </Field>
            )}
            {form.audience === "class" && (
              <Field label="Class" htmlFor="a-class" required>
                <NativeSelect id="a-class" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                  <option value="">Choose a class…</option>
                  {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.program_name}</option>)}
                </NativeSelect>
              </Field>
            )}
            <Field label="Title" htmlFor="a-title" required>
              <Input id="a-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Message" htmlFor="a-body" required>
              <Textarea id="a-body" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
          </form>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="announcement" disabled={!valid || create.isPending}>Send announcement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit announcement</DialogTitle>
            <DialogDescription>The corrected text replaces the old one in everyone's portal. Nobody is notified again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Title" htmlFor="e-title" required>
              <Input id="e-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Message" htmlFor="e-body" required>
              <Textarea id="e-body" rows={5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => edit.mutate()} disabled={edit.isPending || draft.title.trim().length < 2 || draft.body.trim().length < 2}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="It will disappear from everyone's portal."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
