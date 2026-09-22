import { CalendarDays, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applicationWindow } from "@/training/features/admin-core/shared";
import { formatDate, formatPeriod, plural } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { Intake } from "@/training/lib/types";

const WINDOW_LABEL = { upcoming: "Upcoming", open: "Open", closed: "Closed" } as const;

function ApplicationPeriod({ i }: { i: Intake }) {
  const w = i.application_window ?? applicationWindow(i.application_opens_on, i.application_closes_on);
  return (
    <div>
      <p className="text-sm font-medium">{WINDOW_LABEL[w]}</p>
      <p className="text-xs text-muted-foreground">
        {formatDate(i.application_opens_on)} – {formatDate(i.application_closes_on)}
      </p>
    </div>
  );
}

function Status({ i }: { i: Intake }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={i.status} />
      {i.status_mode === "manual" && !["draft", "completed", "archived"].includes(i.status) && (
        <span className="text-[11px] text-muted-foreground">Set manually</span>
      )}
    </div>
  );
}

export default function Intakes() {
  const q = useApi<Intake[]>("/admin/intakes");
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Intakes"
        subtitle="Each intake is an application period with its own programs and seats."
        actions={<Button asChild><Link to="/training-center/admin/intakes/new"><Plus className="mr-1.5 h-4 w-4" />Create Intake</Link></Button>}
      />
      <QueryView query={q}>
        {(intakes) =>
          intakes.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No intakes yet."
              description="An intake is a period when applicants can apply, for example the January 2027 Intake."
              action={<Button asChild><Link to="/training-center/admin/intakes/new">Create your first intake</Link></Button>}
            />
          ) : (
            <>
              <div className="hidden rounded-xl border bg-card shadow-sm md:block">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Intake</TableHead>
                        <TableHead>Application period</TableHead>
                        <TableHead>Training period</TableHead>
                        <TableHead className="text-right">Programs</TableHead>
                        <TableHead className="text-right">Enrolled</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {intakes.map((i) => (
                        <TableRow key={i.id} className="cursor-pointer" onClick={() => navigate(`/training-center/admin/intakes/${i.id}`)}>
                          <TableCell>
                            <Link to={`/training-center/admin/intakes/${i.id}`} className="font-semibold hover:text-primary" onClick={(e) => e.stopPropagation()}>
                              {i.name}
                            </Link>
                            {i.pending_applications > 0 && <p className="text-xs font-medium text-warning">{i.pending_applications} pending applications</p>}
                          </TableCell>
                          <TableCell><ApplicationPeriod i={i} /></TableCell>
                          <TableCell className="text-sm">{formatPeriod(i.training_starts_on, i.training_ends_on)}</TableCell>
                          <TableCell className="tabular text-right">{i.program_count}</TableCell>
                          <TableCell className="tabular text-right text-sm">{i.enrolled} / {i.capacity}</TableCell>
                          <TableCell><Status i={i} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </div>
              <ul className="space-y-3 md:hidden">
                {intakes.map((i) => (
                  <li key={i.id}>
                    <Link to={`/training-center/admin/intakes/${i.id}`} className="block rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">{i.name}</p>
                        <Status i={i} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Applications</p>
                          <ApplicationPeriod i={i} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Training</p>
                          <p className="font-medium">{formatPeriod(i.training_starts_on, i.training_ends_on)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {plural(i.program_count, "program")} · {i.enrolled} / {i.capacity} enrolled
                        {i.pending_applications > 0 && <span className="font-semibold text-warning"> · {i.pending_applications} pending</span>}
                      </p>
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
