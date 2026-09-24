import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Copy, FileUp, Loader2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, Field, NativeSelect, QueryView, SeatsMeter, StatusBadge } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { goldButton, IntakeFacts } from "@/training/features/public/shared";
import { api } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";
import { formatDuration, formatLongDate, formatMoney, humanize } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { PublicIntake } from "@/training/lib/types";
import { cn } from "@/lib/utils";

const STEPS = ["Choose Intake", "Choose Program", "Personal Information", "Review", "Submit"];

type Person = {
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  previous_education: string;
  additional_info: string;
};

const EMPTY: Person = {
  full_name: "",
  date_of_birth: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  previous_education: "",
  additional_info: "",
};

const GENDERS = [
  ["female", "Female"],
  ["male", "Male"],
  ["other", "Other"],
  ["prefer_not_to_say", "Prefer not to say"],
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_AGE = 14;

/**
 * A phone number we can really call: Rwandan mobiles (07X… or +250 7X…, 9 digits
 * after the country code) or a full international number (+ and 8–15 digits).
 */
function validPhone(raw: string) {
  const v = raw.trim().replace(/[\s-]/g, "");
  if (/^0?7[2389]\d{7}$/.test(v)) return true;
  if (/^\+?2507[2389]\d{7}$/.test(v)) return true;
  return /^\+(?!250)[1-9]\d{7,14}$/.test(v);
}
const phoneDigits = (v: string) => v.replace(/\D/g, "").replace(/^(250|0)/, "");

function yearsSince(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}
const DOC_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_MB = 8;

// Same rules as the server, so people see problems before submitting.
function validatePerson(p: Person, doc: File | null, requireDoc: boolean) {
  const e: Partial<Record<keyof Person | "document", string>> = {};
  if (p.full_name.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) e.full_name = "Enter your first and last name";
  if (p.date_of_birth) {
    const age = yearsSince(p.date_of_birth);
    if (Number.isNaN(age) || age > 100 || p.date_of_birth > new Date().toISOString().slice(0, 10)) e.date_of_birth = "Enter a valid date of birth";
    else if (age < MIN_AGE) e.date_of_birth = `Applicants must be at least ${MIN_AGE} years old`;
  }
  if (!validPhone(p.phone)) e.phone = "Enter a valid phone number, e.g. 0788 123 456 or +250 788 123 456";
  if (!EMAIL.test(p.email.trim())) e.email = "Enter a valid email address, e.g. name@gmail.com";
  if (p.address.trim().length < 3) e.address = "Enter your address, e.g. Gasabo, Kimironko";
  if (p.emergency_contact_name.trim().length < 2) e.emergency_contact_name = "Enter the name of someone we can call";
  if (!validPhone(p.emergency_contact_phone)) e.emergency_contact_phone = "Enter a valid phone number for your emergency contact";
  else if (validPhone(p.phone) && phoneDigits(p.phone) === phoneDigits(p.emergency_contact_phone)) e.emergency_contact_phone = "Use someone else's number, not your own";
  if (p.previous_education.trim().length < 2) e.previous_education = "Tell us your highest education";
  if (p.additional_info.length > 2000) e.additional_info = "Keep this under 2000 characters";
  if (requireDoc && !doc) e.document = "Please attach your identification document";
  if (doc) {
    const ext = doc.name.slice(doc.name.lastIndexOf(".")).toLowerCase();
    if (!DOC_EXTS.includes(ext)) e.document = "Upload a PDF, JPG, PNG or WEBP file";
    else if (doc.size > MAX_MB * 1024 * 1024) e.document = `The file must be smaller than ${MAX_MB} MB`;
  }
  return e;
}

// The order the form shows its fields, to jump to the first one that needs fixing
const FIELD_ORDER: (keyof Person | "document")[] = [
  "full_name", "date_of_birth", "phone", "email", "address",
  "emergency_contact_name", "emergency_contact_phone", "previous_education", "document", "additional_info",
];

function StepIndicator({ step }: { step: number }) {
  return (
    <nav aria-label="Application steps" className="mb-8">
      <p className="mb-3 text-sm font-medium text-muted-foreground sm:hidden">
        Step {step} of {STEPS.length}: <span className="text-foreground">{STEPS[step - 1]}</span>
      </p>
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-1 sm:gap-2" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-gold bg-gold-soft text-accent-foreground",
                  !done && !current && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : n}
              </span>
              <span className={cn("hidden text-xs font-medium lg:inline", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {n < STEPS.length && <span className={cn("h-0.5 flex-1 rounded", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onEdit}>
          Edit
        </Button>
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1.5 text-sm sm:grid-cols-3 sm:gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-words font-medium sm:col-span-2">{v || "—"}</dd>
    </div>
  );
}

type Submitted = { reference: string; submitted_at: string; program: string; intake: string };

export default function Apply() {
  const [params] = useSearchParams();
  const intakesQ = useApi<PublicIntake[]>("/public/intakes");
  const center = useCenter().data;
  const currency = center?.currency ?? "RWF";
  const requireDoc = center?.require_document ?? false;

  const [step, setStep] = useState(1);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [person, setPerson] = useState<Person>(EMPTY);
  const [doc, setDoc] = useState<File | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validatePerson>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Submitted | null>(null);
  const initialised = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const intakes = intakesQ.data ?? [];
  const intake = intakes.find((i) => i.id === intakeId) ?? null;
  const offering = intake?.programs.find((p) => p.intake_program_id === offeringId) ?? null;

  // Preselect from the link (?intake=slug&program=id) once the intakes have loaded
  useEffect(() => {
    if (initialised.current || !intakesQ.data) return;
    initialised.current = true;
    const list = intakesQ.data;
    const bySlug = list.find((i) => i.slug === params.get("intake"));
    const chosen = bySlug ?? (list.length === 1 ? list[0] : undefined);
    if (!chosen) return;
    setIntakeId(chosen.id);
    const prog = chosen.programs.find((p) => p.intake_program_id === params.get("program") && !p.is_full);
    if (prog) {
      setOfferingId(prog.intake_program_id);
      setStep(3);
    } else {
      setStep(2);
    }
  }, [intakesQ.data, params]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const go = (n: number) => {
    setSubmitError(null);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const set = (k: keyof Person) => (v: string) => {
    setPerson((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Check a field as soon as it is left, once something was typed in it
  const checkField = (k: keyof Person) => {
    if (!person[k].trim()) return;
    const msg = validatePerson(person, doc, false)[k];
    setErrors((e) => ({ ...e, [k]: msg }));
  };

  // Leaving mid-application loses what was typed, so the browser asks first
  const dirty = !done && (step === 3 || step === 4) && Object.values(person).some((v) => v.trim());
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const continueFromDetails = () => {
    const e = validatePerson(person, doc, requireDoc);
    setErrors(e);
    const firstBad = FIELD_ORDER.find((k) => e[k]);
    if (firstBad) {
      const count = Object.values(e).filter(Boolean).length;
      toast.error(count === 1 ? "Please correct the highlighted field" : `Please correct the ${count} highlighted fields`);
      const el = document.getElementById(firstBad);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    go(4);
  };

  const submit = async () => {
    if (!offering) return;
    setSubmitting(true);
    setSubmitError(null);
    const form = new FormData();
    form.set("intake_program_id", offering.intake_program_id);
    for (const [k, v] of Object.entries(person)) {
      const value = v.trim();
      if (value || k === "additional_info") form.set(k, value);
    }
    if (doc) form.set("document", doc);
    try {
      setDone(await api.upload<Submitted>("/public/applications", form));
      go(5);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const copyReference = async () => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.reference);
      toast.success("Application number copied");
    } catch {
      toast.error("Couldn't copy. Please write the number down.");
    }
  };

  const fieldProps = (k: keyof Person) => ({
    id: k,
    value: person[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value),
    onBlur: () => checkField(k),
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
  });

  return (
    <div className="container max-w-4xl py-8 sm:py-12">
      <h1 className="page-title">Apply to Isoko Training Center</h1>
      <p className="page-subtitle">No account needed. It takes about five minutes.</p>
      <div className="mt-8">
        <StepIndicator step={step} />
      </div>

      <QueryView query={intakesQ}>
        {() =>
          intakes.length === 0 && !done ? (
            <EmptyState
              title="No intakes are open for applications right now"
              description="Please check back soon, or contact us to be told when the next intake opens."
              action={<Button asChild variant="outline"><Link to="/training-center/contact">Contact us</Link></Button>}
            />
          ) : (
            <>
              {/* STEP 1: intake */}
              {step === 1 && (
                <section aria-labelledby="step-title">
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">Choose an intake</h2>
                  <div className="space-y-3" role="radiogroup" aria-labelledby="step-title">
                    {intakes.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        role="radio"
                        aria-checked={intakeId === i.id}
                        onClick={() => {
                          if (intakeId !== i.id) setOfferingId(null);
                          setIntakeId(i.id);
                        }}
                        className={cn(
                          "w-full rounded-xl border-2 bg-card p-4 text-left transition-colors sm:p-5",
                          intakeId === i.id ? "border-primary bg-secondary/40" : "border-border hover:border-primary/40",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-bold">{i.name}</span>
                          <StatusBadge status="open" label="Applications Open" />
                        </div>
                        <p className="mb-3 mt-1 text-sm text-muted-foreground">
                          {i.programs.filter((p) => !p.is_full).length} programs with seats available
                        </p>
                        <IntakeFacts intake={i} />
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-end">
                    <Button size="lg" disabled={!intakeId} onClick={() => go(2)}>Continue</Button>
                  </div>
                </section>
              )}

              {/* STEP 2: program */}
              {step === 2 && intake && (
                <section aria-labelledby="step-title">
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">Choose a program</h2>
                  <p className="mb-4 mt-1 text-sm text-muted-foreground">{intake.name}</p>
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="step-title">
                    {intake.programs.map((p) => (
                      <button
                        key={p.intake_program_id}
                        type="button"
                        role="radio"
                        aria-checked={offeringId === p.intake_program_id}
                        aria-disabled={p.is_full}
                        disabled={p.is_full}
                        onClick={() => setOfferingId(p.intake_program_id)}
                        className={cn(
                          "rounded-xl border-2 bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          offeringId === p.intake_program_id ? "border-primary bg-secondary/40" : "border-border enabled:hover:border-primary/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold">{p.name}</span>
                          {p.is_full && <StatusBadge status="full" label="FULL" />}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {formatDuration(p.duration_value, p.duration_unit)}
                          {p.schedule && ` · ${p.schedule}`}
                        </p>
                        <div className="my-3">
                          <SeatsMeter enrolled={p.enrolled} capacity={p.capacity} compact />
                        </div>
                        <p className="text-sm">
                          Tuition <span className="font-semibold">{formatMoney(p.tuition_fee, currency)}</span> · Registration{" "}
                          <span className="font-semibold">{formatMoney(p.registration_fee, currency)}</span>
                        </p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-between gap-3">
                    <Button variant="outline" size="lg" onClick={() => go(1)}>Back</Button>
                    <Button size="lg" disabled={!offering} onClick={() => go(3)}>Continue</Button>
                  </div>
                </section>
              )}

              {/* STEP 3: personal information */}
              {step === 3 && intake && offering && (
                <section aria-labelledby="step-title">
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">Your information</h2>
                  <p className="mb-5 mt-1 text-sm text-muted-foreground">
                    Applying for <span className="font-semibold text-foreground">{offering.name}</span> · {intake.name}{" "}
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => go(2)}>Change</button>
                  </p>
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      continueFromDetails();
                    }}
                    className="space-y-6"
                  >
                    <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
                      <legend className="px-1 text-sm font-semibold">About you</legend>
                      <Field label="Full name" htmlFor="full_name" required error={errors.full_name} className="sm:col-span-2">
                        <Input {...fieldProps("full_name")} autoComplete="name" placeholder="First and last name" />
                      </Field>
                      <Field label="Date of birth" htmlFor="date_of_birth" error={errors.date_of_birth}>
                        <Input {...fieldProps("date_of_birth")} type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
                      </Field>
                      <Field label="Gender" htmlFor="gender">
                        <NativeSelect id="gender" value={person.gender} onChange={(e) => set("gender")(e.target.value)}>
                          <option value="">Select…</option>
                          {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </NativeSelect>
                      </Field>
                      <Field label="Phone" htmlFor="phone" required error={errors.phone}>
                        <Input {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="0788 123 456" />
                      </Field>
                      <Field label="Email" htmlFor="email" required error={errors.email} hint="We'll send your confirmation here.">
                        <Input {...fieldProps("email")} type="email" autoComplete="email" />
                      </Field>
                      <Field label="Address" htmlFor="address" required error={errors.address} className="sm:col-span-2">
                        <Input {...fieldProps("address")} autoComplete="street-address" placeholder="District, sector, cell" />
                      </Field>
                    </fieldset>

                    <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
                      <legend className="px-1 text-sm font-semibold">Emergency contact</legend>
                      <Field label="Name" htmlFor="emergency_contact_name" required error={errors.emergency_contact_name}>
                        <Input {...fieldProps("emergency_contact_name")} />
                      </Field>
                      <Field label="Phone" htmlFor="emergency_contact_phone" required error={errors.emergency_contact_phone}>
                        <Input {...fieldProps("emergency_contact_phone")} type="tel" inputMode="tel" placeholder="0788 123 456" />
                      </Field>
                    </fieldset>

                    <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
                      <legend className="px-1 text-sm font-semibold">Education & documents</legend>
                      <Field label="Previous education" htmlFor="previous_education" required error={errors.previous_education} hint="Your highest school or qualification, e.g. Secondary school (A-level)">
                        <Input {...fieldProps("previous_education")} />
                      </Field>
                      <Field
                        label={requireDoc ? "Identification document" : "Identification document (optional)"}
                        htmlFor="document"
                        required={requireDoc}
                        error={errors.document}
                        hint={`National ID or passport. PDF, JPG, PNG or WEBP, up to ${MAX_MB} MB.`}
                      >
                        <label
                          htmlFor="document"
                          className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm hover:border-primary/50"
                        >
                          <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                          <span className="truncate">{doc ? doc.name : "Choose a file"}</span>
                          {doc && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="ml-auto"
                              onClick={(e) => {
                                e.preventDefault();
                                setDoc(null);
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </label>
                        <input
                          id="document"
                          type="file"
                          accept={DOC_EXTS.join(",")}
                          className="sr-only"
                          onChange={(e) => {
                            setDoc(e.target.files?.[0] ?? null);
                            setErrors((er) => ({ ...er, document: undefined }));
                            e.target.value = "";
                          }}
                        />
                      </Field>
                      <Field label="Additional information (optional)" htmlFor="additional_info" error={errors.additional_info} hint="Anything you'd like us to know, e.g. your goals or availability.">
                        <Textarea {...fieldProps("additional_info")} rows={4} />
                      </Field>
                    </fieldset>

                    <div className="flex justify-between gap-3">
                      <Button type="button" variant="outline" size="lg" onClick={() => go(2)}>Back</Button>
                      <Button type="submit" size="lg">Review application</Button>
                    </div>
                  </form>
                </section>
              )}

              {/* STEP 4: review */}
              {step === 4 && intake && offering && (
                <section aria-labelledby="step-title">
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">Review your application</h2>
                  <p className="mb-5 mt-1 text-sm text-muted-foreground">Check everything is correct, then submit.</p>
                  <div className="space-y-4">
                    <ReviewBlock title="Intake" onEdit={() => go(1)}>
                      <dl>
                        <Row k="Intake" v={intake.name} />
                        <Row k="Training starts" v={formatLongDate(intake.training_starts_on)} />
                        <Row k="Application deadline" v={formatLongDate(intake.application_closes_on)} />
                      </dl>
                    </ReviewBlock>
                    <ReviewBlock title="Program" onEdit={() => go(2)}>
                      <dl>
                        <Row k="Program" v={offering.name} />
                        <Row k="Duration" v={formatDuration(offering.duration_value, offering.duration_unit)} />
                        <Row k="Fees" v={`Tuition ${formatMoney(offering.tuition_fee, currency)} · Registration ${formatMoney(offering.registration_fee, currency)}`} />
                      </dl>
                    </ReviewBlock>
                    <ReviewBlock title="Personal information" onEdit={() => go(3)}>
                      <dl>
                        <Row k="Full name" v={person.full_name} />
                        <Row k="Date of birth" v={person.date_of_birth ? formatLongDate(person.date_of_birth) : ""} />
                        <Row k="Gender" v={person.gender ? humanize(person.gender) : ""} />
                        <Row k="Phone" v={person.phone} />
                        <Row k="Email" v={person.email} />
                        <Row k="Address" v={person.address} />
                        <Row k="Emergency contact" v={`${person.emergency_contact_name} · ${person.emergency_contact_phone}`} />
                        <Row k="Previous education" v={person.previous_education} />
                        <Row k="Document" v={doc?.name ?? "None attached"} />
                        <Row k="Additional information" v={person.additional_info} />
                      </dl>
                    </ReviewBlock>
                  </div>
                  <div aria-live="assertive">
                    {submitError && (
                      <div className="mt-5 rounded-lg border border-destructive/30 bg-danger-soft p-4 text-sm" role="alert">
                        <p className="font-semibold text-destructive">We couldn't submit your application</p>
                        <p className="mt-1 text-destructive">{submitError}</p>
                        {/full|deadline|not accepting/i.test(submitError) && (
                          <Button variant="link" className="mt-1 h-auto p-0" onClick={() => { intakesQ.refetch(); go(2); }}>
                            Choose another program
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-6 flex justify-between gap-3">
                    <Button variant="outline" size="lg" onClick={() => go(3)} disabled={submitting}>Back</Button>
                    <Button size="lg" className={goldButton} onClick={submit} disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit application
                    </Button>
                  </div>
                </section>
              )}

              {/* STEP 5: submitted */}
              {step === 5 && done && (
                <section aria-labelledby="step-title" aria-live="polite" className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
                  <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">
                    Application Submitted Successfully
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    {done.program} · {done.intake}
                  </p>
                  <p className="mt-6 text-sm font-medium text-muted-foreground">Your application number is:</p>
                  <div className="mt-2 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <p className="tabular rounded-lg bg-gold-soft px-4 py-2 font-mono text-2xl font-extrabold tracking-wide text-accent-foreground sm:text-3xl">
                      {done.reference}
                    </p>
                    <Button variant="outline" size="sm" onClick={copyReference}>
                      <Copy className="mr-1.5 h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <div className="mx-auto mt-8 max-w-md space-y-2 text-left text-sm">
                    <p className="font-semibold">What happens next</p>
                    <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>Keep your application number. We've also sent it to {person.email}.</li>
                      <li>Our team reviews your application.</li>
                      <li>If approved, you'll receive your student number and login for the student portal.</li>
                    </ol>
                  </div>
                  <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Button asChild><Link to="/training-center/application-status">Check application status</Link></Button>
                    <Button asChild variant="outline"><Link to="/training-center">Back to home</Link></Button>
                  </div>
                </section>
              )}
            </>
          )
        }
      </QueryView>
    </div>
  );
}
