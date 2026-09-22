import { useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, FileText, Inbox, LayoutDashboard, Plus, Settings2, Share2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { db, errorText, formatDate, formatMoney, openFile, shareWithClient, todayIso, unwrap, uploadStaffFile } from "@/features/services/api";
import { DELIVERABLE_LABEL } from "@/features/data/constants";
import { AssignSelect, AttentionTile, ContactButtons, CustomerLinkButton, EmptyState, NotesPanel, Panel, PaymentsPanel, Pill, StaffPage, SubNav, TasksPanel } from "../common";
import { OfferingsManager, StatusStepper } from "../workflow";

type Status = "new" | "data_received" | "reviewing" | "analysis" | "draft_report" | "client_review" | "completed" | "cancelled";
const STEPS = ["new", "data_received", "reviewing", "analysis", "draft_report", "client_review", "completed"] as const;
const LABEL: Record<Status, string> = {
  new: "New", data_received: "Data received", reviewing: "Reviewing", analysis: "Analysis", draft_report: "Draft report",
  client_review: "Client review", completed: "Completed", cancelled: "Cancelled",
};
const TONE: Record<Status, "new" | "done" | "wait" | "off" | "work"> = {
  new: "new", data_received: "work", reviewing: "work", analysis: "work", draft_report: "work", client_review: "wait", completed: "off", cancelled: "off",
};

type Req = {
  id: string; reference: string; access_token: string; service_name: string; description: string; data_later: boolean;
  client_name: string; organization: string | null; phone: string; email: string; status: Status; assigned_to: string | null;
  start_date: string | null; deadline: string | null; fee: number | null; currency: string; staff_notes: string;
  client_feedback: string | null; client_feedback_at: string | null; created_at: string;
};
type DFile = { id: string; name: string; path: string; size_bytes: number | null; from_client: boolean; created_at: string };
type Deliverable = { id: string; kind: string; name: string; description: string; file_path: string | null; file_name: string | null; shared_path: string | null; status: "pending" | "in_progress" | "done"; completed_at: string | null };

const NAV = [
  { to: "/staff/data", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/staff/data/projects", label: "Projects", icon: Inbox },
  { to: "/staff/data/services", label: "Services", icon: Settings2 },
];
const Nav = () => <SubNav items={NAV} />;

function useProjects() {
  return useQuery({
    queryKey: ["staff_data_requests"],
    queryFn: async () => unwrap<(Req & { data_files: { count: number }[] })[]>(await db.from("data_requests").select("*, data_files(count)").order("created_at", { ascending: false }).limit(1000)),
    refetchInterval: 60_000,
  });
}

function ProjectRow({ r }: { r: Req & { data_files?: { count: number }[] } }) {
  const files = r.data_files?.[0]?.count ?? 0;
  const late = r.deadline && r.deadline < todayIso() && !["completed", "cancelled"].includes(r.status);
  return (
    <li>
      <Link to={`/staff/data/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.organization || r.client_name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {r.service_name} · {r.reference} · {files ? `${files} data file${files > 1 ? "s" : ""}` : "no data yet"}
            {r.deadline && <> · due {formatDate(r.deadline, { day: "numeric", month: "short" })}</>}
          </p>
          <p className="line-clamp-1 text-sm">{r.description}</p>
        </div>
        {late && <Pill tone="wait">Late</Pill>}
        <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

export function DataDashboard() {
  const projects = useProjects();
  const pending = useQuery({
    queryKey: ["staff_payments", "data"],
    queryFn: async () => unwrap<{ id: string }[]>(await db.from("data_payments").select("id").eq("status", "pending")),
  });
  const all = projects.data ?? [];
  const count = (f: (r: Req) => boolean) => (projects.data ? all.filter(f).length : undefined);
  const today = todayIso();
  const fresh = all.filter((r) => r.status === "new" || (r.status === "analysis" && r.client_feedback)).slice(0, 8);
  return (
    <StaffPage title="Data Analysis" nav={<Nav />}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Needs attention</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AttentionTile tone="alert" count={count((r) => r.status === "new")} label="New requests" to="/staff/data/projects?status=new" />
        <AttentionTile count={count((r) => ["data_received", "reviewing", "analysis", "draft_report"].includes(r.status))} label="In progress" to="/staff/data/projects?status=active" />
        <AttentionTile count={count((r) => r.status === "client_review")} label="Waiting for client review" to="/staff/data/projects?status=client_review" />
        <AttentionTile tone="alert" count={count((r) => !!r.deadline && r.deadline <= today && !["completed", "cancelled", "client_review"].includes(r.status))} label="Due today or late" to="/staff/data/projects?status=active" />
        <AttentionTile tone="alert" count={pending.data?.length} label="Payments to confirm" to="/staff/data/projects" />
      </div>
      <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-wider text-muted-foreground">New requests & client feedback</h2>
      {fresh.length === 0 ? <EmptyState>Nothing new. 🎉</EmptyState> : <ul className="divide-y rounded-2xl border bg-card">{fresh.map((r) => <ProjectRow key={r.id} r={r} />)}</ul>}
    </StaffPage>
  );
}

const FILTERS: { key: string; label: string; test: (r: Req) => boolean }[] = [
  { key: "open", label: "Open", test: (r) => !["completed", "cancelled"].includes(r.status) },
  { key: "new", label: "New", test: (r) => r.status === "new" },
  { key: "active", label: "In progress", test: (r) => ["data_received", "reviewing", "analysis", "draft_report"].includes(r.status) },
  { key: "client_review", label: "Client review", test: (r) => r.status === "client_review" },
  { key: "closed", label: "Closed", test: (r) => ["completed", "cancelled"].includes(r.status) },
];

export function DataProjects() {
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  const key = params.get("status") ?? "open";
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.key === key) ?? FILTERS[0];
    const s = search.trim().toLowerCase();
    return (projects.data ?? []).filter(f.test).filter((r) => !s || `${r.client_name} ${r.organization} ${r.reference} ${r.email}`.toLowerCase().includes(s));
  }, [projects.data, key, search]);
  return (
    <StaffPage title="Projects" nav={<Nav />}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setParams(f.key === "open" ? {} : { status: f.key })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", key === f.key ? "border-transparent bg-foreground text-background" : "bg-card")}>
            {f.label}
          </button>
        ))}
      </div>
      <Input className="mb-4 max-w-sm" placeholder="Search client, organization, reference" value={search} onChange={(e) => setSearch(e.target.value)} />
      {projects.isLoading ? <p className="text-muted-foreground">Loading…</p> : list.length === 0 ? <EmptyState>Nothing here.</EmptyState> : <ul className="divide-y rounded-2xl border bg-card">{list.map((r) => <ProjectRow key={r.id} r={r} />)}</ul>}
    </StaffPage>
  );
}

export function DataServices() {
  return (
    <StaffPage title="Services" nav={<Nav />}>
      <OfferingsManager service="data" />
    </StaffPage>
  );
}

// ============== DETAIL ==============
function ClientData({ req }: { req: Req }) {
  const q = useQuery({ queryKey: ["data_files", req.id], queryFn: async () => unwrap<DFile[]>(await db.from("data_files").select("*").eq("request_id", req.id).order("created_at")) });
  const files = q.data ?? [];
  return (
    <Panel title="Data from the client">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{req.data_later ? "The client will provide the data later." : "No files yet."} They can upload from their project link.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.size_bytes ? `${(f.size_bytes / 1024 / 1024).toFixed(1)} MB · ` : ""}{formatDate(f.created_at, { day: "numeric", month: "short" })}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Download ${f.name}`} onClick={() => openFile(f.path, f.name).catch((e) => toast.error(errorText(e)))}><Download className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const KINDS = ["cleaned_dataset", "analysis", "charts", "dashboard", "final_report", "other"] as const;

function DeliverableRow({ d, req, refresh }: { d: Deliverable; req: Req; refresh: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const patch = async (p: Partial<Deliverable>, message?: string) => {
    const { error } = await db.from("data_deliverables").update(p).eq("id", d.id);
    if (error) return toast.error(error.message);
    if (message) toast.success(message);
    refresh();
  };
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const path = await uploadStaffFile("data", req.id, f);
      // A new file replaces what the client sees only when shared again
      await patch({ file_path: path, file_name: f.name, shared_path: null, status: d.status === "pending" ? "in_progress" : d.status }, "File uploaded");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const shareDone = async () => {
    try {
      const shared_path = d.file_path ? await shareWithClient("data", req.access_token, d.file_path) : null;
      await patch({ status: "done", completed_at: new Date().toISOString(), shared_path }, d.file_path ? "Marked complete and shared with the client" : "Marked complete");
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <li className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{d.name}</span>
        <Pill tone={d.status === "done" ? "done" : d.status === "in_progress" ? "work" : "off"}>{d.status === "done" ? "Complete" : d.status === "in_progress" ? "In progress" : "To do"}</Pill>
        {d.shared_path && <Pill tone="done">Client can download</Pill>}
        <span className="ml-auto flex gap-1">
          <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" />{busy ? "…" : d.file_path ? "Replace" : "Upload"}</Button>
          {d.file_path && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Download ${d.name}`} onClick={() => openFile(d.file_path!, d.file_name ?? d.name).catch((e) => toast.error(errorText(e)))}><Download className="h-4 w-4" /></Button>}
          {d.status !== "done" || !d.shared_path ? (
            <Button size="sm" onClick={shareDone}><Share2 className="mr-1 h-3.5 w-3.5" />{d.file_path ? "Complete & share" : "Mark complete"}</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => patch({ status: "in_progress", shared_path: null }, "Hidden from the client")}>Unshare</Button>
          )}
          {d.status === "pending" && !d.file_path && (
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${d.name}`} onClick={async () => { const { error } = await db.from("data_deliverables").delete().eq("id", d.id); if (error) toast.error(error.message); refresh(); }}><Trash2 className="h-4 w-4" /></Button>
          )}
        </span>
      </div>
      {d.description && <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>}
      {d.file_name && <p className="mt-1 text-xs text-muted-foreground">File: {d.file_name}</p>}
    </li>
  );
}

function DeliverablesPanel({ req }: { req: Req }) {
  const qc = useQueryClient();
  const key = ["data_deliverables", req.id];
  const q = useQuery({ queryKey: key, queryFn: async () => unwrap<Deliverable[]>(await db.from("data_deliverables").select("*").eq("request_id", req.id).order("created_at")) });
  const [kind, setKind] = useState<(typeof KINDS)[number]>("final_report");
  const [desc, setDesc] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await db.from("data_deliverables").insert({ request_id: req.id, kind, name: DELIVERABLE_LABEL[kind], description: desc.trim() });
    if (error) return toast.error(error.message);
    setDesc("");
    refresh();
  };
  return (
    <Panel title="Deliverables">
      <ul className="space-y-2">{(q.data ?? []).map((d) => <DeliverableRow key={d.id} d={d} req={req} refresh={refresh} />)}</ul>
      {(q.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Add what you'll hand over: cleaned data, charts, dashboard, final report…</p>}
      <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
        <select aria-label="Deliverable" className="h-10 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map((k) => <option key={k} value={k}>{DELIVERABLE_LABEL[k]}</option>)}
        </select>
        <Input className="min-w-[12rem] flex-1" placeholder="Short description for the client (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} />
        <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Add</Button>
      </form>
    </Panel>
  );
}

export function DataDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["staff_data", id], queryFn: async () => unwrap<Req | null>(await db.from("data_requests").select("*").eq("id", id).maybeSingle()) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["staff_data", id] });
    qc.invalidateQueries({ queryKey: ["staff_data_requests"] });
  };
  const update = async (patch: Partial<Req>, message?: string) => {
    const { error } = await db.from("data_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (message) toast.success(message);
    refresh();
  };
  const [fee, setFee] = useState<string | null>(null);
  const r = q.data;
  if (q.isLoading) return <StaffPage title="Loading…"><span /></StaffPage>;
  if (!r) return <StaffPage title="Not found"><Link to="/staff/data" className="underline">Back</Link></StaffPage>;
  const feeValue = fee ?? (r.fee == null ? "" : String(r.fee));

  return (
    <StaffPage
      nav={<Link to="/staff/data/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Projects</Link>}
      title={r.organization || r.client_name}
      subtitle={<span className="flex flex-wrap items-center gap-2">{r.service_name} · <span className="font-mono text-xs">{r.reference}</span> <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill></span>}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <StatusStepper steps={STEPS} labels={LABEL} current={r.status} offRoad={["cancelled"]} onChange={(s) => update({ status: s }, `Status: ${LABEL[s]}`).catch((e) => toast.error(errorText(e)))} />
          {r.client_feedback && (
            <div className={cn("rounded-2xl border p-4 text-sm", r.status === "analysis" && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30")}>
              <span className="font-semibold">Client feedback{r.client_feedback_at && ` (${formatDate(r.client_feedback_at, { day: "numeric", month: "short" })})`}:</span> “{r.client_feedback}”
            </div>
          )}
          <Panel title="Request">
            <p className="whitespace-pre-line">{r.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">Received {formatDate(r.created_at)}</p>
          </Panel>
          <ClientData req={r} />
          <DeliverablesPanel req={r} />
          <TasksPanel table="data_tasks" requestId={r.id} />
          <PaymentsPanel table="data_payments" fk="request_id" parentId={r.id} total={r.fee == null ? null : Number(r.fee)} currency={r.currency} />
        </div>
        <aside className="space-y-4">
          <Panel title="Client">
            <p className="font-semibold">{r.client_name}</p>
            {r.organization && <p className="text-sm">{r.organization}</p>}
            <p className="text-sm text-muted-foreground">{r.phone}</p>
            <p className="break-all text-sm text-muted-foreground">{r.email}</p>
            <div className="mt-3"><ContactButtons phone={r.phone} email={r.email} name={r.client_name} reference={r.reference} /></div>
            <div className="mt-2"><CustomerLinkButton path={`/data-analysis/r/${r.access_token}`} /></div>
          </Panel>
          <Panel title="Project">
            <div className="space-y-3">
              <AssignSelect service="data" label="Analyst" value={r.assigned_to} onChange={(v) => update({ assigned_to: v }, "Analyst assigned").catch((e) => toast.error(errorText(e)))} />
              <label className="block text-sm"><span className="text-muted-foreground">Start date</span><Input className="mt-1" type="date" defaultValue={r.start_date ?? ""} onBlur={(e) => e.target.value !== (r.start_date ?? "") && update({ start_date: e.target.value || null }).catch((er) => toast.error(errorText(er)))} /></label>
              <label className="block text-sm"><span className="text-muted-foreground">Deadline</span><Input className="mt-1" type="date" defaultValue={r.deadline ?? ""} onBlur={(e) => e.target.value !== (r.deadline ?? "") && update({ deadline: e.target.value || null }).catch((er) => toast.error(errorText(er)))} /></label>
              <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <label className="text-sm"><span className="text-muted-foreground">Price for the client</span><Input className="mt-1" type="number" min={0} step="any" value={feeValue} onChange={(e) => setFee(e.target.value)} /></label>
                <label className="text-sm"><span className="text-muted-foreground">Currency</span>
                  <select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={r.currency} onChange={(e) => update({ currency: e.target.value }).catch((er) => toast.error(errorText(er)))}>{["USD", "RWF", "EUR"].map((c) => <option key={c}>{c}</option>)}</select>
                </label>
              </div>
              {fee !== null && fee !== (r.fee == null ? "" : String(r.fee)) && (
                <Button size="sm" onClick={() => update({ fee: fee === "" ? null : Number(fee) }, fee === "" ? "Price removed" : `Price set: ${formatMoney(fee, r.currency)}`).then(() => setFee(null)).catch((e) => toast.error(errorText(e)))}>Save price</Button>
              )}
              {!["completed", "cancelled"].includes(r.status) && (
                <Button variant="ghost" className="w-full text-destructive" onClick={() => window.confirm("Cancel this project?") && update({ status: "cancelled" }, "Project cancelled").catch((e) => toast.error(errorText(e)))}>Cancel project</Button>
              )}
            </div>
          </Panel>
          <NotesPanel value={r.staff_notes} onSave={(v) => update({ staff_notes: v })} />
        </aside>
      </div>
    </StaffPage>
  );
}
