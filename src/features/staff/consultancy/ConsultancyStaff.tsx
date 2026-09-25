import { useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, FileText, Inbox, LayoutDashboard, Settings2, Share2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { db, errorText, formatDate, formatMoney, openFile, shareWithClient, unwrap, uploadStaffFile } from "@/features/services/api";
import { AssignSelect, AttentionTile, ContactButtons, CustomerLinkButton, EmptyState, NotesPanel, Panel, Pill, StaffPage, SubNav, TasksPanel } from "../common";
import { PaymentsPanel } from "@/features/finance/PaymentsPanel";
import { usePendingSubmissions } from "@/features/finance/api";
import { OfferingsManager, StatusStepper } from "../workflow";

type Status = "new" | "contacted" | "assessment" | "proposal_sent" | "approved" | "in_progress" | "completed" | "declined";
const STEPS = ["new", "contacted", "assessment", "proposal_sent", "approved", "in_progress", "completed"] as const;
const LABEL: Record<Status, string> = {
  new: "New", contacted: "Contacted", assessment: "Assessment", proposal_sent: "Proposal sent",
  approved: "Approved", in_progress: "In progress", completed: "Completed", declined: "Declined",
};
const TONE: Record<Status, "new" | "done" | "wait" | "off" | "work"> = {
  new: "new", contacted: "work", assessment: "work", proposal_sent: "wait", approved: "done", in_progress: "done", completed: "off", declined: "off",
};

type Req = {
  id: string; reference: string; access_token: string; service_key: string; service_name: string; description: string;
  client_name: string; organization: string | null; phone: string; email: string; status: Status; assigned_to: string | null;
  start_date: string | null; expected_completion: string | null; staff_notes: string; change_request: string | null;
  change_requested_at: string | null; created_at: string;
};
type Proposal = { id: string; service_title: string; scope: string[]; fee: number; currency: string; timeline: string; status: "draft" | "sent" | "accepted" | "declined" | "withdrawn"; sent_at: string | null; responded_at: string | null; created_at: string };
type CFile = { id: string; kind: "client" | "internal" | "deliverable"; name: string; path: string; shared_path: string | null; shared_at: string | null; created_at: string };

const NAV = [
  { to: "/staff/consultancy", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/staff/consultancy/requests", label: "Requests", icon: Inbox },
  { to: "/staff/consultancy/services", label: "Services", icon: Settings2 },
];
const Nav = () => <SubNav items={NAV} />;

function useRequests() {
  return useQuery({
    queryKey: ["staff_consult_requests"],
    queryFn: async () => unwrap<Req[]>(await db.from("consult_requests").select("*").order("created_at", { ascending: false }).limit(1000)),
    refetchInterval: 60_000,
  });
}

function RequestRow({ r }: { r: Req }) {
  return (
    <li>
      <Link to={`/staff/consultancy/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.organization || r.client_name}</p>
          <p className="truncate text-sm text-muted-foreground">{r.service_name} · {r.reference} · {formatDate(r.created_at, { day: "numeric", month: "short" })}</p>
          <p className="line-clamp-1 text-sm">{r.description}</p>
        </div>
        {r.change_request && ["assessment", "proposal_sent"].includes(r.status) && <Pill tone="wait">Changes asked</Pill>}
        <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

export function ConsultancyDashboard() {
  const reqs = useRequests();
  const pending = usePendingSubmissions("consultancy");
  const all = reqs.data ?? [];
  const count = (f: (r: Req) => boolean) => (reqs.data ? all.filter(f).length : undefined);
  const attention = all.filter((r) => r.status === "new" || (r.status === "assessment" && r.change_request)).slice(0, 8);
  return (
    <StaffPage title="Consultancy" nav={<Nav />}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Needs attention</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AttentionTile tone="alert" count={count((r) => r.status === "new")} label="New requests" to="/staff/consultancy/requests?status=new" />
        <AttentionTile tone="alert" count={count((r) => r.status === "assessment" && !!r.change_request)} label="Proposal changes asked" to="/staff/consultancy/requests?status=assessment" />
        <AttentionTile count={count((r) => r.status === "proposal_sent")} label="Proposals awaiting answer" to="/staff/consultancy/requests?status=proposal_sent" />
        <AttentionTile count={count((r) => r.status === "approved" || r.status === "in_progress")} label="Active projects" to="/staff/consultancy/requests?status=active" />
        <AttentionTile tone="alert" count={pending.data?.length} label="Payments to confirm" to="/staff/consultancy/requests?status=active" />
      </div>
      <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-wider text-muted-foreground">New requests</h2>
      {attention.length === 0 ? <EmptyState>Nothing new. 🎉</EmptyState> : <ul className="divide-y rounded-2xl border bg-card">{attention.map((r) => <RequestRow key={r.id} r={r} />)}</ul>}
    </StaffPage>
  );
}

const FILTERS: { key: string; label: string; test: (r: Req) => boolean }[] = [
  { key: "open", label: "Open", test: (r) => !["completed", "declined"].includes(r.status) },
  { key: "new", label: "New", test: (r) => r.status === "new" },
  { key: "assessment", label: "Assessment", test: (r) => ["contacted", "assessment"].includes(r.status) },
  { key: "proposal_sent", label: "Proposal sent", test: (r) => r.status === "proposal_sent" },
  { key: "active", label: "Projects", test: (r) => ["approved", "in_progress"].includes(r.status) },
  { key: "closed", label: "Closed", test: (r) => ["completed", "declined"].includes(r.status) },
];

export function ConsultancyRequests() {
  const reqs = useRequests();
  const [params, setParams] = useSearchParams();
  const key = params.get("status") ?? "open";
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.key === key) ?? FILTERS[0];
    const s = search.trim().toLowerCase();
    return (reqs.data ?? []).filter(f.test).filter((r) => !s || `${r.client_name} ${r.organization} ${r.reference} ${r.email}`.toLowerCase().includes(s));
  }, [reqs.data, key, search]);
  return (
    <StaffPage title="Requests & projects" nav={<Nav />}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setParams(f.key === "open" ? {} : { status: f.key })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", key === f.key ? "border-transparent bg-foreground text-background" : "bg-card")}>
            {f.label}
          </button>
        ))}
      </div>
      <Input className="mb-4 max-w-sm" placeholder="Search client, organization, reference" value={search} onChange={(e) => setSearch(e.target.value)} />
      {reqs.isLoading ? <p className="text-muted-foreground">Loading…</p> : list.length === 0 ? <EmptyState>Nothing here.</EmptyState> : <ul className="divide-y rounded-2xl border bg-card">{list.map((r) => <RequestRow key={r.id} r={r} />)}</ul>}
    </StaffPage>
  );
}

export function ConsultancyServices() {
  return (
    <StaffPage title="Services" nav={<Nav />}>
      <OfferingsManager service="consultancy" />
    </StaffPage>
  );
}

// ============== PROPOSAL ==============
function ProposalPanel({ req, refresh }: { req: Req; refresh: () => void }) {
  const qc = useQueryClient();
  const key = ["consult_proposals", req.id];
  const q = useQuery({ queryKey: key, queryFn: async () => unwrap<Proposal[]>(await db.from("consult_proposals").select("*").eq("request_id", req.id).order("created_at", { ascending: false })) });
  const latest = q.data?.[0];
  const editable = !latest || latest.status === "draft" || latest.status === "declined" || latest.status === "withdrawn";
  const [editing, setEditing] = useState(false);
  const seed = latest && latest.status !== "withdrawn" ? latest : null;
  const [form, setForm] = useState({ service_title: "", scope: "", fee: "", currency: "USD", timeline: "" });
  const open = () => {
    setForm({
      service_title: seed?.service_title ?? req.service_name,
      scope: (seed?.scope ?? []).join("\n"),
      fee: seed ? String(seed.fee) : "",
      currency: seed?.currency ?? "USD",
      timeline: seed?.timeline ?? "",
    });
    setEditing(true);
  };
  const saveAnd = async (send: boolean) => {
    const row = {
      request_id: req.id, service_title: form.service_title.trim(), scope: form.scope.split("\n").map((s) => s.trim()).filter(Boolean),
      fee: Number(form.fee || 0), currency: form.currency, timeline: form.timeline.trim(),
      status: send ? "sent" : "draft", sent_at: send ? new Date().toISOString() : null,
    };
    const res = latest && latest.status === "draft"
      ? await db.from("consult_proposals").update(row).eq("id", latest.id)
      : await db.from("consult_proposals").insert(row);
    if (res.error) return toast.error(res.error.message);
    if (send) {
      const { error } = await db.from("consult_requests").update({ status: "proposal_sent", change_request: null }).eq("id", req.id);
      if (error) return toast.error(error.message);
    }
    toast.success(send ? "Proposal sent. Share the client link." : "Draft saved");
    setEditing(false);
    qc.invalidateQueries({ queryKey: key });
    refresh();
  };
  const markAccepted = async () => {
    if (!latest) return;
    const a = await db.from("consult_proposals").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", latest.id);
    if (a.error) return toast.error(a.error.message);
    const b = await db.from("consult_requests").update({ status: "approved", change_request: null }).eq("id", req.id);
    if (b.error) return toast.error(b.error.message);
    toast.success("Proposal accepted: the project can start");
    qc.invalidateQueries({ queryKey: key });
    refresh();
  };
  const withdraw = async () => {
    if (!latest) return;
    const { error } = await db.from("consult_proposals").update({ status: "withdrawn" }).eq("id", latest.id);
    if (error) return toast.error(error.message);
    await db.from("consult_requests").update({ status: "assessment" }).eq("id", req.id);
    qc.invalidateQueries({ queryKey: key });
    refresh();
  };

  return (
    <Panel title="Proposal" right={latest && <Pill tone={latest.status === "accepted" ? "done" : latest.status === "sent" ? "wait" : "off"}>{latest.status === "sent" ? "Sent" : latest.status[0].toUpperCase() + latest.status.slice(1)}</Pill>}>
      {editing ? (
        <div className="grid gap-3">
          <label className="text-sm"><span className="text-muted-foreground">Service</span><Input className="mt-1" value={form.service_title} onChange={(e) => setForm({ ...form, service_title: e.target.value })} /></label>
          <label className="text-sm"><span className="text-muted-foreground">Scope (one item per line)</span><Textarea className="mt-1" rows={5} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder={"Process review\nOperations assessment\nRecommendations\nImplementation support"} /></label>
          <div className="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[1fr_6rem_1fr]">
            <label className="text-sm"><span className="text-muted-foreground">Fee</span><Input className="mt-1" type="number" min={0} step="any" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></label>
            <label className="text-sm"><span className="text-muted-foreground">Currency</span>
              <select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{["USD", "RWF", "EUR"].map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="col-span-2 text-sm sm:col-span-1"><span className="text-muted-foreground">Timeline</span><Input className="mt-1" value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} placeholder="4 weeks" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-blue-800 text-white hover:bg-blue-900" disabled={!form.service_title.trim() || !form.fee} onClick={() => saveAnd(true)}>Send Proposal</Button>
            <Button variant="outline" onClick={() => saveAnd(false)}>Save draft</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : latest && latest.status !== "withdrawn" ? (
        <div>
          <p className="font-semibold">{latest.service_title}</p>
          <ul className="mt-2 list-inside list-disc text-sm">{latest.scope.map((s) => <li key={s}>{s}</li>)}</ul>
          <p className="mt-2 text-sm">Fee <span className="font-bold">{formatMoney(latest.fee, latest.currency)}</span>{latest.timeline && <> · Timeline <span className="font-bold">{latest.timeline}</span></>}</p>
          {latest.status === "declined" && req.change_request && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Client asked for changes: “{req.change_request}”</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {editable && <Button variant="outline" onClick={open}>Edit</Button>}
            {latest.status === "sent" && <Button onClick={markAccepted}>Mark Accepted</Button>}
            {latest.status === "sent" && <Button variant="ghost" onClick={withdraw}>Withdraw</Button>}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground">No proposal yet. Write one after the assessment.</p>
          <Button className="mt-3 bg-blue-800 text-white hover:bg-blue-900" onClick={open}>Create proposal</Button>
        </div>
      )}
    </Panel>
  );
}

// ============== FILES ==============
function FilesPanel({ req }: { req: Req }) {
  const qc = useQueryClient();
  const key = ["consult_files", req.id];
  const q = useQuery({ queryKey: key, queryFn: async () => unwrap<CFile[]>(await db.from("consult_files").select("*").eq("request_id", req.id).order("created_at")) });
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"internal" | "deliverable">("deliverable");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const path = await uploadStaffFile("consultancy", req.id, f);
        const { error } = await db.from("consult_files").insert({ request_id: req.id, kind, name: f.name, path, size_bytes: f.size });
        if (error) throw new Error(error.message);
      }
      toast.success("Uploaded");
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const share = async (f: CFile) => {
    try {
      const shared_path = await shareWithClient("consultancy", req.access_token, f.path);
      const { error } = await db.from("consult_files").update({ shared_path, shared_at: new Date().toISOString() }).eq("id", f.id);
      if (error) throw new Error(error.message);
      toast.success("Shared with the client");
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const files = q.data ?? [];
  const group = (k: CFile["kind"], title: string) => {
    const list = files.filter((f) => f.kind === k);
    if (!list.length) return null;
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <ul className="mt-1 space-y-1">
          {list.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {k === "deliverable" && (f.shared_path ? <Pill tone="done">Shared</Pill> : <Button size="sm" variant="outline" onClick={() => share(f)}><Share2 className="mr-1 h-3.5 w-3.5" />Share</Button>)}
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Download ${f.name}`} onClick={() => openFile(f.path, f.name).catch((e) => toast.error(errorText(e)))}><Download className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <Panel title="Documents">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Upload as" className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="deliverable">Report / deliverable</option>
          <option value="internal">Internal working file</option>
        </select>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-1 h-4 w-4" />{busy ? "Uploading…" : "Upload"}</Button>
      </div>
      {files.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No documents yet.</p>}
      {group("client", "From the client")}
      {group("deliverable", "Reports & deliverables (client sees them once shared)")}
      {group("internal", "Internal")}
    </Panel>
  );
}

// ============== DETAIL ==============
export function ConsultancyDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["staff_consult", id], queryFn: async () => unwrap<Req | null>(await db.from("consult_requests").select("*").eq("id", id).maybeSingle()) });
  const proposals = useQuery({ queryKey: ["consult_proposals", id], queryFn: async () => unwrap<Proposal[]>(await db.from("consult_proposals").select("*").eq("request_id", id).order("created_at", { ascending: false })) });
  const accepted = proposals.data?.find((p) => p.status === "accepted");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["staff_consult", id] });
    qc.invalidateQueries({ queryKey: ["staff_consult_requests"] });
  };
  const update = async (patch: Partial<Req>, message?: string) => {
    const { error } = await db.from("consult_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (message) toast.success(message);
    refresh();
  };
  const r = q.data;
  if (q.isLoading) return <StaffPage title="Loading…"><span /></StaffPage>;
  if (!r) return <StaffPage title="Not found"><Link to="/staff/consultancy" className="underline">Back</Link></StaffPage>;
  const isProject = ["approved", "in_progress", "completed"].includes(r.status);

  return (
    <StaffPage
      nav={<Link to="/staff/consultancy/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Requests</Link>}
      title={r.organization || r.client_name}
      subtitle={<span className="flex flex-wrap items-center gap-2">{r.service_name} · <span className="font-mono text-xs">{r.reference}</span> <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill></span>}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <StatusStepper steps={STEPS} labels={LABEL} current={r.status} offRoad={["declined"]} onChange={(s) => update({ status: s }, `Status: ${LABEL[s]}`).catch((e) => toast.error(errorText(e)))} />
          <Panel title="Request">
            <p className="whitespace-pre-line">{r.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">Received {formatDate(r.created_at)}</p>
          </Panel>
          <ProposalPanel req={r} refresh={refresh} />
          {isProject && <TasksPanel table="consult_tasks" requestId={r.id} />}
          <FilesPanel req={r} />
          {isProject && <PaymentsPanel entityTable="consult_requests" entityId={r.id} />}
        </div>
        <aside className="space-y-4">
          <Panel title="Client">
            <p className="font-semibold">{r.client_name}</p>
            {r.organization && <p className="text-sm">{r.organization}</p>}
            <p className="text-sm text-muted-foreground">{r.phone}</p>
            <p className="break-all text-sm text-muted-foreground">{r.email}</p>
            <div className="mt-3"><ContactButtons phone={r.phone} email={r.email} name={r.client_name} reference={r.reference} /></div>
            <div className="mt-2"><CustomerLinkButton path={`/consultancy/r/${r.access_token}`} /></div>
          </Panel>
          <Panel title="Project">
            <div className="space-y-3">
              <AssignSelect service="consultancy" label="Consultant" value={r.assigned_to} onChange={(v) => update({ assigned_to: v }, "Consultant assigned").catch((e) => toast.error(errorText(e)))} />
              <label className="block text-sm"><span className="text-muted-foreground">Start date</span><Input className="mt-1" type="date" defaultValue={r.start_date ?? ""} onBlur={(e) => e.target.value !== (r.start_date ?? "") && update({ start_date: e.target.value || null }).catch((er) => toast.error(errorText(er)))} /></label>
              <label className="block text-sm"><span className="text-muted-foreground">Expected completion</span><Input className="mt-1" type="date" defaultValue={r.expected_completion ?? ""} onBlur={(e) => e.target.value !== (r.expected_completion ?? "") && update({ expected_completion: e.target.value || null }).catch((er) => toast.error(errorText(er)))} /></label>
              {r.status !== "declined" && r.status !== "completed" && (
                <Button variant="ghost" className="w-full text-destructive" onClick={() => window.confirm("Decline and close this request?") && update({ status: "declined" }, "Request declined").catch((e) => toast.error(errorText(e)))}>Decline request</Button>
              )}
            </div>
          </Panel>
          <NotesPanel value={r.staff_notes} onSave={(v) => update({ staff_notes: v })} />
        </aside>
      </div>
    </StaffPage>
  );
}
