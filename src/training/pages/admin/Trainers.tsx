import { useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, UserCog } from "lucide-react";
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatDateTime } from "@/training/lib/format";
import { useApiMutation } from "@/training/lib/query";
import { useTrainers, type Trainer } from "@/training/features/admin-ops/lookups";
import CredentialsDialog, { type Credentials } from "@/training/features/admin-ops/CredentialsDialog";

type Form = { full_name: string; email: string; phone: string; specialization: string; bio: string };
const EMPTY: Form = { full_name: "", email: "", phone: "", specialization: "", bio: "" };
const KEYS = ["/admin/trainers", "/admin/classes", "/admin/dashboard"];

export default function Trainers() {
  const q = useTrainers();
  const [editing, setEditing] = useState<Trainer | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [resetting, setResetting] = useState<Trainer | null>(null);

  const open = (t: Trainer | "new") => {
    setEditing(t);
    setForm(
      t === "new"
        ? EMPTY
        : { full_name: t.full_name, email: t.email, phone: t.phone ?? "", specialization: t.specialization ?? "", bio: t.bio ?? "" },
    );
  };

  const create = useApiMutation(
    () =>
      api.post<{ id: string; login: { email: string; temporary_password: string | null } }>("/admin/trainers", {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        specialization: form.specialization || null,
        bio: form.bio || null,
      }),
    {
      invalidate: KEYS,
      // An existing Isoko account keeps its own password: nothing to hand over
      success: (r) => (r.login.temporary_password ? "Trainer added" : `Trainer added. ${form.full_name} signs in with their existing Isoko account.`),
      onSuccess: (r) => {
        const password = r.login.temporary_password;
        if (password) setCredentials({ name: form.full_name, email: r.login.email, temporary_password: password });
        setEditing(null);
      },
    },
  );
  const update = useApiMutation(
    (v: { id: string; body: Record<string, unknown> }) => api.patch(`/admin/trainers/${v.id}`, v.body),
    { invalidate: KEYS, success: "Trainer updated", onSuccess: () => setEditing(null) },
  );
  const reset = useApiMutation((t: Trainer) => api.post<{ email: string; temporary_password: string }>(`/admin/trainers/${t.id}/reset-password`), {
    onSuccess: (r) => {
      setCredentials({ name: resetting?.full_name ?? "", ...r });
      setResetting(null);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (editing === "new") create.mutate();
    else if (editing)
      update.mutate({
        id: editing.id,
        body: { full_name: form.full_name, phone: form.phone || null, specialization: form.specialization || null, bio: form.bio || null },
      });
  };
  const valid = form.full_name.trim().length >= 3 && /\S+@\S+\.\S+/.test(form.email);

  return (
    <div>
      <PageHeader
        title="Trainers"
        subtitle="Trainers sign in to see only their own classes, take attendance and record results."
        actions={<Button onClick={() => open("new")}><Plus className="h-4 w-4" /> Add trainer</Button>}
      />
      <QueryView query={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title="No trainers yet"
              description="Add a trainer to create their login, then assign them to classes."
              action={<Button onClick={() => open("new")}>Add trainer</Button>}
            />
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trainer</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Specialization</TableHead>
                      <TableHead className="text-right">Active classes</TableHead>
                      <TableHead>Last sign-in</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t) => (
                      <TableRow key={t.id} className={t.is_active ? "" : "opacity-60"}>
                        <TableCell className="font-semibold">
                          {t.full_name}
                          {!t.is_active && <StatusBadge status="archived" label="Inactive" className="ml-2" />}
                        </TableCell>
                        <TableCell>
                          <p>{t.email}</p>
                          <p className="text-xs text-muted-foreground">{t.phone ?? "—"}</p>
                        </TableCell>
                        <TableCell>{t.specialization ?? "—"}</TableCell>
                        <TableCell className="tabular text-right">
                          {t.active_classes}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{t.last_login_at ? formatDateTime(t.last_login_at) : "Never"}</TableCell>
                        <TableCell>
                          <Switch
                            checked={t.is_active}
                            aria-label={t.is_active ? `Deactivate ${t.full_name}` : `Activate ${t.full_name}`}
                            onCheckedChange={(v) => update.mutate({ id: t.id, body: { is_active: v } })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => open(t)} aria-label={`Edit ${t.full_name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setResetting(t)}>
                              <KeyRound className="h-4 w-4" /> Reset password
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </div>
          )
        }
      </QueryView>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add trainer" : "Edit trainer"}</DialogTitle>
          </DialogHeader>
          <form id="trainer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="t-name" required className="sm:col-span-2">
              <Input id="t-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="t-email" required hint={editing === "new" ? "They sign in with this email" : "Email can't be changed"}>
              <Input id="t-email" type="email" disabled={editing !== "new"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone" htmlFor="t-phone">
              <Input id="t-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Specialization" htmlFor="t-spec" className="sm:col-span-2" hint="e.g. Web development">
              <Input id="t-spec" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            </Field>
            <Field label="Short bio" htmlFor="t-bio" className="sm:col-span-2">
              <Textarea id="t-bio" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </Field>
          </form>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="trainer-form" disabled={!valid || create.isPending || update.isPending}>
              {editing === "new" ? "Add trainer" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Reset ${resetting?.full_name ?? ""}'s password?`}
        description="They'll be signed out and get a new temporary password, which you'll see once."
        confirmLabel="Reset password"
        pending={reset.isPending}
        onConfirm={() => resetting && reset.mutate(resetting)}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}
