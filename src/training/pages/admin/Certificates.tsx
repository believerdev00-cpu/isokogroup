import { useState } from "react";
import { Award, Download, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmDialog, EmptyState, NativeSelect, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, openApiFile } from "@/training/lib/api";
import { formatDate, plural } from "@/training/lib/format";
import { useApi, useApiMutation, withQuery } from "@/training/lib/query";
import type { Eligibility } from "@/training/lib/types";
import { useIntakes } from "@/training/features/admin-ops/lookups";
import { EligibilityList } from "@/training/features/certificates/CertificatePanel";

type Candidate = {
  enrollment_id: string;
  status: "active" | "completed";
  student_id: string;
  student_number: string;
  full_name: string;
  program_name: string;
  intake_name: string;
  eligibility: Eligibility;
};

type Issued = {
  id: string;
  certificate_number: string;
  verification_code: string;
  student_name: string;
  student_id: string;
  student_number: string;
  program_name: string;
  intake_name: string;
  final_grade: string | null;
  issued_on: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

const KEYS = ["/admin/certificates", "/admin/enrollments", "/admin/students", "/admin/reports"];

function ReadyToIssue({ intakeId }: { intakeId: string }) {
  const q = useApi<Candidate[]>(withQuery("/admin/certificates/candidates", { intake_id: intakeId }));
  const [showActive, setShowActive] = useState(false);
  const issue = useApiMutation((id: string) => api.post<{ certificate_number: string }>(`/admin/enrollments/${id}/certificate`), {
    invalidate: KEYS,
    success: (c) => `Certificate ${c.certificate_number} issued`,
  });
  return (
    <QueryView query={q}>
      {(rows) => {
        const completed = rows.filter((r) => r.status === "completed");
        const active = rows.filter((r) => r.status === "active");
        const eligible = completed.filter((r) => r.eligibility.eligible);
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {eligible.length} ready to issue · {completed.length - eligible.length} completed but not yet eligible · {active.length} still in training
            </p>
            {completed.length === 0 ? (
              <EmptyState
                icon={Award}
                title="No completed students waiting for a certificate"
                description="When a student finishes, open their profile and mark the enrollment completed. They then appear here."
              />
            ) : (
              <ul className="space-y-3">
                {completed.map((r) => (
                  <li key={r.enrollment_id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <Link to={`/training-center/admin/students/${r.student_id}`} className="font-semibold hover:text-primary hover:underline">{r.full_name}</Link>
                        <p className="text-sm text-muted-foreground">{r.student_number} · {r.program_name} · {r.intake_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={r.eligibility.eligible ? "eligible" : "not_eligible"} />
                        <Button size="sm" disabled={!r.eligibility.eligible || issue.isPending} onClick={() => issue.mutate(r.enrollment_id)}>
                          <Award className="h-4 w-4" /> Issue certificate
                        </Button>
                      </div>
                    </div>
                    {!r.eligibility.eligible && (
                      <div className="mt-3 border-t pt-3">
                        <EligibilityList eligibility={r.eligibility} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {active.length > 0 && (
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setShowActive((v) => !v)}>
                  {showActive ? "Hide" : "Show"} {plural(active.length, "student")} still in training
                </button>
                {showActive && (
                  <ul className="mt-3 divide-y text-sm">
                    {active.map((r) => (
                      <li key={r.enrollment_id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          {r.full_name} <span className="text-muted-foreground">· {r.program_name}, {r.intake_name}</span>
                        </span>
                        <Link to={`/training-center/admin/students/${r.student_id}`} className="text-xs font-medium text-primary hover:underline">
                          Mark the enrollment completed first →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      }}
    </QueryView>
  );
}

function IssuedList({ intakeId }: { intakeId: string }) {
  const [search, setSearch] = useState("");
  const q = useApi<Issued[]>(withQuery("/admin/certificates", { intake_id: intakeId, q: search.trim() }));
  const [revoking, setRevoking] = useState<Issued | null>(null);
  const revoke = useApiMutation((v: { id: string; reason: string }) => api.post(`/admin/certificates/${v.id}/revoke`, { reason: v.reason }), {
    invalidate: KEYS,
    success: "Certificate revoked",
    onSuccess: () => setRevoking(null),
  });
  return (
    <div className="space-y-4">
      <Input placeholder="Search name, student no. or certificate no." aria-label="Search certificates" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      <QueryView query={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState icon={Award} title={search ? "No certificates match" : "No certificates issued yet"} description="Issued certificates appear here with their verification numbers." />
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Program / intake</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <p className="whitespace-nowrap font-semibold">{c.certificate_number}</p>
                          <p className="text-xs text-muted-foreground">{c.verification_code}</p>
                        </TableCell>
                        <TableCell>
                          <Link to={`/training-center/admin/students/${c.student_id}`} className="font-medium hover:text-primary hover:underline">{c.student_name}</Link>
                          <p className="text-xs text-muted-foreground">{c.student_number}</p>
                        </TableCell>
                        <TableCell>
                          <p>{c.program_name}</p>
                          <p className="text-xs text-muted-foreground">{c.intake_name}</p>
                        </TableCell>
                        <TableCell>{c.final_grade ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(c.issued_on)}</TableCell>
                        <TableCell><StatusBadge status={c.revoked_at ? "revoked" : "valid"} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openApiFile(`/admin/certificates/${c.id}/pdf`)}>
                              <Download className="h-4 w-4" /> PDF
                            </Button>
                            <Button size="sm" variant="ghost" asChild>
                              <Link to={`/training-center/verify/${c.verification_code}`} target="_blank" aria-label={`Open verification page for ${c.certificate_number}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                            {!c.revoked_at && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRevoking(c)}>Revoke</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </div>
          )
        }
      </QueryView>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke ${revoking?.certificate_number ?? ""}?`}
        description="The public verification page will show this certificate as revoked. This can't be undone."
        confirmLabel="Revoke certificate"
        destructive
        noteLabel="Reason"
        noteRequired
        pending={revoke.isPending}
        onConfirm={(reason) => revoking && revoke.mutate({ id: revoking.id, reason })}
      />
    </div>
  );
}

export default function Certificates() {
  const intakes = useIntakes();
  const [intakeId, setIntakeId] = useState("");
  return (
    <div>
      <PageHeader
        title="Certificates"
        subtitle="Issue certificates to students who meet the requirements set in Settings. Anyone can check a certificate on the public verification page."
        actions={
          <NativeSelect aria-label="Intake" value={intakeId} onChange={(e) => setIntakeId(e.target.value)} className="w-56">
            <option value="">All intakes</option>
            {intakes.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </NativeSelect>
        }
      />
      <Tabs defaultValue="ready">
        <TabsList>
          <TabsTrigger value="ready">Ready to issue</TabsTrigger>
          <TabsTrigger value="issued">Issued</TabsTrigger>
        </TabsList>
        <TabsContent value="ready" className="mt-4">
          <ReadyToIssue intakeId={intakeId} />
        </TabsContent>
        <TabsContent value="issued" className="mt-4">
          <IssuedList intakeId={intakeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
