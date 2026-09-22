import { BookOpen, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration, formatMoney } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { Program } from "@/training/lib/types";

export default function Programs() {
  const q = useApi<Program[]>("/admin/programs");
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Programs"
        subtitle="Reusable courses. Add a program to any intake without creating it again."
        actions={<Button asChild><Link to="/training-center/admin/programs/new"><Plus className="mr-1.5 h-4 w-4" />New program</Link></Button>}
      />
      <QueryView query={q}>
        {(programs) =>
          programs.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No programs yet."
              description="Create the training programs you offer, for example Full-Stack Web Development. Then add them to intakes."
              action={<Button asChild><Link to="/training-center/admin/programs/new">Create your first program</Link></Button>}
            />
          ) : (
            <>
              <div className="hidden rounded-xl border bg-card shadow-sm md:block">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Program</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead className="text-right">Tuition</TableHead>
                        <TableHead className="text-right">Intakes</TableHead>
                        <TableHead className="text-right">Active students</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {programs.map((p) => (
                        <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/training-center/admin/programs/${p.id}`)}>
                          <TableCell>
                            <Link to={`/training-center/admin/programs/${p.id}`} className="font-semibold hover:text-primary" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                            <p className="text-xs text-muted-foreground">{p.code}</p>
                          </TableCell>
                          <TableCell className="text-sm">{p.category}</TableCell>
                          <TableCell className="text-sm">{formatDuration(p.duration_value, p.duration_unit)}</TableCell>
                          <TableCell className="tabular text-right text-sm">{formatMoney(p.tuition_fee)}</TableCell>
                          <TableCell className="tabular text-right">{p.intake_count ?? 0}</TableCell>
                          <TableCell className="tabular text-right">{p.active_students ?? 0}</TableCell>
                          <TableCell><StatusBadge status={p.is_active ? "active" : "archived"} label={p.is_active ? "Active" : "Inactive"} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </div>
              <ul className="space-y-3 md:hidden">
                {programs.map((p) => (
                  <li key={p.id}>
                    <Link to={`/training-center/admin/programs/${p.id}`} className="block rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{p.name}</p>
                        <StatusBadge status={p.is_active ? "active" : "archived"} label={p.is_active ? "Active" : "Inactive"} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {p.category} · {formatDuration(p.duration_value, p.duration_unit)} · {formatMoney(p.tuition_fee)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{p.intake_count ?? 0} intakes · {p.active_students ?? 0} active students</p>
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
