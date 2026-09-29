import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog, Facts, Field, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicHero } from "@/training/features/public/shared";
import { FeePayment } from "@/training/features/public/FeePayment";
import { api } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";
import { formatDate, formatLongDate } from "@/training/lib/format";
import type { ApplicationStatus as Status } from "@/training/lib/types";

type Result = {
  reference: string;
  full_name: string;
  status: Status;
  submitted_at: string;
  reviewed_at: string | null;
  decision_note: string | null;
  program_name: string;
  intake_name: string;
  training_starts_on: string;
  student_number: string | null;
  /** the private payment link, while the registration fee is still owed */
  pay_token: string | null;
};

const EXPLAIN: Record<Status, string> = {
  pending: "We've received your application and will review it soon.",
  under_review: "Our team is reviewing your application.",
  approved: "Congratulations! You've been accepted. Your login details were sent to your email.",
  rejected: "Unfortunately we couldn't offer you a place this time.",
  waitlisted: "The program is full. You're on the waiting list and we'll contact you if a seat opens.",
  withdrawn: "You withdrew this application.",
};

const WITHDRAWABLE: Status[] = ["pending", "under_review", "waitlisted"];

export default function ApplicationStatus() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const lookup = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post<Result>("/public/applications/status", { reference: reference.trim(), email: email.trim() }));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    try {
      await api.post("/public/applications/withdraw", { reference: reference.trim(), email: email.trim() });
      toast.success("Your application was withdrawn");
      setConfirmOpen(false);
      await lookup();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <>
      <PublicHero eyebrow="Applicants" title="Check your application">
        Enter your application number and the email address you applied with.
      </PublicHero>
      <div className="container grid max-w-4xl gap-6 py-10 lg:grid-cols-5">
        <form onSubmit={lookup} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm lg:col-span-2" noValidate>
          <Field label="Application number" htmlFor="reference" hint="e.g. ISOKO-APP-2027-00125">
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} autoCapitalize="characters" className="font-mono" required />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy || reference.trim().length < 5 || !email.includes("@")}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check status
          </Button>
        </form>

        <div className="lg:col-span-3" aria-live="polite">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-danger-soft p-5 text-sm" role="alert">
              <p className="font-semibold text-destructive">{error}</p>
              <p className="mt-1 text-muted-foreground">Check the number and use the same email address you applied with.</p>
            </div>
          )}
          {result && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold">{result.reference}</p>
                <StatusBadge status={result.status} />
              </div>
              <h2 className="mt-3 text-xl font-bold">{result.full_name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{EXPLAIN[result.status]}</p>
              <div className="mt-5">
                <Facts
                  items={[
                    ["Program", result.program_name],
                    ["Intake", result.intake_name],
                    ["Training starts", formatLongDate(result.training_starts_on)],
                    ["Submitted", formatDate(result.submitted_at)],
                    ...(result.student_number ? ([["Student number", <span className="font-mono">{result.student_number}</span>]] as [string, React.ReactNode][]) : []),
                  ]}
                />
              </div>
              {result.pay_token && <FeePayment token={result.pay_token} className="mt-5" />}
              {result.decision_note && (
                <div className="mt-5 rounded-lg bg-muted p-3 text-sm">
                  <p className="font-semibold">Note from the training center</p>
                  <p className="mt-1 text-muted-foreground">{result.decision_note}</p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                {result.status === "approved" && (
                  <Button asChild><Link to="/training-center/login">Sign in to the student portal</Link></Button>
                )}
                {WITHDRAWABLE.includes(result.status) && (
                  <Button variant="outline" onClick={() => setConfirmOpen(true)}>Withdraw application</Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Withdraw your application?"
        description="Your seat request will be cancelled. You can apply again later if the intake is still open."
        confirmLabel="Withdraw"
        destructive
        pending={withdrawing}
        onConfirm={withdraw}
      />
    </>
  );
}
