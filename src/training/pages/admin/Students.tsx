import { useEffect, useState } from "react";
import { GraduationCap, Plus, Search, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, NativeSelect, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatPercent } from "@/training/lib/format";
import { useApi, withQuery } from "@/training/lib/query";
import type { EnrollmentStatus, Intake, PaymentStatus, Program } from "@/training/lib/types";

type Row = {
  student_id: string;
  student_number: string;
  full_name: string;
  phone: string;
  email: string;
  enrollment_id: string;
  status: EnrollmentStatus;
  program_name: string;
  intake_name: string;
  class_code: string | null;
  attendance_rate: number | null;
  payment_status: PaymentStatus;
  balance: number;
  grade: string | null;
};

export default function Students() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const get = (k: string) => params.get(k) ?? "";
  const [search, setSearch] = useState(get("q"));
  useEffect(() => {
    setSearch(params.get("q") ?? "");
  }, [params]);

  const intakes = useApi<Intake[]>("/admin/intakes");
  const programs = useApi<Program[]>("/admin/programs");
  const list = useApi<Row[]>(
    withQuery("/admin/students", {
      q: get("q"), intake_id: get("intake_id"), program_id: get("program_id"), status: get("status"),
      payment_status: get("payment_status"), unassigned: get("unassigned"),
    }),
  );
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const filtered = ["q", "intake_id", "program_id", "status", "payment_status", "unassigned"].some((k) => params.get(k));

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Every enrollment: one row per student per program."
        actions={<Button asChild><Link to="/training-center/admin/students/new"><Plus className="mr-1.5 h-4 w-4" />Add Student</Link></Button>}
      />

      <div className="mb-5 grid gap-2 md:grid-cols-[1fr_repeat(4,auto)]">
        <form role="search" className="relative" onSubmit={(e) => { e.preventDefault(); update({ q: search.trim() }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, student no., phone or email" className="pl-9" aria-label="Search students" />
        </form>
        <NativeSelect value={get("intake_id")} onChange={(e) => update({ intake_id: e.target.value })} aria-label="Intake" className="md:w-44">
          <option value="">All intakes</option>
          {(intakes.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </NativeSelect>
        <NativeSelect value={get("program_id")} onChange={(e) => update({ program_id: e.target.value })} aria-label="Program" className="md:w-44">
          <option value="">All programs</option>
          {(programs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <NativeSelect value={get("status")} onChange={(e) => update({ status: e.target.value })} aria-label="Enrollment status" className="md:w-36">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="withdrawn">Withdrawn</option>
        </NativeSelect>
        <NativeSelect value={get("payment_status")} onChange={(e) => update({ payment_status: e.target.value })} aria-label="Payment status" className="md:w-40">
          <option value="">Any payment</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially paid</option>
          <option value="outstanding">Outstanding</option>
        </NativeSelect>
      </div>
      {params.get("unassigned") && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border bg-warning-soft px-4 py-2 text-sm">
          <span>Showing students who are not in a class yet.</span>
          <Button variant="ghost" size="sm" onClick={() => update({ unassigned: "" })}><X className="mr-1 h-4 w-4" />Clear</Button>
        </div>
      )}

      <QueryView query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={filtered ? "No students match these filters." : "No students yet."}
              description={filtered ? "Clear a filter or search differently." : "Students appear here when you approve applications, or add a walk-in student yourself."}
              action={filtered ? <Button variant="outline" onClick={() => setParams({})}>Clear filters</Button> : <Button asChild><Link to="/training-center/admin/applications">Review applications</Link></Button>}
            />
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "enrollment" : "enrollments"}</p>
              <div className="hidden rounded-xl border bg-card shadow-sm lg:block">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Attendance</TableHead>
                        <TableHead>Fees</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.enrollment_id} className="cursor-pointer" onClick={() => navigate(`/training-center/admin/students/${r.student_id}`)}>
                          <TableCell>
                            <Link to={`/training-center/admin/students/${r.student_id}`} className="font-semibold hover:text-primary" onClick={(e) => e.stopPropagation()}>{r.full_name}</Link>
                            <p className="text-xs text-muted-foreground">{r.student_number} · {r.phone}</p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.program_name}
                            <p className="text-xs text-muted-foreground">{r.intake_name}</p>
                          </TableCell>
                          <TableCell className="text-sm">{r.class_code ?? <span className="text-warning">No class</span>}</TableCell>
                          <TableCell className="tabular text-right text-sm">{formatPercent(r.attendance_rate)}</TableCell>
                          <TableCell><StatusBadge status={r.payment_status} /></TableCell>
                          <TableCell className="tabular text-right text-sm">{formatMoney(Math.max(r.balance, 0))}</TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </div>
              <ul className="space-y-3 lg:hidden">
                {rows.map((r) => (
                  <li key={r.enrollment_id}>
                    <Link to={`/training-center/admin/students/${r.student_id}`} className="block rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{r.full_name}</p>
                          <p className="text-xs text-muted-foreground">{r.student_number}</p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-2 text-sm">{r.program_name} · <span className="text-muted-foreground">{r.intake_name}</span></p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{r.class_code ?? "No class"}</span>·<span>Attendance {formatPercent(r.attendance_rate)}</span>·
                        <StatusBadge status={r.payment_status} />
                        {r.balance > 0 && <span>{formatMoney(r.balance)} due</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </QueryView>
    </div>
  );
}
