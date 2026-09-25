import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Loader2, SearchX, ShieldAlert } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Facts, Field } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicHero } from "@/training/features/public/shared";
import { api } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";
import { formatLongDate } from "@/training/lib/format";

type Result =
  | { valid: false; not_found: true }
  | {
      valid: boolean;
      revoked: boolean;
      certificate_number: string;
      program_name: string;
      issued_on: string;
      /** Only with the verification code; a certificate number alone doesn't say whose it is */
      needs_code?: true;
      student_name?: string;
      intake_name?: string;
      final_grade?: string | null;
    };

export default function Verify() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(code ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (value: string) => {
    const v = value.trim().toUpperCase();
    if (v.length < 5) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.get<Result>(`/public/certificates/verify/${encodeURIComponent(v)}`));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (code) {
      setInput(code);
      check(code);
    }
  }, [code]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (v === (code ?? "").toUpperCase()) check(v);
    else navigate(`/training-center/verify/${encodeURIComponent(v)}`);
  };

  return (
    <>
      <PublicHero eyebrow="Employers & institutions" title="Verify a certificate">
        Enter the verification code printed on the certificate to see who it was awarded to. A certificate number (e.g.
        ISK-CERT-2027-00125) only confirms that the certificate exists.
      </PublicHero>
      <div className="container max-w-2xl space-y-6 py-10">
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-end">
          <Field label="Verification code or certificate number" htmlFor="code" className="flex-1">
            <Input id="code" value={input} onChange={(e) => setInput(e.target.value)} className="font-mono uppercase" autoCapitalize="characters" required />
          </Field>
          <Button type="submit" disabled={busy || input.trim().length < 5}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>
        </form>

        <div aria-live="polite">
          {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft p-4 text-sm font-medium text-destructive" role="alert">{error}</p>}
          {result && "not_found" in result && (
            <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
              <SearchX className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-lg font-bold">No certificate found</p>
              <p className="mt-1 text-sm text-muted-foreground">No certificate matches this code. Check it carefully; letters and numbers must match exactly.</p>
            </div>
          )}
          {result && !("not_found" in result) && (
            <div className={result.valid ? "rounded-xl border-2 border-success/40 bg-success-soft p-6 shadow-sm" : "rounded-xl border-2 border-destructive/40 bg-danger-soft p-6 shadow-sm"}>
              <div className="flex items-center gap-3">
                {result.valid ? <BadgeCheck className="h-10 w-10 text-success" aria-hidden /> : <ShieldAlert className="h-10 w-10 text-destructive" aria-hidden />}
                <div>
                  <p className={result.valid ? "text-xl font-extrabold text-success" : "text-xl font-extrabold text-destructive"}>
                    {result.valid ? "VALID CERTIFICATE" : "REVOKED"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {result.valid ? "Issued by Isoko Training Center." : "This certificate has been revoked and is no longer valid."}
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-lg bg-card p-4">
                <Facts
                  items={
                    result.needs_code
                      ? [
                          ["Program", result.program_name],
                          ["Issued on", formatLongDate(result.issued_on)],
                          ["Certificate number", <span className="font-mono">{result.certificate_number}</span>],
                        ]
                      : [
                          ["Student", result.student_name],
                          ["Program", result.program_name],
                          ["Intake", result.intake_name],
                          ["Grade", result.final_grade ?? "—"],
                          ["Issued on", formatLongDate(result.issued_on)],
                          ["Certificate number", <span className="font-mono">{result.certificate_number}</span>],
                        ]
                  }
                />
                {result.needs_code && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    To see who this certificate was awarded to, enter the verification code printed on it.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
