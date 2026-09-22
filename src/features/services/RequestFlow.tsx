import { useRef, useState } from "react";
import { FileUp, Paperclip, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { errorText, MAX_FILE_MB, rpc, uploadClientFile, useOfferings } from "./api";
import { ChoiceCard, Field, FlowColumn, FormError, PageLoading, PrimaryButton, RequestReceived, ServiceLayout, StepHeader, THEME } from "./ui";

type Config = {
  service: "consultancy" | "data";
  /** database function that creates the request */
  submitFn: string;
  /** database function that records a file the client uploaded */
  fileFn: string;
  viewPath: string;
  chooseTitle: string;
  describeTitle: string;
  describePlaceholder: string;
  files?: { title: string; accept: string; hint: string; laterLabel: string };
  submitLabel: string;
  receivedTitle: string;
  receivedMessage: string;
};

/**
 * A short request: what you need → tell us about it → (your files) → contact.
 * Used by Consultancy and Data Analysis. No account needed.
 */
export default function RequestFlow({ config: c }: { config: Config }) {
  const { user } = useAuth();
  const offerings = useOfferings(c.service);
  const total = c.files ? 4 : 3;
  const contactStep = total;
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [serviceKey, setServiceKey] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [later, setLater] = useState(false);
  const [name, setName] = useState((user?.user_metadata?.full_name as string) ?? "");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; token: string; failedFiles: string[] } | null>(null);

  const go = (s: number) => {
    setError(null);
    setStep(s);
    window.scrollTo(0, 0);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) setError(`${tooBig.name} is larger than ${MAX_FILE_MB} MB. Choose "I will provide the data later" and we'll arrange another way.`);
    setFiles((cur) => [...cur, ...picked.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024)].slice(0, 10));
    setLater(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await rpc<{ reference: string; token: string }>(c.submitFn, {
        p: { service: serviceKey, description, data_later: later, name, organization, phone, email },
      });
      // The request exists now; files go into its private folder.
      const failedFiles: string[] = [];
      for (const f of files) {
        try {
          const path = await uploadClientFile(c.service, r.token, f);
          await rpc(c.fileFn, { p_token: r.token, p_path: path, p_name: f.name, p_size: f.size });
        } catch {
          failedFiles.push(f.name);
        }
      }
      setResult({ ...r, failedFiles });
      window.scrollTo(0, 0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <ServiceLayout>
        {result.failedFiles.length > 0 && (
          <p className="mx-auto mt-6 max-w-xl rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Your request was sent, but {result.failedFiles.join(", ")} could not be uploaded. You can add files again from your request page.
          </p>
        )}
        <RequestReceived
          service={c.service}
          title={c.receivedTitle}
          message={c.receivedMessage}
          reference={result.reference}
          viewTo={`${c.viewPath}${result.token}`}
        />
      </ServiceLayout>
    );
  }

  return (
    <ServiceLayout>
      <FlowColumn>
        {step === 1 && (
          <>
            <StepHeader service={c.service} step={1} total={total} title={c.chooseTitle} />
            {offerings.isLoading ? (
              <PageLoading />
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                  {(offerings.data ?? []).map((o) => (
                    <ChoiceCard
                      key={o.key}
                      service={c.service}
                      multi={false}
                      selected={serviceKey === o.key}
                      onClick={() => setServiceKey(o.key)}
                      title={o.name}
                      description={o.description}
                    />
                  ))}
                </div>
                <PrimaryButton service={c.service} className="mt-3" disabled={!serviceKey} onClick={() => go(2)}>
                  Continue
                </PrimaryButton>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <StepHeader service={c.service} step={2} total={total} title={c.describeTitle} onBack={() => go(1)} />
            <div className="space-y-4">
              <Textarea
                aria-label={c.describeTitle}
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={c.describePlaceholder}
                maxLength={4000}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">A few sentences is enough. We'll ask for the details when we talk.</p>
              <PrimaryButton service={c.service} disabled={description.trim().length < 10} onClick={() => go(3)}>
                Continue
              </PrimaryButton>
            </div>
          </>
        )}

        {c.files && step === 3 && (
          <>
            <StepHeader service={c.service} step={3} total={total} title={c.files.title} onBack={() => go(2)} />
            <div className="space-y-4">
              <input ref={fileInput} type="file" multiple accept={c.files.accept} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-card p-8 text-center hover:border-foreground/30"
              >
                <FileUp className={cn("h-8 w-8", THEME[c.service].text)} />
                <span className="font-semibold">Choose files</span>
                <span className="text-sm text-muted-foreground">{c.files.hint}</span>
              </button>
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ChoiceCard service={c.service} selected={later} onClick={() => { setLater(!later); if (!later) setFiles([]); }} title={c.files.laterLabel} />
              <FormError message={error} />
              <PrimaryButton service={c.service} disabled={files.length === 0 && !later} onClick={() => go(4)}>
                Continue
              </PrimaryButton>
            </div>
          </>
        )}

        {step === contactStep && (
          <>
            <StepHeader service={c.service} step={contactStep} total={total} title="How can we reach you?" onBack={() => go(contactStep - 1)} />
            <form className="space-y-4" onSubmit={submit}>
              <Field label="Name" htmlFor="name">
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </Field>
              <Field label="Organization" htmlFor="org" optional>
                <Input id="org" autoComplete="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={160} />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={40} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
              </Field>
              <FormError message={error} />
              <PrimaryButton service={c.service} type="submit" busy={busy} disabled={!name.trim() || !phone.trim() || !email.trim()}>
                {busy && files.length ? "Sending your files…" : c.submitLabel}
              </PrimaryButton>
            </form>
          </>
        )}
      </FlowColumn>
    </ServiceLayout>
  );
}
