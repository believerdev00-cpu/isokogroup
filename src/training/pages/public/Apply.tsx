import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Copy, FileUp, Loader2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, Field, NativeSelect, QueryView, SeatsMeter, StatusBadge } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { goldButton } from "@/training/features/public/shared";
import { api } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";
import { formatDuration, formatLongDate, formatMoney } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { PublicIntake } from "@/training/lib/types";
import { cn } from "@/lib/utils";

// Three steps: pick a program, give a few details and send, done.
const STEPS = ["Choose a program", "Your details", "Done"];

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

// Highest education, one tap
const EDUCATION = ["Primary school", "Secondary (O-level)", "Secondary (A-level)", "TVET / vocational", "University", "Other"];

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

// Same rules as the server, so people see problems before sending. Only name,
// phone, email and education are required; the rest is checked when given.
function validatePerson(p: Person, doc: File | null, requireDoc: boolean) {
  const e: Partial<Record<keyof Person | "document", string>> = {};
  if (p.full_name.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) e.full_name = "Enter your first and last name";
  if (!validPhone(p.phone)) e.phone = "Enter a valid phone number, e.g. 0788 123 456";
  if (!EMAIL.test(p.email.trim())) e.email = "Enter a valid email address, e.g. name@gmail.com";
  if (p.previous_education.trim().length < 2) e.previous_education = "Choose your highest education";
  if (p.date_of_birth) {
    const age = yearsSince(p.date_of_birth);
    if (Number.isNaN(age) || age > 100 || p.date_of_birth > new Date().toISOString().slice(0, 10)) e.date_of_birth = "Enter a valid date of birth";
    else if (age < MIN_AGE) e.date_of_birth = `Applicants must be at least ${MIN_AGE} years old`;
  }
  if (p.address.trim() && p.address.trim().length < 3) e.address = "Enter your address, e.g. Gasabo, Kimironko";
  if (p.emergency_contact_phone.trim()) {
    if (!validPhone(p.emergency_contact_phone)) e.emergency_contact_phone = "Enter a valid phone number";
    else if (validPhone(p.phone) && phoneDigits(p.phone) === phoneDigits(p.emergency_contact_phone)) e.emergency_contact_phone = "Use someone else's number, not your own";
  }
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
  "full_name", "phone", "email", "previous_education", "document", "date_of_birth", "address",
  "emergency_contact_phone", "additional_info",
];
const OPTIONAL_FIELDS = new Set(["date_of_birth", "address", "emergency_contact_name", "emergency_contact_phone", "additional_info"]);

