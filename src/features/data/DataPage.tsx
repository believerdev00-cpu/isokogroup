import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DATA_FILE_ACCEPT, errorText, formatDate, formatMoney, openClientFile, rpc } from "@/features/services/api";
import { ClientFiles } from "@/features/services/ClientFiles";
import {
  FlowColumn, FormError, NextStep, NotFoundCard, PageLoading, PaymentBox, PrimaryButton, SectionCard, ServiceLayout,
  StageList, stagesFrom, THEME, WhatsAppButton,
} from "@/features/services/ui";

export type DataStatus = "new" | "data_received" | "reviewing" | "analysis" | "draft_report" | "client_review" | "completed" | "cancelled";

type View = {
  reference: string; service_name: string; description: string; client_name: string; organization: string | null;
  status: DataStatus; data_later: boolean; deadline: string | null; fee: number | null; currency: string;
  analyst: string | null; client_feedback: string | null; created_at: string;
  files: { id: string; name: string; path: string; created_at: string }[];
  deliverables: { id: string; kind: string; name: string; description: string; status: "pending" | "in_progress" | "done"; completed_at: string | null; path: string | null; file_name: string | null }[];
  paid: number; pending_payment: number;
};

const STAGES = ["Request received", "Data received", "Data review", "Analysis", "Draft report", "Your review", "Completed"];
const STAGE_INDEX: Record<DataStatus, number> = {
  new: 1, data_received: 2, reviewing: 2, analysis: 3, draft_report: 4, client_review: 5, completed: 6, cancelled: 0,
};
const HEADLINE: Record<DataStatus, string> = {
  new: "Request received",
  data_received: "Data received",
  reviewing: "Reviewing your data",
  analysis: "Analysis in progress",
  draft_report: "Preparing your report",
  client_review: "Your results are ready for review",
  completed: "Project completed",
  cancelled: "Project cancelled",
};

function Review({ token, refresh }: { token: string; refresh: () => void }) {
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await rpc("data_review", { p_token: token, p_approve: approve, p_message: approve ? null : text });
      toast.success(approve ? "Thank you! Your project is complete." : "Sent. Your analyst will update the results.");
      refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard className="border-indigo-600/40 shadow-md">
      <h2 className="font-display text-xl font-bold">Are the results what you needed?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Download the files below, then approve them or tell us what to change.</p>
      {!changing ? (
        <div className="mt-4 space-y-3">
          <PrimaryButton service="data" busy={busy} onClick={() => send(true)}>Approve Results</PrimaryButton>
          <Button variant="outline" size="lg" className="h-12 w-full" onClick={() => setChanging(true)}>Request Changes</Button>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); send(false); }}>
          <label htmlFor="changes" className="font-semibold">What would you like to change?</label>
          <Textarea id="changes" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setChanging(false)}>Cancel</Button>
            <Button type="submit" className={cn("flex-1", THEME.data.button)} disabled={busy || !text.trim()}>Send</Button>
          </div>
        </form>
      )}
      {!changing && <FormError message={error} />}
    </SectionCard>
  );
}

export default function DataPage() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["data_request", token],
    queryFn: () => rpc<View | null>("data_request_view", { p_token: token }),
    refetchInterval: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["data_request", token] });

  if (q.isLoading) return <ServiceLayout><PageLoading /></ServiceLayout>;
  const v = q.data;
  if (!v) return <ServiceLayout><NotFoundCard what="Project" backTo="/data-analysis" backLabel="Isoko Data Analysis" /></ServiceLayout>;

  const open = !["completed", "cancelled"].includes(v.status);
  const ready = v.deliverables.filter((d) => d.status === "done" && d.path);
  const needsData = v.files.length === 0 && open;
  const next =
    needsData ? "Upload your data (or send it the way you agreed with your analyst)"
    : v.status === "client_review" ? "Review the results and approve them"
    : null;

  return (
    <ServiceLayout>
      <FlowColumn className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{v.reference} · {v.service_name}</p>
          <p className={cn("mt-3 text-xs font-bold uppercase tracking-wider", THEME.data.text)}>Data project</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{HEADLINE[v.status]}</h1>
          {v.deadline && open && <p className="mt-1 text-muted-foreground">Expected by {formatDate(v.deadline)}</p>}
        </div>

        {open && (
          <NextStep
            service="data"
            done={STAGES[Math.max(STAGE_INDEX[v.status] - 1, 0)]}
            next={STAGES[STAGE_INDEX[v.status]] ?? null}
            action={next ? <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">Your next action: {next}</p> : <p className="text-sm text-muted-foreground">Nothing to do for now. We'll tell you when results are ready.</p>}
          />
        )}

        {v.status === "client_review" && <Review token={token} refresh={refresh} />}

        {ready.length > 0 && (
          <SectionCard title="Your results">
            <ul className="space-y-2">
              {ready.map((d) => (
                <li key={d.id}>
                  <Button
                    variant="outline"
                    className="h-auto w-full justify-between py-3 text-left"
                    onClick={() => openClientFile("data", token, d.path!).catch((e) => toast.error(errorText(e)))}
                  >
                    <span>
                      <span className="block font-semibold">Download {d.name}</span>
                      {d.description && <span className="block text-xs font-normal text-muted-foreground">{d.description}</span>}
                    </span>
                    <Download className="h-5 w-5 shrink-0" />
                  </Button>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {v.deliverables.length > 0 && v.status !== "completed" && (
          <SectionCard title="Your project">
            <ul className="space-y-3">
              {v.deliverables.map((d) => (
                <li key={d.id} className="flex items-center gap-3 text-sm">
                  {d.status === "done" ? (
                    <CheckCircle2 className={cn("h-5 w-5 shrink-0", THEME.data.text)} />
                  ) : d.status === "in_progress" ? (
                    <Clock className="h-5 w-5 shrink-0 text-amber-600" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                  )}
                  <span className={cn(d.status === "pending" && "text-muted-foreground", d.status !== "pending" && "font-medium")}>{d.name}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {v.status !== "cancelled" && (
          <SectionCard title="Progress">
            <StageList service="data" stages={stagesFrom(STAGES, STAGE_INDEX[v.status], v.status === "completed")} />
          </SectionCard>
        )}

        <ClientFiles
          service="data"
          token={token}
          files={v.files}
          fileFn="data_client_file"
          accept={DATA_FILE_ACCEPT}
          canUpload={open}
          title="Your data"
          onChange={refresh}
        />

        {v.fee != null && Number(v.fee) > 0 && (
          <PaymentBox
            service="data"
            total={Number(v.fee)}
            paid={Number(v.paid)}
            pending={Number(v.pending_payment)}
            currency={v.currency}
            reference={v.reference}
            mobileMoney={{ entityTable: "data_requests", token }}
            onPaid={refresh}
            onSubmit={async (p) => {
              await rpc("data_submit_payment", { p_token: token, p_amount: p.amount, p_method: p.method, p_reference: p.reference });
              refresh();
            }}
          />
        )}

        <SectionCard title="Your request">
          <p className="whitespace-pre-line text-sm">{v.description}</p>
          {v.analyst && <p className="mt-3 text-sm text-muted-foreground">Your analyst: <span className="font-medium text-foreground">{v.analyst}</span></p>}
          {v.fee != null && <p className="mt-1 text-sm text-muted-foreground">Price: <span className="font-medium text-foreground">{formatMoney(v.fee, v.currency)}</span></p>}
        </SectionCard>

        <WhatsAppButton label="Contact Isoko" text={`Hello Isoko Data Analysis, about my project ${v.reference}:`} />
      </FlowColumn>
    </ServiceLayout>
  );
}
