import { useState } from "react";
import { AlertTriangle, Plus, School } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, NativeSelect, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDays, formatTime } from "@/training/lib/format";
import { useApi, withQuery } from "@/training/lib/query";
import type { ClassSummary } from "@/training/lib/types";
import { useIntakes, useTrainers } from "@/training/features/admin-ops/lookups";

export default function Classes() {
  const navigate = useNavigate();
  const [intake, setIntake] = useState("");
  const [trainer, setTrainer] = useState("");
  const [status, setStatus] = useState("active");
  const intakes = useIntakes();
  const trainers = useTrainers();
  const q = useApi<ClassSummary[]>(withQuery("/admin/classes", { intake_id: intake, trainer_id: trainer, status }));
  const filtered = intake || trainer || status !== "active";

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle="Each class is one group of students in a program, with its trainer, room and timetable."
        actions={
          <Button asChild>
            <Link to="/training-center/admin/classes/new"><Plus className="h-4 w-4" /> Create class</Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <NativeSelect aria-label="Intake" value={intake} onChange={(e) => setIntake(e.target.value)}>
          <option value="">All intakes</option>
          {intakes.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Trainer" value={trainer} onChange={(e) => setTrainer(e.target.value)}>
          <option value="">All trainers</option>
          {trainers.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="">Any status</option>
        </NativeSelect>
      </div>
      <QueryView query={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon={School}
              title={filtered ? "No classes match these filters" : "No classes yet"}
              description={filtered ? "Try another intake, trainer or status." : "Create a class for a program in an intake, then assign a trainer and students."}
              action={!filtered && <Button asChild><Link to="/training-center/admin/classes/new">Create class</Link></Button>}
            />
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Program / intake</TableHead>
                      <TableHead>Trainer</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead className="text-right">Students</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/training-center/admin/classes/${c.id}`)}>
                        <TableCell className="font-semibold">
                          <Link to={`/training-center/admin/classes/${c.id}`} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            {c.code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{c.program_name}</p>
                          <p className="text-xs text-muted-foreground">{c.intake_name}</p>
                        </TableCell>
                        <TableCell>
                          {c.trainer_name ?? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-warning">
                              <AlertTriangle className="h-4 w-4" aria-hidden /> No trainer
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDays(c.meeting_days)}
                          <p className="text-xs text-muted-foreground">{formatTime(c.start_time)}–{formatTime(c.end_time)}</p>
                        </TableCell>
                        <TableCell>{c.room || "—"}</TableCell>
                        <TableCell className="tabular text-right">{c.student_count}</TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
