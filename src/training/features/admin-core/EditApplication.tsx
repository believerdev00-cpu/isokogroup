import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, NativeSelect } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatMoney } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { Intake, IntakeProgram } from "@/training/lib/types";

export type EditableApplication = {
  id: string;
  intake_id: string;
  intake_program_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string;
  email: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  previous_education: string;
  additional_info: string;
};

const GENDERS = [
  ["", "Not given"], ["female", "Female"], ["male", "Male"], ["other", "Other"], ["prefer_not_to_say", "Prefer not to say"],
] as const;

// Corrects an application still being considered, or moves it to another
// program (in this intake or another running one). The registration fee follows
// the new program; the server records who changed what.
export function EditApplicationDialog({ app, open, onOpenChange }: { app: EditableApplication; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({
    full_name: app.full_name,
    date_of_birth: app.date_of_birth ?? "",
    gender: app.gender ?? "",
    phone: app.phone,
    email: app.email,
    address: app.address,
    emergency_contact_name: app.emergency_contact_name,
    emergency_contact_phone: app.emergency_contact_phone,
    previous_education: app.previous_education,
    additional_info: app.additional_info,
  });
  const [intakeId, setIntakeId] = useState(app.intake_id);
  const [offeringId, setOfferingId] = useState(app.intake_program_id);
  const intakes = useApi<Intake[]>("/admin/intakes");
  const detail = useApi<Intake & { programs: IntakeProgram[] }>(intakeId ? `/admin/intakes/${intakeId}` : null);
  const running = (intakes.data ?? []).filter((i) => !["completed", "archived"].includes(i.status) || i.id === app.intake_id);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const save = useApiMutation(
    () => api.patch(`/admin/applications/${app.id}`, {
      ...form,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      intake_program_id: offeringId,
    }),
    {
      invalidate: ["/admin/applications", "/admin/intakes", "/admin/dashboard"],
      success: offeringId !== app.intake_program_id ? "Application moved" : "Application updated",
      onSuccess: () => onOpenChange(false),
    },
  );
  const ready = form.full_name.trim().length >= 3 && form.phone.trim() && form.email.trim() && !!offeringId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit application</DialogTitle>
          <DialogDescription>Correct the applicant's details, or move the application to another program. The registration fee follows the program.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Intake" htmlFor="ea-intake" required>
            <NativeSelect id="ea-intake" value={intakeId} onChange={(e) => { setIntakeId(e.target.value); setOfferingId(""); }}>
              {running.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Program" htmlFor="ea-program" required>
            <NativeSelect id="ea-program" value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
              <option value="">Choose a program…</option>
              {(detail.data?.programs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.program_name} · {o.available_seats} seats left · registration {formatMoney(o.registration_fee ?? o.program_registration_fee)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Full name" htmlFor="ea-name" required>
            <Input id="ea-name" value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Email" htmlFor="ea-email" required>
            <Input id="ea-email" type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone" htmlFor="ea-phone" required>
            <Input id="ea-phone" type="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Date of birth" htmlFor="ea-dob">
            <Input id="ea-dob" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} />
          </Field>
          <Field label="Gender" htmlFor="ea-gender">
            <NativeSelect id="ea-gender" value={form.gender} onChange={set("gender")}>
              {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Address" htmlFor="ea-address">
            <Input id="ea-address" value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Emergency contact name" htmlFor="ea-ec-name">
            <Input id="ea-ec-name" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
          </Field>
          <Field label="Emergency contact phone" htmlFor="ea-ec-phone">
            <Input id="ea-ec-phone" type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
          </Field>
          <Field label="Previous education" htmlFor="ea-edu" className="sm:col-span-2">
            <Input id="ea-edu" value={form.previous_education} onChange={set("previous_education")} />
          </Field>
          <Field label="Additional information" htmlFor="ea-info" className="sm:col-span-2">
            <Textarea id="ea-info" rows={3} value={form.additional_info} onChange={set("additional_info")} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !ready}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
