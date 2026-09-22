import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DOC_FILE_ACCEPT, DATA_FILE_ACCEPT, errorText, formatDate, formatMoney, openClientFile, rpc } from "@/features/services/api";
import { ClientFiles, FileList } from "@/features/services/ClientFiles";
import {
  FlowColumn, FormError, NextStep, NotFoundCard, PageLoading, PaymentBox, PrimaryButton, SectionCard, ServiceLayout,
  StageList, stagesFrom, THEME, WhatsAppButton,
} from "@/features/services/ui";

export type ConsultStatus = "new" | "contacted" | "assessment" | "proposal_sent" | "approved" | "in_progress" | "completed" | "declined";

type View = {
  reference: string; service_name: string; description: string; client_name: string; organization: string | null;
  status: ConsultStatus; start_date: string | null; expected_completion: string | null; consultant: string | null;
  change_request: string | null; created_at: string;
  proposal: { service_title: string; scope: string[]; fee: number; currency: string; timeline: string; status: "sent" | "accepted" | "declined"; sent_at: string } | null;
  tasks_total: number; tasks_done: number;
  files: { id: string; name: string; kind: "client" | "deliverable" | "internal"; path: string | null; created_at: string }[];
  paid: number; pending_payment: number;
};

const STAGES = ["Request received", "Contacted", "Assessment", "Proposal", "Approved", "In progress", "Completed"];
const STAGE_INDEX: Record<ConsultStatus, number> = {
  new: 1, contacted: 2, assessment: 2, proposal_sent: 4, approved: 5, in_progress: 5, completed: 6, declined: 0,
};

const NEXT: Record<ConsultStatus, { done: string; next: string }> = {
  new: { done: "Request received", next: "A consultant contacts you to understand your need" },
  contacted: { done: "We contacted you", next: "Assessment of your situation" },
  assessment: { done: "Assessment started", next: "Your proposal: scope, timeline and fee" },
  proposal_sent: { done: "Proposal sent", next: "Your decision on the proposal" },
  approved: { done: "Proposal accepted", next: "The project starts" },
  in_progress: { done: "Project started", next: "Findings and recommendations" },
  completed: { done: "Project completed", next: "" },
  declined: { done: "Request closed", next: "" },
};

