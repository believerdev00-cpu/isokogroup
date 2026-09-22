import { Award, CheckCircle2, Circle, Download, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Facts, QueryView, Section, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { StudentEnrollmentPage, type CertificateRequirements, type StudentEnrollment } from "@/training/features/student/useStudent";
import { openApiFile } from "@/training/lib/api";
import { formatLongDate, formatMoney, formatPercent } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import { cn } from "@/lib/utils";

type Cert = {
  id: string;
  enrollment_id: string;
  certificate_number: string;
  verification_code: string;
  program_name: string;
  intake_name: string;
  final_grade: string | null;
  issued_on: string;
  revoked: boolean;
};

export default function StudentCertificate() {
  const q = useApi<Cert[]>("/student/certificates");
  return (
    <StudentEnrollmentPage title="Certificate">
      {(e, d) => (
        <QueryView query={q}>
          {(certs) => {
            const cert = certs.find((c) => c.enrollment_id === e.id);
            return cert ? <Issued cert={cert} /> : <NotYet e={e} currency={d.currency} req={d.certificate_requirements} />;
          }}
        </QueryView>
      )}
    </StudentEnrollmentPage>
  );
}

function Issued({ cert }: { cert: Cert }) {
  if (cert.revoked) {
    return (
      <Section>
        <p className="font-semibold text-destructive">Certificate {cert.certificate_number} has been revoked.</p>
        <p className="mt-1 text-sm text-muted-foreground">Please contact the training center office.</p>
      </Section>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-gold/50 bg-card shadow-sm">
      <div className="bg-zinc-950 px-6 py-8 text-center text-zinc-100">
        {/* A one-time burst to celebrate completing the program */}
        <span className="achievement-burst relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold/15">
          <Award className="h-10 w-10 text-gold" aria-hidden />
        </span>
        <p className="mt-3 text-sm uppercase tracking-[0.2em] text-zinc-400">Congratulations</p>
        <p className="mt-1 text-2xl font-bold">{cert.program_name}</p>
        <p className="text-zinc-400">{cert.intake_name}</p>
      </div>
      <div className="space-y-6 p-6">
        <Facts
          columns={2}
          items={[
            ["Certificate number", cert.certificate_number],
            ["Verification code", cert.verification_code],
            ["Grade", cert.final_grade ?? "—"],
            ["Issued on", formatLongDate(cert.issued_on)],
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={() => openApiFile(`/student/certificates/${cert.id}/pdf`)}>
            <Download className="mr-2 h-4 w-4" /> Download certificate
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to={`/training-center/verify/${cert.certificate_number}`}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Verification page
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Employers can confirm your certificate by entering its number on the verification page.</p>
      </div>
    </div>
  );
}

function NotYet({ e, currency, req }: { e: StudentEnrollment; currency: string; req: CertificateRequirements }) {
  const r = e.results;
  const checks = [
    req.require_completed && { label: "Program completed", met: e.status === "completed", detail: e.status === "completed" ? "Completed" : `In progress (${e.progress}% of the training period)` },
    req.min_attendance > 0 && {
      label: `Attendance of at least ${req.min_attendance}%`,
      met: e.attendance.rate !== null && e.attendance.rate >= req.min_attendance,
      detail: `Yours: ${formatPercent(e.attendance.rate)}`,
    },
    req.require_all_assessments && {
      label: "All assessments marked",
      met: r.assessments_total > 0 && r.assessments_completed === r.assessments_total,
      detail: `${r.assessments_completed} of ${r.assessments_total} marked`,
    },
    req.require_pass && {
      label: `Final mark of at least ${req.pass_mark}%`,
      met: r.passed === true,
      detail: r.final_percentage === null ? "No marks yet" : `Currently ${formatPercent(r.final_percentage)}${r.grade ? ` (grade ${r.grade})` : ""}`,
    },
    req.require_fees_cleared && { label: "Fees cleared", met: e.finance.balance <= 0, detail: e.finance.balance <= 0 ? "Paid" : `Balance ${formatMoney(e.finance.balance, currency)}` },
  ].filter((c): c is { label: string; met: boolean; detail: string } => !!c);
  return (
    <Section title="Your certificate isn't available yet">
      <p className="text-sm text-muted-foreground">
        Your certificate will be available once you complete the program, meet attendance and results requirements and clear your fees. The office issues it after checking your record.
      </p>
      <ul className="mt-5 space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3">
            {c.met ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
            <div className="flex-1">
              <p className={cn("font-medium", c.met && "text-success")}>{c.label}</p>
              <p className="text-sm text-muted-foreground">{c.detail}</p>
            </div>
            <StatusBadge status={c.met ? "eligible" : "not_eligible"} label={c.met ? "Done" : "Not yet"} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
