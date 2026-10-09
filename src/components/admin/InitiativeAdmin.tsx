import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import {
  FOCUS_AREAS, PUBLISHABLE_STATUSES, STATUS_LABEL, STATUS_TRANSITIONS,
  areaOf, classificationLabel, isValidClassification, rwf, subcategoryOf, type ProjectStatus,
} from "@/lib/initiative";
import {
  createOwnProject, documentUrl, setPublished, setStatus, updateProject, useAdminProjects, type AdminProject,
} from "@/features/initiative/api";
import { AlertCircle, Check, Eye, EyeOff, FileText, Plus, X } from "lucide-react";

const emptyDraft = {
  title: "", description: "", focus_area: "", subcategory: "", item: "", location: "", amount_required: "",
};
type Draft = typeof emptyDraft;

/** Focus area -> subcategory -> item pickers, shared by the create and edit dialogs. */
const ClassificationFields = ({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) => {
  const area = useMemo(() => areaOf(draft.focus_area), [draft.focus_area]);
  const sub = useMemo(() => subcategoryOf(area, draft.subcategory), [area, draft.subcategory]);
  const items = sub?.items ?? [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Focus area</Label>
          <Select value={draft.focus_area}
            onValueChange={(v) => setDraft({ ...draft, focus_area: v, subcategory: "", item: "" })}>
            <SelectTrigger><SelectValue placeholder="Choose an area" /></SelectTrigger>
            <SelectContent>
              {FOCUS_AREAS.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Subcategory</Label>
          <Select value={draft.subcategory} onValueChange={(v) => setDraft({ ...draft, subcategory: v, item: "" })}
            disabled={!area}>
            <SelectTrigger><SelectValue placeholder="Choose a subcategory" /></SelectTrigger>
            <SelectContent>
              {(area?.subcategories ?? []).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {items.length > 0 && (
        <div className="space-y-2">
          <Label>{sub?.label}</Label>
          <Select value={draft.item} onValueChange={(v) => setDraft({ ...draft, item: v })}>
            <SelectTrigger><SelectValue placeholder="Choose an option" /></SelectTrigger>
            <SelectContent>
              {items.map((i) => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
};

/** The desk could not read the list. It says so, rather than showing an empty one. */
const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-wrap items-center gap-3">
    <AlertCircle className="h-4 w-4 text-destructive" />
    <p className="text-sm text-muted-foreground">We couldn&apos;t load this information. Please try again.</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);

const draftFields = (d: Draft) => ({
  title: d.title.trim(),
  description: d.description.trim(),
  focus_area: d.focus_area,
  subcategory: d.subcategory,
  item: d.item || null,
  location: d.location.trim(),
  amount_required: Number(d.amount_required),
});

/**
 * The Global Initiative desk: review applications, run projects through their
 * lifecycle, and decide what the public sees. The database enforces the rules;
 * this only offers the moves that are allowed from where a project is.
 */
const InitiativeAdmin = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const projects = useAdminProjects();

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [editing, setEditing] = useState<AdminProject | null>(null);
  const [rejecting, setRejecting] = useState<AdminProject | null>(null);
  const [reason, setReason] = useState("");
  const [completing, setCompleting] = useState<AdminProject | null>(null);
  const [summary, setSummary] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["initiative"] });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ title: ok });
      await refresh();
      return true;
    } catch (err) {
      toast({ title: "Action failed", description: errorText(err), variant: "destructive" });
      return false;
    }
  };

  const move = (row: AdminProject, to: ProjectStatus, extra: Record<string, string> = {}) =>
    run(() => setStatus(row.id, to, extra), `Moved to ${STATUS_LABEL[to] ?? to}`);

  const openDocument = async (path: string) => {
    try {
      window.open(await documentUrl(path), "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({ title: "Could not open the document", description: errorText(err), variant: "destructive" });
    }
  };

  const rows = projects.data ?? [];
  const submitted = rows.filter((p) => p.status === "submitted");
  const rest = rows.filter((p) => p.status !== "submitted");
  // A queue that could not be read is not an empty queue. Until the list
  // actually arrives, neither the counts nor "nothing to review" are claimed.
  const counted = (n: number) => (projects.isSuccess ? ` (${n})` : "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Global Initiative</h2>
          <p className="text-sm text-muted-foreground">
            $1 — One Project. Amounts are in RWF; funds raised are counted from confirmed donations only,
            and donations are not open yet.
          </p>
        </div>
        <Button className="gap-2" onClick={() => { setDraft({ ...emptyDraft }); setCreating(true); }}>
          <Plus className="h-4 w-4" /> New ISOKO project
        </Button>
      </div>

      {/* Applications waiting for a decision */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Applications{counted(submitted.length)}</CardTitle></CardHeader>
        <CardContent>
          {projects.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : projects.isError ? (
            <LoadFailed onRetry={() => projects.refetch()} />
          ) : submitted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications waiting for review.</p>
          ) : (
            <div className="space-y-3">
              {submitted.map((row) => (
                <div key={row.id} className="space-y-2 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {classificationLabel(row)} · {row.location} · {rwf(row.amount_required)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.user_id ? `Applicant ${row.user_id.slice(0, 8)}` : "ISOKO GROUP project"}
                        {" · "}{new Date(row.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.document_path && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => openDocument(row.document_path!)}>
                          <FileText className="h-3.5 w-3.5" /> Document
                        </Button>
                      )}
                      <Button size="sm" className="gap-1" onClick={() => move(row, "approved")}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1"
                        onClick={() => { setRejecting(row); setReason(""); }}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.description}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Everything past review */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Projects{counted(rest.length)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {projects.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : projects.isError ? (
            <LoadFailed onRetry={() => projects.refetch()} />
          ) : rest.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Public</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rest.map((row) => {
                  const next = STATUS_TRANSITIONS[row.status] ?? [];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.title}</p>
                        <p className="text-xs text-muted-foreground">{classificationLabel(row)}</p>
                        {row.rejection_reason && (
                          <p className="text-xs text-muted-foreground">Reason: {row.rejection_reason}</p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{STATUS_LABEL[row.status] ?? row.status}</TableCell>
                      <TableCell className="whitespace-nowrap">{rwf(row.amount_required)}</TableCell>
                      <TableCell>
                        {PUBLISHABLE_STATUSES.includes(row.status) ? (
                          <Button variant="ghost" size="sm" className="gap-1"
                            onClick={() => run(() => setPublished(row.id, !row.published), row.published ? "Hidden" : "Published")}>
                            {row.published ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4" />}
                            {row.published ? "Published" : "Hidden"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            setEditing(row);
                            setDraft({
                              title: row.title, description: row.description, focus_area: row.focus_area,
                              subcategory: row.subcategory, item: row.item ?? "", location: row.location,
                              amount_required: String(row.amount_required),
                            });
                          }}>Edit</Button>
                          {next.map((to) => to === "completed" ? (
                            <Button key={to} size="sm" onClick={() => { setCompleting(row); setSummary(""); }}>
                              Mark completed
                            </Button>
                          ) : (
                            <Button key={to} size="sm" onClick={() => move(row, to)}>{STATUS_LABEL[to] ?? to}</Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* A project ISOKO runs itself */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New ISOKO project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <ClassificationFields draft={draft} setDraft={setDraft} />
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Amount needed (RWF)</Label>
                <Input type="number" min={1} value={draft.amount_required}
                  onChange={(e) => setDraft({ ...draft, amount_required: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!isValidClassification(draft.focus_area, draft.subcategory, draft.item || null)) {
                toast({ title: "Choose a focus area", description: "Pick an area, a subcategory, and an option where one is offered.", variant: "destructive" });
                return;
              }
              if (await run(() => createOwnProject(draftFields(draft)), "Project created")) setCreating(false);
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Corrections. Status and publication are never changed here. */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <ClassificationFields draft={draft} setDraft={setDraft} />
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Amount needed (RWF)</Label>
                <Input type="number" min={1} value={draft.amount_required}
                  onChange={(e) => setDraft({ ...draft, amount_required: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={async () => {
              if (!editing) return;
              if (!isValidClassification(draft.focus_area, draft.subcategory, draft.item || null)) {
                toast({ title: "Choose a focus area", description: "Pick an area, a subcategory, and an option where one is offered.", variant: "destructive" });
                return;
              }
              if (await run(() => updateProject(editing.id, draftFields(draft)), "Project updated")) setEditing(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejecting, with the reason the applicant will read */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject application</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (shown to the applicant)</Label>
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!rejecting) return;
              if (await move(rejecting, "rejected", { rejection_reason: reason.trim() })) setRejecting(null);
            }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion: recorded, dated and attributed by the database */}
      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark project completed</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>What did the project achieve?</Label>
            <Textarea rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Recorded against your admin account as the verifier, with today&apos;s date.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>Cancel</Button>
            <Button onClick={async () => {
              if (!completing) return;
              if (await move(completing, "completed", { completion_summary: summary.trim() })) setCompleting(null);
            }}>Mark completed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InitiativeAdmin;
