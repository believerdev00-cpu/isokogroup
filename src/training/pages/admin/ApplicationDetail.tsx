import { FileText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Facts, PageHeader, QueryView, Section, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { ApplicationActions, ApprovalResultHost } from "@/training/features/admin-core/shared";
import { openApiFile } from "@/training/lib/api";
import { formatDate, formatDateTime, humanize } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { ApplicationStatus } from "@/training/lib/types";

type Detail = {
  id: string;
  reference: string;
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
  status: ApplicationStatus;
  decision_note: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  submitted_at: string;
  has_document: boolean;
  program_name: string;
  intake_name: string;
  intake_id: string;
  intake_program_id: string;
  available_seats: number;
  capacity: number;
  student_id: string | null;
  student_number: string | null;
  other_applications: { reference: string; program: string; intake: string; status: ApplicationStatus }[] | null;
};

function ApplicationDetailPage() {
  const { id } = useParams();
  const q = useApi<Detail>(`/admin/applications/${id}`);
  return (
    <QueryView query={q}>
      {(a) => (
        <div className="space-y-6">
          <PageHeader
            back={{ to: `/training-center/admin/applications?intake_program_id=${a.intake_program_id}`, label: `${a.intake_name} — ${a.program_name}` }}
            title={<span className="flex flex-wrap items-center gap-3">{a.full_name} <StatusBadge status={a.status} /></span>}
            subtitle={`${a.reference} · Submitted ${formatDateTime(a.submitted_at)}`}
          />

          <Section
            title="Decision"
            description={
              a.status === "approved"
                ? undefined
                : a.available_seats > 0
                  ? `${a.available_seats} of ${a.capacity} seats left in ${a.program_name}.`
                  : `${a.program_name} is full. Waitlist the applicant, or increase the capacity in the intake.`
            }
          >
            {a.status === "approved" && a.student_id ? (
              <p className="text-sm">
                Approved and enrolled as{" "}
                <Link to={`/training-center/admin/students/${a.student_id}`} className="font-semibold text-primary hover:underline">{a.student_number}</Link>.
              </p>
            ) : a.status === "withdrawn" ? (
              <p className="text-sm text-muted-foreground">The applicant withdrew this application.</p>
            ) : (
              <ApplicationActions app={a} showReview size="default" />
            )}
            {(a.reviewed_at || a.decision_note) && (
              <p className="mt-4 text-sm text-muted-foreground">
                {a.reviewed_at && <>Last decision {formatDateTime(a.reviewed_at)}{a.reviewed_by_name && ` by ${a.reviewed_by_name}`}. </>}
                {a.decision_note && <>Note: “{a.decision_note}”</>}
              </p>
            )}
          </Section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Section title="Applicant" className="lg:col-span-2">
              <Facts
                items={[
                  ["Program", a.program_name],
                  ["Intake", <Link key="i" to={`/training-center/admin/intakes/${a.intake_id}`} className="hover:text-primary">{a.intake_name}</Link>],
                  ["Phone", <a key="p" href={`tel:${a.phone.replace(/\s/g, "")}`} className="hover:text-primary">{a.phone}</a>],
                  ["Email", <a key="e" href={`mailto:${a.email}`} className="hover:text-primary">{a.email}</a>],
                  ["Date of birth", formatDate(a.date_of_birth)],
                  ["Gender", humanize(a.gender)],
                  ["Address", a.address],
                  ["Previous education", a.previous_education],
                  ["Emergency contact", `${a.emergency_contact_name} · ${a.emergency_contact_phone}`],
                ]}
              />
              {a.additional_info && (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional information</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{a.additional_info}</p>
                </div>
              )}
            </Section>

            <div className="space-y-6">
              <Section title="Document">
                {a.has_document ? (
                  <Button variant="outline" onClick={() => openApiFile(`/admin/applications/${a.id}/document`)}>
                    <FileText className="mr-1.5 h-4 w-4" />Open identification document
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">No document was attached.</p>
                )}
              </Section>
              <Section title="Other applications">
                {a.other_applications && a.other_applications.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {a.other_applications.map((o) => (
                      <li key={o.reference} className="flex items-start justify-between gap-2">
                        <span>
                          <span className="block font-medium">{o.program}</span>
                          <span className="text-xs text-muted-foreground">{o.intake} · {o.reference}</span>
                        </span>
                        <StatusBadge status={o.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No other applications with this email.</p>
                )}
              </Section>
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}

export default function ApplicationDetail() {
  return (
    <ApprovalResultHost>
      <ApplicationDetailPage />
    </ApprovalResultHost>
  );
}
