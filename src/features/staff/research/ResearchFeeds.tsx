// How the Information Hub fills itself, seen from the desk: the review queue
// (drafts the answer engine wrote from outside sources, or that were extracted
// from an uploaded document), the import log with the World Bank connector,
// and the "Create from a document" button on the Items page. The server
// functions are called with the signed-in person's token; the database decides
// who may do this (data analysts and admins).
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, DownloadCloud, ExternalLink, FileUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { db, errorText, formatDate, rpc, unwrap } from "@/features/services/api";
import { EmptyState, Pill } from "../common";
import { KIND_LABEL, MAX_DOC_MB, RESEARCH_BUCKET, Shell } from "./shared";

const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

// ============== THE SERVER FUNCTIONS ==============
const STATUS_TEXT: Record<number, string> = {
  401: "Please sign in again.",
  403: "Only data analysts and admins can do this.",
  413: `The file is too large (up to ${MAX_DOC_MB} MB).`,
  422: "No text could be read from this file.",
  429: "Too many requests. Please wait a moment and try again.",
};

/** Calls one of the hub's server functions as the signed-in person; throws a readable message, never a stack trace. */
export async function callHubFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    let message = "";
    let status = 0;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        const j = await ctx.clone().json();
        message = typeof j?.error === "string" ? j.error : typeof j?.message === "string" ? j.message : "";
      } catch {
        message = "";
      }
    }
    throw new Error(message || STATUS_TEXT[status] || "The server could not do this right now. Please try again.");
  }
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

// ============== REVIEW QUEUE ==============
export type ReviewRow = {
  id: string; slug: string; kind: string; title: string; summary: string | null; country_name: string | null;
  review_note: string | null; import_source: "question" | "document"; created_at: string;
  sources: { title: string; url: string | null; publisher: string | null }[];
};

const FEED_LABEL: Record<string, string> = { question: "Written by the answer engine", document: "Extracted from a document" };

export function useReviewQueue() {
  return useQuery({ queryKey: ["research-admin", "review-queue"], queryFn: () => rpc<ReviewRow[]>("research_review_queue", { p_limit: 200 }) });
}