function StepIndicator({ step }: { step: number }) {
  return (
    <nav aria-label="Application steps" className="mb-8">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? "step" : undefined}>
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
              <span className={cn("text-xs font-medium sm:text-sm", current ? "text-foreground" : "text-muted-foreground", !current && "hidden sm:inline")}>{label}</span>
              {n < STEPS.length && <span className={cn("h-0.5 flex-1 rounded", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
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
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [person, setPerson] = useState<Person>(EMPTY);
  const [doc, setDoc] = useState<File | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validatePerson>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Submitted | null>(null);
  const initialised = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const intakes = intakesQ.data ?? [];
  // Every program open for applications, whatever intake it is in
  const offerings = intakes.flatMap((i) => i.programs.map((p) => ({ ...p, intake: i })));
  const offering = offerings.find((o) => o.intake_program_id === offeringId) ?? null;
  const open = offerings.filter((o) => !o.is_full);

  // Preselect from the link (?program=id), or when only one program is open
  useEffect(() => {
    if (initialised.current || !intakesQ.data) return;
    initialised.current = true;
    const wanted = offerings.find((o) => o.intake_program_id === params.get("program") && !o.is_full);
    const only = open.length === 1 ? open[0] : undefined;
    const pick = wanted ?? only;
    if (pick) {
      setOfferingId(pick.intake_program_id);
      setStep(2);
    }
  }, [intakesQ.data, params, offerings, open]);

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
  const dirty = !done && step === 2 && Object.values(person).some((v) => v.trim());
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const submit = async () => {
    if (!offering) return;
    const e = validatePerson(person, doc, requireDoc);
    setErrors(e);
    const firstBad = FIELD_ORDER.find((k) => e[k]);
    if (firstBad) {
      if (OPTIONAL_FIELDS.has(firstBad)) setMoreOpen(true);
      const count = Object.values(e).filter(Boolean).length;
      toast.error(count === 1 ? "Please correct the highlighted field" : `Please correct the ${count} highlighted fields`);
      setTimeout(() => {
        const el = document.getElementById(firstBad);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      }, 50);
      return;
    }
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
      go(3);
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
    <div className="container max-w-3xl py-8 sm:py-12">
      <h1 className="page-title">Apply to Isoko Training Center</h1>
      <p className="page-subtitle">No account needed. It takes about two minutes.</p>
      <div className="mt-8">
        <StepIndicator step={step} />
      </div>

      <QueryView query={intakesQ}>
        {() =>
          offerings.length === 0 && !done ? (
            <EmptyState
              title="No intakes are open for applications right now"
              description="Please check back soon, or contact us to be told when the next intake opens."
              action={<Button asChild variant="outline"><Link to="/training-center/contact">Contact us</Link></Button>}
            />
          ) : (
            <>
              {/* STEP 1: program (from any open intake) */}
              {step === 1 && (
                <section aria-labelledby="step-title">
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">Which program do you want to join?</h2>
                  <div className="space-y-6">
                    {intakes.map((i) => (
                      <div key={i.id} className="space-y-3">
                        {intakes.length > 1 && (
                          <p className="text-sm font-semibold text-muted-foreground">
                            {i.name} · starts {formatLongDate(i.training_starts_on)} · apply by {formatLongDate(i.application_closes_on)}
                          </p>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={i.name}>
                          {i.programs.map((p) => (
                            <button
                              key={p.intake_program_id}
                              type="button"
                              role="radio"
                              aria-checked={offeringId === p.intake_program_id}
                              disabled={p.is_full}
                              onClick={() => {
                                setOfferingId(p.intake_program_id);
                                go(2);
                              }}
                              className={cn(
                                "rounded-xl border-2 bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                                offeringId === p.intake_program_id ? "border-primary bg-secondary/40" : "border-border enabled:hover:border-primary/60",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-lg font-bold">{p.name}</span>
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
                                <span className="font-semibold">{formatMoney(p.tuition_fee, currency)}</span> tuition
                                {Number(p.registration_fee) > 0 && <> · {formatMoney(p.registration_fee, currency)} registration</>}
                              </p>
                              {!p.is_full && <p className="mt-3 text-sm font-semibold text-primary">Apply for this →</p>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* STEP 2: details and send */}
              {step === 2 && offering && (
                <section aria-labelledby="step-title">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary/40 p-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You're applying for</p>
                      <p className="text-lg font-bold">{offering.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {offering.intake.name} · starts {formatLongDate(offering.intake.training_starts_on)} · {formatMoney(offering.tuition_fee, currency)} tuition
                      </p>
                    </div>
                    {open.length > 1 && (
                      <Button type="button" variant="outline" size="sm" onClick={() => go(1)}>Change</Button>
                    )}
                  </div>

                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">Your details</h2>
                  <p className="mb-5 mt-1 text-sm text-muted-foreground">We'll use these to contact you about your application.</p>
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit();
                    }}
                    className="space-y-5"
                  >
                    <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
                      <Field label="Full name" htmlFor="full_name" required error={errors.full_name} className="sm:col-span-2">
                        <Input {...fieldProps("full_name")} autoComplete="name" placeholder="First and last name" />
                      </Field>
                      <Field label="Phone" htmlFor="phone" required error={errors.phone}>
                        <Input {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="0788 123 456" />
                      </Field>
                      <Field label="Email" htmlFor="email" required error={errors.email} hint="Your application number is sent here.">
                        <Input {...fieldProps("email")} type="email" autoComplete="email" placeholder="name@gmail.com" />
                      </Field>
                      <Field label="Highest education" htmlFor="previous_education" required error={errors.previous_education} className="sm:col-span-2">
                        <div id="previous_education" tabIndex={-1} className="flex flex-wrap gap-2" role="radiogroup" aria-label="Highest education">
                          {EDUCATION.map((ed) => {
                            const chosen = person.previous_education === ed || (ed === "Other" && !!person.previous_education && !EDUCATION.includes(person.previous_education));
                            return (
                              <button
                                key={ed}
                                type="button"
                                role="radio"
                                aria-checked={chosen}
                                onClick={() => set("previous_education")(ed === "Other" ? "Other: " : ed)}
                                className={cn(
                                  "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                                  chosen ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60",
                                )}
                              >
                                {ed}
                              </button>
                            );
                          })}
                        </div>
                        {person.previous_education.startsWith("Other") && (
                          <Input
                            className="mt-2"
                            value={person.previous_education.replace(/^Other:\s*/, "")}
                            onChange={(e) => set("previous_education")(`Other: ${e.target.value}`)}
                            placeholder="Tell us your highest qualification"
                          />
                        )}
                      </Field>
                      {requireDoc && <DocumentField doc={doc} setDoc={setDoc} error={errors.document} required clearError={() => setErrors((er) => ({ ...er, document: undefined }))} />}
                    </div>

                    {/* Everything else is optional */}
                    <div className="rounded-xl border bg-card">
                      <button
                        type="button"
                        onClick={() => setMoreOpen((o) => !o)}
                        aria-expanded={moreOpen}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold sm:px-5"
                      >
                        More details (optional)
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", moreOpen && "rotate-180")} />
                      </button>
                      {moreOpen && (
                        <div className="grid gap-4 border-t p-4 sm:grid-cols-2 sm:p-5">
                          <Field label="Date of birth" htmlFor="date_of_birth" error={errors.date_of_birth}>
                            <Input {...fieldProps("date_of_birth")} type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
                          </Field>
                          <Field label="Gender" htmlFor="gender">
                            <NativeSelect id="gender" value={person.gender} onChange={(e) => set("gender")(e.target.value)}>
                              <option value="">Select…</option>
                              {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </NativeSelect>
                          </Field>
                          <Field label="Address" htmlFor="address" error={errors.address} className="sm:col-span-2">
                            <Input {...fieldProps("address")} autoComplete="street-address" placeholder="District, sector, cell" />
                          </Field>
                          <Field label="Emergency contact name" htmlFor="emergency_contact_name">
                            <Input {...fieldProps("emergency_contact_name")} />
                          </Field>
                          <Field label="Emergency contact phone" htmlFor="emergency_contact_phone" error={errors.emergency_contact_phone}>
                            <Input {...fieldProps("emergency_contact_phone")} type="tel" inputMode="tel" placeholder="0788 123 456" />
                          </Field>
                          {!requireDoc && (
                            <div className="sm:col-span-2">
                              <DocumentField doc={doc} setDoc={setDoc} error={errors.document} clearError={() => setErrors((er) => ({ ...er, document: undefined }))} />
                            </div>
                          )}
                          <Field label="Anything else we should know" htmlFor="additional_info" error={errors.additional_info} className="sm:col-span-2">
                            <Textarea {...fieldProps("additional_info")} rows={3} placeholder="Your goals, availability…" />
                          </Field>
                        </div>
                      )}
                    </div>

                    <div aria-live="assertive">
                      {submitError && (
                        <div className="rounded-lg border border-destructive/30 bg-danger-soft p-4 text-sm" role="alert">
                          <p className="font-semibold text-destructive">We couldn't send your application</p>
                          <p className="mt-1 text-destructive">{submitError}</p>
                          {/full|deadline|not accepting/i.test(submitError) && (
                            <Button variant="link" className="mt-1 h-auto p-0" onClick={() => { intakesQ.refetch(); go(1); }}>
                              Choose another program
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <Button type="submit" size="lg" className={cn(goldButton, "h-12 w-full text-base")} disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send my application
                    </Button>
                  </form>
                </section>
              )}

              {/* STEP 3: sent */}
              {step === 3 && done && (
                <section aria-labelledby="step-title" aria-live="polite" className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
                  <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
                  <h2 id="step-title" ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">
                    Application sent
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
                      <li>Our team reviews your application and calls or emails you.</li>
                      <li>If you're accepted, you'll receive your student number and login for the student portal.</li>
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

function DocumentField({ doc, setDoc, error, required, clearError }: { doc: File | null; setDoc: (f: File | null) => void; error?: string; required?: boolean; clearError: () => void }) {
  return (
    <Field
      label={required ? "ID or passport" : "ID or passport (optional)"}
      htmlFor="document"
      required={required}
      error={error}
      hint={`PDF, JPG, PNG or WEBP, up to ${MAX_MB} MB.`}
      className="sm:col-span-2"
    >
      <label htmlFor="document" className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm hover:border-primary/50">
        <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{doc ? doc.name : "Choose a file or take a photo"}</span>
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
          clearError();
          e.target.value = "";
        }}
      />
    </Field>
  );
}