function Proposal({ view, token, refresh }: { view: View; token: string; refresh: () => void }) {
  const p = view.proposal!;
  const waiting = p.status === "sent" && view.status === "proposal_sent";
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    try {
      await rpc("consult_accept_proposal", { p_token: token });
      toast.success("Proposal accepted. Your project is starting.");
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const sendChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await rpc("consult_request_changes", { p_token: token, p_message: text });
      toast.success("Sent. Your consultant will update the proposal.");
      setChanging(false);
      refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard className={cn(waiting && "border-blue-700/40 shadow-md")}>
      <p className={cn("text-xs font-bold uppercase tracking-wider", THEME.consultancy.text)}>Isoko Consultancy · Proposal</p>
      <h2 className="mt-1 font-display text-2xl font-bold">{p.service_title}</h2>
      <p className="text-sm text-muted-foreground">For {view.organization || view.client_name}</p>
      {p.scope.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold">Scope</p>
          <ul className="mt-2 space-y-1.5">
            {p.scope.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", THEME.consultancy.text)} /> {s}
              </li>
            ))}
          </ul>
        </>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">Fee</dt>
          <dd className="text-xl font-bold">{formatMoney(p.fee, p.currency)}</dd>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">Timeline</dt>
          <dd className="text-xl font-bold">{p.timeline || "To agree"}</dd>
        </div>
      </dl>
      {p.status === "accepted" && <p className={cn("mt-4 font-semibold", THEME.consultancy.text)}>✓ You accepted this proposal</p>}
      {waiting && !changing && (
        <div className="mt-5 space-y-3">
          <PrimaryButton service="consultancy" busy={busy} onClick={accept}>Accept Proposal</PrimaryButton>
          <Button variant="outline" size="lg" className="h-12 w-full" onClick={() => setChanging(true)}>Request Changes</Button>
        </div>
      )}
      {changing && (
        <form onSubmit={sendChanges} className="mt-5 space-y-3">
          <label htmlFor="changes" className="font-semibold">What would you like to change?</label>
          <Textarea id="changes" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setChanging(false)}>Cancel</Button>
            <Button type="submit" className={cn("flex-1", THEME.consultancy.button)} disabled={busy || !text.trim()}>Send</Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

export default function ConsultancyPage() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["consult_request", token],
    queryFn: () => rpc<View | null>("consult_request_view", { p_token: token }),
    refetchInterval: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["consult_request", token] });

  if (q.isLoading) return <ServiceLayout><PageLoading /></ServiceLayout>;
  const v = q.data;
  if (!v) return <ServiceLayout><NotFoundCard what="Request" backTo="/consultancy" backLabel="Isoko Consultancy" /></ServiceLayout>;

  const isProject = ["approved", "in_progress", "completed"].includes(v.status);
  const open = !["completed", "declined"].includes(v.status);
  const deliverables = v.files.filter((f) => f.kind === "deliverable");
  const clientFiles = v.files.filter((f) => f.kind === "client");
  const fee = v.proposal?.status === "accepted" ? Number(v.proposal.fee) : 0;
  const next = NEXT[v.status];

  return (
    <ServiceLayout>
      <FlowColumn className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{v.reference}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{isProject ? "Your consultancy project" : "Your consultancy request"}</h1>
          <p className="mt-1 text-lg text-muted-foreground">{v.proposal?.service_title ?? v.service_name}</p>
        </div>

        {v.status === "declined" ? (
          <SectionCard>
            <p>This request is closed. If you'd like to talk about it, contact us.</p>
          </SectionCard>
        ) : (
          <NextStep
            service="consultancy"
            done={next.done}
            next={next.next || null}
            action={v.status === "proposal_sent" ? <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">Your next action: review the proposal below</p> : null}
          />
        )}

        {v.proposal && v.proposal.status !== "declined" && <Proposal view={v} token={token} refresh={refresh} />}

        {isProject && (
          <SectionCard title="Project">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Consultant</dt><dd className="font-medium">{v.consultant ?? "Being assigned"}</dd></div>
              <div><dt className="text-muted-foreground">Progress</dt><dd className="font-medium">{v.tasks_total ? `${v.tasks_done} of ${v.tasks_total} steps done` : "Starting"}</dd></div>
              <div><dt className="text-muted-foreground">Start date</dt><dd className="font-medium">{formatDate(v.start_date) || "To agree"}</dd></div>
              <div><dt className="text-muted-foreground">Expected completion</dt><dd className="font-medium">{formatDate(v.expected_completion) || "To agree"}</dd></div>
            </dl>
          </SectionCard>
        )}

        {deliverables.length > 0 && (
          <SectionCard title="Reports & deliverables">
            <FileList files={deliverables} onOpen={(path) => openClientFile("consultancy", token, path)} />
          </SectionCard>
        )}

        {v.status !== "declined" && (
          <SectionCard title="Progress">
            <StageList service="consultancy" stages={stagesFrom(STAGES, STAGE_INDEX[v.status], v.status === "completed")} />
          </SectionCard>
        )}

        {fee > 0 && (
          <PaymentBox
            service="consultancy"
            total={fee}
            paid={Number(v.paid)}
            pending={Number(v.pending_payment)}
            currency={v.proposal!.currency}
            reference={v.reference}
            onSubmit={async (p) => {
              await rpc("consult_submit_payment", { p_token: token, p_amount: p.amount, p_method: p.method, p_reference: p.reference });
              refresh();
            }}
          />
        )}

        <ClientFiles
          service="consultancy"
          token={token}
          files={clientFiles}
          fileFn="consult_client_file"
          accept={`${DATA_FILE_ACCEPT},${DOC_FILE_ACCEPT}`}
          canUpload={open}
          title="Documents you shared"
          onChange={refresh}
        />

        <SectionCard title="Your request">
          <p className="whitespace-pre-line text-sm">{v.description}</p>
        </SectionCard>

        <WhatsAppButton label="Contact Isoko" text={`Hello Isoko Consultancy, about my request ${v.reference}:`} />
      </FlowColumn>
    </ServiceLayout>
  );
}