export function ResearchReview() {
  const qc = useQueryClient();
  const queue = useReviewQueue();
  const [discarding, setDiscarding] = useState<ReviewRow | null>(null);
  const discard = useMutation({
    mutationFn: (id: string) => rpc("research_discard_draft", { p_id: id }),
    onSuccess: () => {
      toast.success("Draft discarded.");
      qc.invalidateQueries({ queryKey: ["research-admin"] });
      qc.invalidateQueries({ queryKey: ["media-admin", "research_items"] });
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => setDiscarding(null),
  });
  const rows = queue.data ?? [];
  return (
    <Shell title="Review queue" subtitle="Drafts the hub wrote by itself. Nothing here is on the website until you have checked it and published it.">
      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p>
          These drafts were <strong>written by the answer engine</strong> from outside sources, or <strong>extracted from a document</strong> that was
          uploaded. Nobody has checked them yet. Open each one, compare the text and the figures with the sources, correct what is wrong, then publish
          it, or discard it.
        </p>
      </div>
      {queue.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : queue.error ? (
        <p className="py-8 text-center text-sm text-destructive">{errorText(queue.error)}</p>
      ) : rows.length === 0 ? (
        <EmptyState>Nothing is waiting for review.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Pill tone="wait">{FEED_LABEL[r.import_source] ?? r.import_source}</Pill>
                <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
                {r.country_name && <span>· {r.country_name}</span>}
                <span>· {formatDate(r.created_at, DATE)}</span>
              </div>
              <h2 className="mt-2 font-semibold leading-snug">{r.title}</h2>
              {r.review_note && <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">{r.review_note}</p>}
              {r.summary && <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{r.summary}</p>}
              {r.sources.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {r.sources.map((s, i) => (
                      <li key={`${s.url ?? s.title}-${i}`} className="flex flex-wrap items-center gap-x-2">
                        <span>{s.title}</span>
                        {s.publisher && <span className="text-muted-foreground">· {s.publisher}</span>}
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" className="gap-1.5">
                  <Link to={`/staff/research/items?edit=${r.id}`}><Pencil className="h-4 w-4" /> Open in editor</Link>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDiscarding(r)} disabled={discard.isPending}>
                  <Trash2 className="h-4 w-4" /> Discard
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!discarding} onOpenChange={(o) => !o && setDiscarding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard “{discarding?.title ?? ""}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft, its figures and its sources are deleted. It was never on the website. If people keep asking the same question, the
              engine may draft it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => discarding && discard.mutate(discarding.id)}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}

// ============== IMPORTS ==============
type ImportRow = {
  id: string; source: "worldbank" | "document"; country_id: string | null; started_at: string; finished_at: string | null;
  status: "running" | "done" | "failed"; created_items: number; updated_items: number; error: string | null;
  research_countries: { name: string } | null;
};
type ImportResult = { runs: { country: string; created: number; updated: number; failed: number }[]; total_created: number; total_updated: number };

const WORLD_BANK_INDICATORS = [
  "Population, total", "Population growth", "GDP (current US$)", "GDP per capita", "GDP growth", "Inflation (consumer prices)",
  "Unemployment", "International tourist arrivals", "Life expectancy at birth", "School enrolment, primary", "School enrolment, secondary",
  "Individuals using the Internet", "Access to electricity", "Agricultural land", "Urban population",
];
const SOURCE_LABEL: Record<string, string> = { worldbank: "World Bank", document: "Document" };
const STATUS_TONE: Record<string, "done" | "wait" | "off"> = { done: "done", running: "wait", failed: "off" };

export function ResearchImports() {
  const qc = useQueryClient();
  const countries = useQuery({
    queryKey: ["research-admin", "active-countries"],
    queryFn: async () => unwrap(await db.from("research_countries").select("id,name,slug,code").eq("is_active", true).order("sort").order("name")) as { id: string; name: string; slug: string; code: string }[],
  });
  const runs = useQuery({
    queryKey: ["research-admin", "imports"],
    queryFn: async () => unwrap(await db.from("research_imports").select("*, research_countries(name)").order("started_at", { ascending: false }).limit(10)) as ImportRow[],
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  const importNow = useMutation({
    mutationFn: () => callHubFunction<ImportResult>("research-import", {}),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`World Bank import finished: ${r.total_created} new, ${r.total_updated} updated.`);
      qc.invalidateQueries({ queryKey: ["research-admin"] });
      qc.invalidateQueries({ queryKey: ["media-admin", "research_items"] });
      qc.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (e) => {
      toast.error(errorText(e));
      qc.invalidateQueries({ queryKey: ["research-admin", "imports"] });
    },
  });
  const active = countries.data ?? [];
  return (
    <Shell title="Imports" subtitle="Official figures the hub fetches by itself, and the log of every run.">
      <section className="mb-6 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold"><DownloadCloud className="h-5 w-5 text-primary" aria-hidden /> World Bank, World Development Indicators</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Published straight to the hub as statistics marked “unverified”, one item per indicator and country, with the whole yearly series
              and a link to the World Bank page. Re-running updates the figures; it never changes a title, a status or a verification an analyst has set.
            </p>
          </div>
          <Button className="gap-1.5" onClick={() => importNow.mutate()} disabled={importNow.isPending}>
            {importNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
            {importNow.isPending ? "Importing…" : "Import now"}
          </Button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Countries</dt>
            <dd className="mt-1">{countries.isLoading ? "Loading…" : active.length ? active.map((c) => c.name).join(", ") : "No active country yet. Activate one under Countries."}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{WORLD_BANK_INDICATORS.length} indicators</dt>
            <dd className="mt-1 text-muted-foreground">{WORLD_BANK_INDICATORS.join(" · ")}</dd>
          </div>
        </dl>
        {importNow.isPending && <p className="mt-3 text-sm text-muted-foreground">Fetching every indicator for every active country. This can take a minute or two; please keep this page open.</p>}
        {result && (
          <div className="mt-4 rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Last run from this page: {result.total_created} new, {result.total_updated} updated.</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {result.runs.map((r) => (
                <li key={r.country}>{r.country}: {r.created} new, {r.updated} updated{r.failed ? `, ${r.failed} failed` : ""}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <h2 className="mb-3 font-semibold">Last runs</h2>
      {runs.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : runs.error ? (
        <p className="py-8 text-center text-sm text-destructive">{errorText(runs.error)}</p>
      ) : !runs.data?.length ? (
        <EmptyState>No import has run yet.</EmptyState>
      ) : (
        <ul className="mb-6 divide-y rounded-2xl border bg-card">
          {runs.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-medium">{SOURCE_LABEL[r.source] ?? r.source}</span>
              {r.research_countries?.name && <span className="text-muted-foreground">· {r.research_countries.name}</span>}
              <Pill tone={STATUS_TONE[r.status] ?? "off"}>{r.status}</Pill>
              <span className="text-xs text-muted-foreground">{r.created_items} new · {r.updated_items} updated</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(r.started_at, DATE)}{r.finished_at ? ` → ${formatDate(r.finished_at, { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
              {r.error && <p className="w-full text-xs text-destructive">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">National Institute of Statistics of Rwanda (NISR) and other national publications</p>
        <p className="mt-1">
          There is no public data feed for these, so nothing is fetched automatically. Download the publication (PDF, Excel or CSV) and use
          “Create from a document” on the Items page: the hub reads it, extracts the figures and puts a draft in the review queue for you to check.
        </p>
      </section>
    </Shell>
  );
}

// ============== CREATE FROM A DOCUMENT ==============
const INGEST_ACCEPT = ".pdf,.xlsx,.xls,.csv,.tsv,.txt";
const INGEST_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
};
type IngestResult = { item_id: string; slug: string; title: string; figures: number; chars: number };

/** Picks a file, uploads it to the research bucket and asks the server to turn it into a draft item, then opens that draft. */
export function CreateFromDocument({ kind }: { kind?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = INGEST_TYPES[ext];
    if (!type) return void toast.error("Choose a PDF, Excel, CSV, TSV or text file.");
    if (file.size > MAX_DOC_MB * 1024 * 1024) return void toast.error(`Files must be under ${MAX_DOC_MB} MB.`);
    setBusy(true);
    const safe = file.name.replace(/[^\w.-]+/g, "-").slice(0, 100);
    const path = `ingest/${crypto.randomUUID()}-${safe}`;
    try {
      unwrap(await supabase.storage.from(RESEARCH_BUCKET).upload(path, file, { contentType: type, upsert: false }));
      const r = await callHubFunction<IngestResult>("research-ingest", { path, ...(kind ? { kind } : {}) });
      toast.success(`Draft created: “${r.title}”`, {
        description: `${r.figures} ${r.figures === 1 ? "figure" : "figures"} found. Check the text and the figures against the document, then publish.`,
      });
      qc.invalidateQueries({ queryKey: ["media-admin", "research_items"] });
      qc.invalidateQueries({ queryKey: ["research-admin"] });
      navigate(`/staff/research/items?edit=${r.item_id}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" accept={INGEST_ACCEPT} className="hidden" aria-hidden tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {busy ? "Reading the document…" : "Create from a document"}
      </Button>
    </>
  );
}
