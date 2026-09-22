import { useEffect, useState } from "react";
import { ClipboardList, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, NativeSelect, PageHeader, QueryView, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApplicationActions, ApprovalResultHost } from "@/training/features/admin-core/shared";
import { formatDate } from "@/training/lib/format";
import { useApi, withQuery } from "@/training/lib/query";
import type { ApplicationStatus, Intake, Program } from "@/training/lib/types";
import { cn } from "@/lib/utils";

export type ApplicationRow = {
  id: string;
  reference: string;
  full_name: string;
  phone: string;
  email: string;
  status: ApplicationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  decision_note: string | null;
  has_document: boolean;
  intake_program_id: string;
  program_id: string;
  program_name: string;
  intake_id: string;
  intake_name: string;
  available_seats: number;
  student_number: string | null;
};

const TABS = [
  { key: "open", label: "To review", counts: ["pending", "under_review"] },
  { key: "waitlisted", label: "Waitlisted", counts: ["waitlisted"] },
  { key: "approved", label: "Approved", counts: ["approved"] },
  { key: "rejected", label: "Rejected", counts: ["rejected"] },
  { key: "all", label: "All", counts: ["pending", "under_review", "waitlisted", "approved", "rejected", "withdrawn"] },
] as const;

function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "open";
  const intakeId = params.get("intake_id") ?? "";
  const programId = params.get("program_id") ?? "";
  const intakeProgramId = params.get("intake_program_id") ?? "";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  useEffect(() => {
    setSearch(q);
  }, [q]);

  const intakes = useApi<Intake[]>("/admin/intakes");
  const programs = useApi<Program[]>("/admin/programs");
  const list = useApi<{ items: ApplicationRow[]; counts: Record<string, number> }>(
    withQuery("/admin/applications", {
      status: status === "all" ? null : status,
      intake_id: intakeId,
      program_id: programId,
      intake_program_id: intakeProgramId,
      q,
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
  const counts = list.data?.counts ?? {};
  const focused = intakeProgramId && list.data?.items[0];

  return (
    <div>
      <PageHeader title="Applications" subtitle="Review applicants and decide: approve, waitlist or reject." />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Application status">
        {TABS.map((t) => {
          const n = t.counts.reduce((s, k) => s + (counts[k] ?? 0), 0);
          const active = status === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => update({ status: t.key })}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("tabular rounded-full px-2 text-xs", active ? "bg-primary text-primary-foreground" : "bg-muted")}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, application no., phone or email" className="pl-9" aria-label="Search applications" />
        </form>
        <NativeSelect value={intakeId} onChange={(e) => update({ intake_id: e.target.value, intake_program_id: "" })} aria-label="Intake" className="sm:w-52">
          <option value="">All intakes</option>
          {(intakes.data ?? []).filter((i) => i.status !== "archived").map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </NativeSelect>
        <NativeSelect value={programId} onChange={(e) => update({ program_id: e.target.value, intake_program_id: "" })} aria-label="Program" className="sm:w-52">
          <option value="">All programs</option>
          {(programs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      </div>

      {focused && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-secondary/50 px-4 py-3">
          <p className="font-semibold">
            {focused.intake_name} — {focused.program_name}
            <span className="font-normal text-muted-foreground"> · To review: {(counts.pending ?? 0) + (counts.under_review ?? 0)} · {focused.available_seats} seats left</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => update({ intake_program_id: "" })}><X className="mr-1 h-4 w-4" />Show all programs</Button>
        </div>
      )}

      <QueryView query={list}>
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={status === "open" ? "No applications waiting for review." : "No applications match."}
              description={status === "open" ? "New applications from the website appear here. Make sure an intake is open so applicants can apply." : "Try another tab or clear the filters."}
              action={status === "open" ? <Button asChild variant="outline"><Link to="/training-center/admin/intakes">Go to intakes</Link></Button> : undefined}
            />
          ) : (
            <ul className="space-y-3">
              {items.map((a) => (
                <li key={a.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/training-center/admin/applications/${a.id}`} className="font-semibold hover:text-primary">{a.full_name}</Link>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {a.program_name} · {a.intake_name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.reference} · Submitted {formatDate(a.submitted_at)} · {a.phone}
                        {a.status !== "approved" && (
                          <span className={cn("font-medium", a.available_seats <= 0 ? "text-destructive" : a.available_seats <= 3 ? "text-warning" : "")}>
                            {" "}· {a.available_seats <= 0 ? "Program full" : `${a.available_seats} seats left`}
                          </span>
                        )}
                        {a.student_number && <span className="font-medium text-success"> · {a.student_number}</span>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" variant="ghost"><Link to={`/training-center/admin/applications/${a.id}`}>View</Link></Button>
                      <ApplicationActions app={a} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

export default function Applications() {
  return (
    <ApprovalResultHost>
      <ApplicationsPage />
    </ApprovalResultHost>
  );
}
