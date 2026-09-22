import { useState } from "react";
import { BarChart3, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Field, NativeSelect, PageHeader, QueryView, StatusBadge, TableWrap } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadApiFile } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";
import { formatMoney, formatPercent } from "@/training/lib/format";
import { useApi, withQuery } from "@/training/lib/query";
import { cn } from "@/lib/utils";
import { useCurrency, useIntakes, usePrograms } from "@/training/features/admin-ops/lookups";

type FilterKey = "intake" | "program" | "dates" | "status" | "q";
type ReportDef = { key: string; name: string; description: string; filters: FilterKey[]; statuses?: string[]; dateLabel?: string };

const REPORTS: ReportDef[] = [
  { key: "enrollment", name: "Student enrollment", description: "Every student enrolled, with program, intake, class and status.", filters: ["intake", "program", "dates", "status", "q"], statuses: ["active", "completed", "withdrawn"], dateLabel: "Enrolled" },
  { key: "intake", name: "Intakes", description: "Seats, enrollments and applications per intake.", filters: ["intake", "status"], statuses: ["draft", "upcoming", "open", "full", "closed", "completed", "archived"] },
  { key: "program", name: "Programs", description: "How each program filled in each intake.", filters: ["intake", "program"] },
  { key: "attendance", name: "Attendance", description: "Sessions attended, late, absent and excused, with attendance %.", filters: ["intake", "program", "status", "q"], statuses: ["active", "completed", "withdrawn"] },
  { key: "payments", name: "Payments", description: "Payments received in a period, with receipt numbers.", filters: ["intake", "program", "dates", "q"], dateLabel: "Paid" },
  { key: "outstanding", name: "Outstanding fees", description: "Students who still owe money, largest balance first.", filters: ["intake", "program", "q"] },
  { key: "results", name: "Assessment results", description: "Average and final marks, grade and pass/fail per student.", filters: ["intake", "program", "status", "q"], statuses: ["active", "completed", "withdrawn"] },
  { key: "completion", name: "Completion", description: "Active, completed and withdrawn students and certificates per program.", filters: ["intake", "program"] },
  { key: "certificates", name: "Certificates", description: "Certificates issued, with verification numbers.", filters: ["intake", "program", "dates"], dateLabel: "Issued" },
];

const MONEY = new Set(["amount", "balance", "total_fees", "total_paid"]);
const PERCENT = new Set(["rate", "percentage", "final_percentage", "completion_rate"]);
const STATUS_COLS = new Set(["status", "payment_status"]);

type Report = { title: string; columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; totals?: Record<string, number> };

export default function Reports() {
  const currency = useCurrency();
  const intakes = useIntakes();
  const programs = usePrograms();
  const [type, setType] = useState("enrollment");
  const [f, setF] = useState({ intake_id: "", program_id: "", from: "", to: "", status: "", q: "" });
  const [downloading, setDownloading] = useState(false);
  const def = REPORTS.find((r) => r.key === type)!;
  const has = (k: FilterKey) => def.filters.includes(k);
  const params = {
    intake_id: has("intake") ? f.intake_id : "",
    program_id: has("program") ? f.program_id : "",
    from: has("dates") ? f.from : "",
    to: has("dates") ? f.to : "",
    status: has("status") ? f.status : "",
    q: has("q") ? f.q.trim() : "",
  };
  const q = useApi<Report>(withQuery(`/admin/reports/${type}`, params));

  const cell = (key: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (MONEY.has(key)) return formatMoney(Number(v), currency);
    if (PERCENT.has(key)) return formatPercent(Number(v));
    if (STATUS_COLS.has(key) && typeof v === "string") return <StatusBadge status={v.toLowerCase()} label={v.includes("_") ? undefined : v.charAt(0).toUpperCase() + v.slice(1)} />;
    return String(v);
  };

  const csv = async () => {
    setDownloading(true);
    try {
      await downloadApiFile(withQuery(`/admin/reports/${type}`, { ...params, format: "csv" }), `isoko-${type}-report.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Choose a report, narrow it down, then download it for Excel or print it."
        actions={
          <div className="no-print flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            <Button onClick={csv} disabled={downloading}><Download className="h-4 w-4" /> Download CSV</Button>
          </div>
        }
      />

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label="Report type">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={r.key === type}
            onClick={() => {
              setType(r.key);
              setF((x) => ({ ...x, status: "" }));
            }}
            className={cn(
              "rounded-lg border bg-card px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:border-primary/40",
              r.key === type && "border-primary bg-secondary text-primary",
            )}
          >
            {r.name}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{def.description}</p>

      <div className="no-print mb-6 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {has("intake") && (
          <Field label="Intake" htmlFor="r-intake">
            <NativeSelect id="r-intake" value={f.intake_id} onChange={(e) => setF({ ...f, intake_id: e.target.value })}>
              <option value="">All intakes</option>
              {intakes.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </NativeSelect>
          </Field>
        )}
        {has("program") && (
          <Field label="Program" htmlFor="r-program">
            <NativeSelect id="r-program" value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
              <option value="">All programs</option>
              {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
        )}
        {has("dates") && (
          <>
            <Field label={`${def.dateLabel} from`} htmlFor="r-from">
              <Input id="r-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </Field>
            <Field label={`${def.dateLabel} to`} htmlFor="r-to">
              <Input id="r-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </Field>
          </>
        )}
        {has("status") && def.statuses && (
          <Field label="Status" htmlFor="r-status">
            <NativeSelect id="r-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">Any status</option>
              {def.statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </NativeSelect>
          </Field>
        )}
        {has("q") && (
          <Field label="Student" htmlFor="r-q">
            <Input id="r-q" placeholder="Name or student no." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </Field>
        )}
      </div>

      <QueryView query={q}>
        {(r) =>
          r.rows.length === 0 ? (
            <EmptyState icon={BarChart3} title="Nothing to show" description="No records match these filters. Try another intake, program or date range." />
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">{r.title}</h2>
                <span className="text-sm text-muted-foreground">{r.rows.length} rows</span>
              </div>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {r.columns.map((c) => (
                        <TableHead key={c.key} className={cn("whitespace-nowrap", (MONEY.has(c.key) || PERCENT.has(c.key)) && "text-right")}>
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.rows.map((row, i) => (
                      <TableRow key={i}>
                        {r.columns.map((c) => (
                          <TableCell
                            key={c.key}
                            className={cn((MONEY.has(c.key) || PERCENT.has(c.key) || typeof row[c.key] === "number") && "tabular", (MONEY.has(c.key) || PERCENT.has(c.key)) && "whitespace-nowrap text-right")}
                          >
                            {cell(c.key, row[c.key])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  {r.totals && (
                    <TableFooter>
                      <TableRow>
                        {r.columns.map((c, i) => (
                          <TableCell key={c.key} className={cn("font-bold", MONEY.has(c.key) && "tabular whitespace-nowrap text-right")}>
                            {r.totals![c.key] !== undefined ? cell(c.key, r.totals![c.key]) : i === 0 ? "Total" : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </TableWrap>
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
