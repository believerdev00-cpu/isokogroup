import { Field, NativeSelect } from "@/training/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/training/lib/api";
import type { Program } from "@/training/lib/types";

// Creating a program without leaving the intake: just what a program needs to be
// offered (name, what it is, how long, what it costs). Code and the rest are
// filled in; everything can be refined later under Programs.
export type QuickProgramDraft = {
  name: string;
  description: string;
  category: string;
  duration_value: string;
  duration_unit: "weeks" | "months";
  tuition_fee: string;
  registration_fee: string;
};

export const CATEGORIES = ["Technology", "Creative", "Business", "Languages", "Other"];

export const emptyProgram = (name = ""): QuickProgramDraft => ({
  name,
  description: "",
  category: /soft|web|code|coding|data|computer|it\b|tech|develop|program/i.test(name) ? "Technology" : "Creative",
  duration_value: "3",
  duration_unit: "months",
  tuition_fee: "",
  registration_fee: "",
});

export const programDraftReady = (d: QuickProgramDraft) =>
  d.name.trim().length >= 3 && Number(d.duration_value) >= 1 && d.tuition_fee.trim() !== "" && Number(d.tuition_fee) >= 0;

/** "Software Development for Beginners" → "SDB"; kept 2–8 letters or digits. */
function codeFor(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !["FOR", "AND", "THE", "OF", "IN", "TO", "A"].includes(w));
  let code = words.map((w) => w[0]).join("").slice(0, 6);
  if (code.length < 2) code = (words[0] ?? "PRG").slice(0, 4);
  return code.length < 2 ? "PRG" : code;
}

/** Creates the program; if its code is taken, tries SDB2, SDB3… */
export async function createQuickProgram(d: QuickProgramDraft, seats: number) {
  const base = codeFor(d.name);
  for (let n = 1; n <= 9; n++) {
    const code = n === 1 ? base : `${base.slice(0, 7)}${n}`;
    try {
      return await api.post<Program>("/admin/programs", {
        code,
        name: d.name.trim(),
        category: d.category,
        description: d.description.trim(),
        duration_value: Number(d.duration_value),
        duration_unit: d.duration_unit,
        tuition_fee: Number(d.tuition_fee || 0),
        registration_fee: Number(d.registration_fee || 0),
        max_students: seats,
      });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409 && /code/i.test(e.message))) throw e;
    }
  }
  throw new Error("Couldn't find a free program code. Create the program under Programs.");
}

export function QuickProgramFields({ draft, onChange }: { draft: QuickProgramDraft; onChange: (d: QuickProgramDraft) => void }) {
  const set = (k: keyof QuickProgramDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...draft, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Program name" htmlFor="qp-name" required className="sm:col-span-2" hint="The course people apply for, e.g. Software Development for Beginners">
        <Input id="qp-name" value={draft.name} onChange={set("name")} />
      </Field>
      <Field label="What students learn (optional)" htmlFor="qp-desc" className="sm:col-span-2">
        <Textarea id="qp-desc" rows={2} value={draft.description} onChange={set("description")} placeholder="e.g. Build your first websites with HTML, CSS and JavaScript." />
      </Field>
      <Field label="Duration" htmlFor="qp-duration" required>
        <div className="flex gap-2">
          <Input id="qp-duration" type="number" min={1} inputMode="numeric" className="w-24" value={draft.duration_value} onChange={set("duration_value")} />
          <NativeSelect value={draft.duration_unit} onChange={set("duration_unit")} aria-label="Duration unit">
            <option value="weeks">weeks</option>
            <option value="months">months</option>
          </NativeSelect>
        </div>
      </Field>
      <Field label="Category" htmlFor="qp-category">
        <NativeSelect id="qp-category" value={draft.category} onChange={set("category")}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Tuition fee (RWF)" htmlFor="qp-tuition" required hint="Enter 0 if it's free.">
        <Input id="qp-tuition" type="number" min={0} inputMode="numeric" value={draft.tuition_fee} onChange={set("tuition_fee")} />
      </Field>
      <Field label="Registration fee (RWF)" htmlFor="qp-registration">
        <Input id="qp-registration" type="number" min={0} inputMode="numeric" value={draft.registration_fee} onChange={set("registration_fee")} placeholder="0" />
      </Field>
    </div>
  );
}

const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;

/** A course name guessed from an intake's name: "Software Development for Beginners Intake 2026" → "Software Development for Beginners". */
export const programNameFromIntake = (intakeName: string) =>
  intakeName.replace(/\b(intake|cohort)\b/gi, "").replace(/\b\d{4}\b/g, "").replace(MONTHS, "").replace(/\s{2,}/g, " ").trim();
