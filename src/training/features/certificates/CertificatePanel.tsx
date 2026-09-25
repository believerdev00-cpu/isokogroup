import { useState } from "react";
import { Award, Check, Download, ExternalLink, X } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmDialog, Loading, QueryView, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { api, openApiFile } from "@/training/lib/api";
import { formatDate } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { Eligibility } from "@/training/lib/types";
import { cn } from "@/lib/utils";

type Certificate = {
  id: string;
  enrollment_id: string;
  certificate_number: string;
  verification_code: string;
  issued_on: string;
  final_grade: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

const KEYS = ["/admin/certificates", "/admin/enrollments", "/admin/students", "/admin/reports"];

export function EligibilityList({ eligibility }: { eligibility: Eligibility }) {
  return (
    <ul className="space-y-1.5">
      {eligibility.checks.map((c) => (
        <li key={c.key} className={cn("flex items-start gap-2 text-sm", !c.required && "text-muted-foreground")}>
          {c.met ? (
            <Check className={cn("mt-0.5 h-4 w-4 shrink-0", c.required ? "text-success" : "text-muted-foreground")} aria-label="Met" />
          ) : (
            <X className={cn("mt-0.5 h-4 w-4 shrink-0", c.required ? "text-destructive" : "text-muted-foreground")} aria-label="Not met" />
          )}
          <span>
            {c.label}
            <span className="text-muted-foreground"> — {c.detail}</span>
            {!c.required && <span className="text-xs"> (not required)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The certificate of one enrollment: issued details, or what's needed to issue it. */
export default function CertificatePanel({ enrollmentId, certificateId }: { enrollmentId: string; certificateId: string | null }) {
  const certs = useApi<(Certificate & { student_id: string })[]>(certificateId ? "/admin/certificates" : null);
  const eligibility = useApi<Eligibility>(certificateId ? null : `/admin/enrollments/${enrollmentId}/eligibility`);
  const [revoking, setRevoking] = useState(false);

  const issue = useApiMutation(() => api.post<Certificate>(`/admin/enrollments/${enrollmentId}/certificate`), {
    invalidate: KEYS,
    success: (c) => `Certificate ${c.certificate_number} issued`,
  });
  const revoke = useApiMutation((reason: string) => api.post(`/admin/certificates/${certificateId}/revoke`, { reason }), {
    invalidate: KEYS,
    success: "Certificate revoked",
    onSuccess: () => setRevoking(false),
  });

  if (certificateId) {
    if (certs.isLoading) return <Loading />;
    const cert = certs.data?.find((c) => c.id === certificateId);
    if (!cert) return <p className="text-sm text-muted-foreground">Certificate not found.</p>;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Award className="h-5 w-5 text-gold" aria-hidden />
          <span className="font-semibold">{cert.certificate_number}</span>
          <StatusBadge status={cert.revoked_at ? "revoked" : "valid"} />
        </div>
        <p className="text-sm text-muted-foreground">
          Issued {formatDate(cert.issued_on)}
          {cert.final_grade && ` · Grade ${cert.final_grade}`} · Verification {cert.verification_code}
          {cert.revoked_at && ` · Revoked: ${cert.revoke_reason ?? ""}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => openApiFile(`/admin/certificates/${cert.id}/pdf`)}>
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/training-center/verify/${cert.verification_code}`} target="_blank">
              <ExternalLink className="h-4 w-4" /> Verification page
            </Link>
          </Button>
          {!cert.revoked_at && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRevoking(true)}>
              Revoke
            </Button>
          )}
        </div>
        <ConfirmDialog
          open={revoking}
          onOpenChange={setRevoking}
          title="Revoke this certificate?"
          description="The verification page will show it as revoked. This can't be undone."
          confirmLabel="Revoke certificate"
          destructive
          noteLabel="Reason"
          noteRequired
          pending={revoke.isPending}
          onConfirm={(reason) => revoke.mutate(reason)}
        />
      </div>
    );
  }

  return (
    <QueryView query={eligibility}>
      {(e) => (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {e.eligible ? "All requirements are met. The certificate can be issued." : "Not yet eligible for a certificate:"}
          </p>
          <EligibilityList eligibility={e} />
          <Button onClick={() => issue.mutate()} disabled={!e.eligible || issue.isPending}>
            <Award className="h-4 w-4" /> Issue certificate
          </Button>
        </div>
      )}
    </QueryView>
  );
}
