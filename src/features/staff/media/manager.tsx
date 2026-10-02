// One content manager for every kind of Isoko Entertainment content: a list with
// search and status filters, an editor built from a field list, and the
// publish / unpublish / schedule / feature / archive / delete actions. The
// database enforces who may do this (media staff and admins) and the rules that
// protect people; the checks here only explain them before saving.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, ChevronDown, Eye, EyeOff, MoreVertical, ImagePlus, Loader2, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { db, errorText, unwrap } from "@/features/services/api";
import { MAX_UPLOAD_MB, mediaUrl, uploadDisplayImage, uploadMediaFile, youtubeId, type Status } from "@/features/entertainment/api";
import { EmptyState, Pill } from "../common";

type Row = Record<string, unknown> & { id: string };

export type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "datetime" | "bool" | "select" | "multi" | "tags" | "image" | "watch" | "relation" | "pairs";
  options?: { value: string; label: string }[];
  relation?: { table: string; label: string; filter?: (draft: Row) => Record<string, unknown> };
  /** image: also store the width/height in these columns */
  dims?: [string, string];
  folder?: string;
  required?: boolean;
  help?: string;
  /** asked for up front; the rest waits under "More details" */
  basic?: boolean;
  show?: (draft: Row) => boolean;
  wide?: boolean;
};

export type EntityConfig = {
  table: string;
  noun: string;
  titleKey: string;
  imageKey?: string;
  subtitle?: (row: Row) => string;
  fields: Field[];
  defaults?: Row | Record<string, unknown>;
  /** new rows get a web address made from their title */
  slug?: boolean;
  /** has status / featured / demo columns */
  publishable?: boolean;
  featurable?: boolean;
  /** limits the list (and new rows) to part of the table */
  scope?: Record<string, unknown>;
  order?: string;
  validate?: (draft: Row) => string | null;
  /** last touches to what is saved (e.g. a web name made from the name) */
  prepare?: (payload: Record<string, unknown>) => void;
  /** what to say once it is added, when it has parts to add next */
  extrasHint?: string;
  /** parts edited inside the editor once the item exists (gallery, credits, episodes) */
  extras?: (row: Row) => ReactNode;
  /** buttons on each row of the list */
  rowActions?: (row: Row) => ReactNode;
  /** what to tell staff when the database refuses a delete because other rows still refer to it */
  deleteBlocked?: string;
};

const STATUS_TONE: Record<Status, "done" | "off" | "wait" | "work"> = { published: "done", draft: "off", scheduled: "wait", archived: "work" };

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";

/** Clean empty strings to null; keep arrays and objects as they are. */
function clean(draft: Row, fields: Field[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    // "Playback" edits three real columns
    if (f.type === "watch") {
      out.watch_source = draft.watch_source || null;
      out.watch_ref = draft.watch_source ? (typeof draft.watch_ref === "string" ? draft.watch_ref.trim() || null : draft.watch_ref ?? null) : null;
      out.is_free = draft.watch_source === "youtube" ? true : !!draft.is_free;
      continue;
    }
    let v = draft[f.key];
    if (typeof v === "string") v = v.trim() === "" ? null : v.trim();
    if (f.type === "number" && v != null) v = Number(v);
    out[f.key] = v ?? (f.type === "tags" || f.type === "multi" ? [] : f.type === "pairs" ? {} : f.type === "bool" ? false : null);
    if (f.dims) {
      out[f.dims[0]] = draft[f.dims[0]] ?? null;
      out[f.dims[1]] = draft[f.dims[1]] ?? null;
    }
  }
  return out;
}

// ============== THE MANAGER ==============
export function EntityManager({ config, parent, compact, openKey }: { config: EntityConfig; parent?: { column: string; id: string }; compact?: boolean; openKey?: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const scope = useMemo(() => ({ ...(config.scope ?? {}), ...(parent ? { [parent.column]: parent.id } : {}) }), [config.scope, parent]);
  const key = ["media-admin", config.table, scope];
  // Opened from a shortcut ("Add a film" etc.): the form is open right away. The
  // address keeps ?new= until the form closes (the page may mount twice while it
  // animates in, and each copy must open it).
  const [params, setParams] = useSearchParams();
  const fromShortcut = !!openKey && params.get("new") === openKey;
  useEffect(() => {
    if (fromShortcut) setEditing((e) => e ?? ({ id: "", ...(config.defaults ?? {}), ...scope } as Row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromShortcut]);
  const closeEditor = () => {
    setEditing(null);
    if (fromShortcut) {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  };

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = db.from(config.table).select("*");
      for (const [k, v] of Object.entries(scope)) q = q.eq(k, v);
      q = q.order(config.order ?? "created_at", { ascending: config.order === "sort" || config.order === "number" });
      return unwrap(await q) as Row[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => unwrap(await db.from(config.table).update(patch).eq("id", id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-admin", config.table] }),
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await db.from(config.table).delete().eq("id", id)),
    onSuccess: () => {
      toast.success(`${config.noun} deleted`);
      qc.invalidateQueries({ queryKey: ["media-admin", config.table] });
    },
    // A delete the database refuses because other rows still point here (a
    // foreign key) gets a plain explanation, not the database's own words.
    onError: (e) => toast.error(/foreign key|violates|still referenced/i.test(errorText(e))
      ? (config.deleteBlocked ?? `This ${config.noun.toLowerCase()} can't be deleted because other records still refer to it. Archive it instead.`)
      : errorText(e)),
  });

  const setStatusOf = (row: Row, next: Status) => {
    const draft = { ...row, status: next };
    const problem = config.validate?.(draft);
    if (problem) return toast.error(problem);
    update.mutate({ id: row.id, patch: { status: next } }, { onSuccess: () => toast.success(next === "published" ? "Published" : next === "archived" ? "Archived" : "Moved to drafts") });
  };

  const rows = (list.data ?? []).filter((r) => {
    if (config.publishable && status !== "all" && r.status !== status) return false;
    const t = String(r[config.titleKey] ?? "").toLowerCase();
    return !search.trim() || t.includes(search.trim().toLowerCase());
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${config.noun.toLowerCase()}s`} className="h-10 max-w-xs" />}
        {config.publishable && !compact && (
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(["all", "published", "draft", "scheduled", "archived"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-semibold capitalize", status === s ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <Button className="ml-auto gap-1.5" size={compact ? "sm" : "default"} onClick={() => setEditing({ id: "", ...(config.defaults ?? {}), ...(config.order === "number" ? { number: Math.max(0, ...(list.data ?? []).map((r) => Number(r.number) || 0)) + 1 } : {}), ...scope } as Row)}>
          <Plus className="h-4 w-4" /> Add {config.noun.toLowerCase()}
        </Button>
      </div>

      {list.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : list.error ? (
        <p className="py-8 text-center text-sm text-destructive">{errorText(list.error)}</p>
      ) : rows.length === 0 ? (
        <EmptyState>{list.data?.length ? "Nothing matches." : `No ${config.noun.toLowerCase()}s yet.`}</EmptyState>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {rows.map((r) => {
            const img = config.imageKey ? (r[config.imageKey] as string | null) : null;
            const st = r.status as Status | undefined;
            return (
              <li key={r.id} className="flex items-center gap-3 p-3">
                {config.imageKey && (
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {img && <img src={mediaUrl(img, "sm") ?? undefined} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {String(r[config.titleKey] ?? "Untitled")}
                    {r.is_demo ? <span className="ml-2 rounded bg-amber-400 px-1.5 text-[10px] font-bold uppercase text-black">Demo</span> : null}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {st && <Pill tone={STATUS_TONE[st]}>{st}{st === "scheduled" && r.publish_at ? ` · ${new Date(String(r.publish_at)).toLocaleString("en-GB")}` : ""}</Pill>}
                    {r.featured ? <Pill tone="wait">Featured</Pill> : null}
                    {config.subtitle?.(r)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {config.rowActions?.(r)}
                  {config.publishable && st !== "published" && (
                    <Button size="sm" className="gap-1.5" onClick={() => setStatusOf(r, "published")}><Eye className="h-4 w-4" /> Publish</Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /> Edit</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="More actions"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {config.publishable && st === "published" && (
                        <DropdownMenuItem onClick={() => setStatusOf(r, "draft")}><EyeOff className="mr-2 h-4 w-4" /> Hide from the website</DropdownMenuItem>
                      )}
                      {config.featurable && (
                        <DropdownMenuItem onClick={() => update.mutate({ id: r.id, patch: { featured: !r.featured } })}>
                          <Star className="mr-2 h-4 w-4" /> {r.featured ? "Stop featuring" : "Feature it"}
                        </DropdownMenuItem>
                      )}
                      {config.publishable && st !== "archived" && (
                        <DropdownMenuItem onClick={() => setStatusOf(r, "archived")}><Archive className="mr-2 h-4 w-4" /> Archive (keep, but hide)</DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(r)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <Editor config={config} initial={editing} scope={scope} onClose={closeEditor} />}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{String(deleting?.[config.titleKey] ?? "")}”?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. To take it off the site but keep it, archive it instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============== EDITOR ==============
// Asks for the essentials only (fields marked basic); everything else waits
// under "More details". Publishing is one button, not a status to pick.
function Editor({ config, initial, scope, onClose }: { config: EntityConfig; initial: Row; scope: Record<string, unknown>; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Row>(initial);
  const [saving, setSaving] = useState<null | "draft" | "publish" | "save">(null);
  const [created, setCreated] = useState(false);
  const set = (patch: Record<string, unknown>) => setDraft((d) => ({ ...d, ...patch }));
  const shown = config.fields.filter((f) => !f.show || f.show(draft));
  const basic = shown.filter((f) => f.basic);
  const more = shown.filter((f) => !f.basic);
  const isPublished = draft.status === "published";

  const save = async (mode: "draft" | "publish" | "save") => {
    const missing = shown.find((f) => f.required && (draft[f.key] == null || String(draft[f.key]).trim() === ""));
    if (missing) return toast.error(`Please add the ${missing.label.toLowerCase()}.`);
    const status = mode === "publish" ? "published" : mode === "draft" ? (draft.status === "scheduled" ? "scheduled" : "draft") : (draft.status ?? "draft");
    const next: Row = { ...draft, status };
    const problem = config.validate?.(next);
    if (problem) return toast.error(problem);
    const payload: Record<string, unknown> = { ...clean(next, config.fields), ...scope };
    if (config.publishable) {
      payload.status = status;
      payload.publish_at = status === "scheduled" ? next.publish_at || null : null;
      payload.is_demo = !!next.is_demo;
    }
    if (config.featurable) payload.featured = !!next.featured;
    config.prepare?.(payload);
    if (!next.id && config.slug) payload.slug = `${slugify(String(next[config.titleKey] ?? ""))}-${Math.random().toString(36).slice(2, 6)}`;
    setSaving(mode);
    try {
      if (!next.id) {
        const saved = unwrap(await db.from(config.table).insert(payload).select("*").single()) as Row;
        toast.success(status === "published" ? `${config.noun} published. It's on the website now.` : `${config.noun} saved as a draft.`);
        qc.invalidateQueries({ queryKey: ["media-admin", config.table] });
        qc.invalidateQueries({ queryKey: ["ent"] });
        // Things with parts (gallery, episodes, cast) stay open so those can be added next
        if (config.extras) {
          setDraft(saved);
          setCreated(true);
        } else onClose();
      } else {
        unwrap(await db.from(config.table).update(payload).eq("id", next.id));
        toast.success(mode === "publish" ? "Published. It's on the website now." : "Saved.");
        qc.invalidateQueries({ queryKey: ["media-admin", config.table] });
        qc.invalidateQueries({ queryKey: ["ent"] });
        onClose();
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" aria-describedby={undefined} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{created ? `${config.noun} added` : draft.id ? `Edit ${config.noun.toLowerCase()}` : `Add ${config.noun.toLowerCase()}`}</DialogTitle>
        </DialogHeader>

        {created ? (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {isPublished ? "It's on the website now." : "Saved as a draft."} {config.extrasHint ?? "You can add more below, or press Done."}
          </p>
        ) : (
          <>
            <div className="grid gap-4">
              {basic.map((f) => <FieldInput key={f.key} field={{ ...f, wide: true }} draft={draft} set={set} />)}
            </div>
            {(more.length > 0 || config.publishable) && (
              <details className="group rounded-xl border">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
                  More details (optional)
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                  {more.map((f) => <FieldInput key={f.key} field={f} draft={draft} set={set} />)}
                  {config.publishable && <PublishOptions draft={draft} set={set} featurable={config.featurable} />}
                </div>
              </details>
            )}
          </>
        )}

        {draft.id && config.extras && <div className="mt-1">{config.extras(draft)}</div>}

        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex flex-wrap justify-end gap-2 border-t bg-background px-6 py-3">
          {created ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              {!config.publishable ? (
                <Button onClick={() => save("save")} disabled={!!saving} className="gap-1.5">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </Button>
              ) : !draft.id || !isPublished ? (
                <>
                  <Button variant="outline" onClick={() => save("draft")} disabled={!!saving} className="gap-1.5">
                    {saving === "draft" && <Loader2 className="h-4 w-4 animate-spin" />} Save as draft
                  </Button>
                  <Button onClick={() => save("publish")} disabled={!!saving} className="gap-1.5">
                    {saving === "publish" && <Loader2 className="h-4 w-4 animate-spin" />} Publish
                  </Button>
                </>
              ) : (
                <Button onClick={() => save("save")} disabled={!!saving} className="gap-1.5">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PublishOptions({ draft, set, featurable }: { draft: Row; set: (p: Record<string, unknown>) => void; featurable?: boolean }) {
  const later = draft.status === "scheduled";
  return (
    <div className="grid gap-3 sm:col-span-2">
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium">
        <span>Publish later<span className="block text-xs font-normal text-muted-foreground">It goes on the website by itself at the time you choose. Then press “Save as draft”.</span></span>
        <Switch checked={later} onCheckedChange={(v) => set({ status: v ? "scheduled" : "draft", publish_at: v ? draft.publish_at ?? null : null })} />
      </label>
      {later && (
        <label className="grid gap-1.5 text-sm font-medium">
          Goes on the website at
          <Input type="datetime-local" value={toLocal(draft.publish_at)} onChange={(e) => set({ publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </label>
      )}
      {featurable && (
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium">
          <span>Feature it<span className="block text-xs font-normal text-muted-foreground">Shown first, and in the big banner.</span></span>
          <Switch checked={!!draft.featured} onCheckedChange={(v) => set({ featured: v })} />
        </label>
      )}
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium">
        <span>Sample content<span className="block text-xs font-normal text-muted-foreground">Labelled “Demo” on the website.</span></span>
        <Switch checked={!!draft.is_demo} onCheckedChange={(v) => set({ is_demo: v })} />
      </label>
    </div>
  );
}

const toLocal = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// ============== FIELDS ==============
function FieldInput({ field: f, draft, set }: { field: Field; draft: Row; set: (p: Record<string, unknown>) => void }) {
  const v = draft[f.key];
  const wrap = (child: ReactNode, wide = f.wide) => (
    <label className={cn("grid content-start gap-1.5 text-sm font-medium", wide && "sm:col-span-2")}>
      <span>{f.label}{f.required && <span className="text-destructive"> *</span>}</span>
      {child}
      {f.help && <span className="text-xs font-normal text-muted-foreground">{f.help}</span>}
    </label>
  );
  switch (f.type) {
    case "textarea":
      return wrap(<Textarea rows={4} value={String(v ?? "")} onChange={(e) => set({ [f.key]: e.target.value })} />, true);
    case "number":
      return wrap(<Input type="number" value={v == null ? "" : String(v)} onChange={(e) => set({ [f.key]: e.target.value === "" ? null : e.target.value })} />);
    case "date":
      return wrap(<Input type="date" value={String(v ?? "").slice(0, 10)} onChange={(e) => set({ [f.key]: e.target.value || null })} />);
    case "datetime":
      return wrap(<Input type="datetime-local" value={toLocal(v)} onChange={(e) => set({ [f.key]: e.target.value ? new Date(e.target.value).toISOString() : null })} />);
    case "bool":
      return (
        <label className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium", f.wide && "sm:col-span-2")}>
          <span>{f.label}{f.help && <span className="block text-xs font-normal text-muted-foreground">{f.help}</span>}</span>
          <Switch checked={!!v} onCheckedChange={(c) => set({ [f.key]: c })} />
        </label>
      );
    case "select":
      return wrap(
        <select value={String(v ?? "")} onChange={(e) => set({ [f.key]: e.target.value || null })} className="h-10 rounded-md border bg-background px-3">
          {!f.required && <option value="">—</option>}
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>,
      );
    case "multi": {
      const cur = new Set((v as string[]) ?? []);
      return wrap(
        <div className="flex flex-wrap gap-1.5">
          {f.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { const n = new Set(cur); if (n.has(o.value)) n.delete(o.value); else n.add(o.value); set({ [f.key]: [...n] }); }}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", cur.has(o.value) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {o.label}
            </button>
          ))}
        </div>,
        true,
      );
    }
    case "tags":
      return wrap(
        <Input value={((v as string[]) ?? []).join(", ")} placeholder="Comma separated" onChange={(e) => set({ [f.key]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />,
      );
    case "pairs":
      return wrap(<PairsInput value={(v as Record<string, string>) ?? {}} onChange={(p) => set({ [f.key]: p })} />, true);
    case "image":
      return wrap(<ImageInput value={v as string | null} folder={f.folder ?? "misc"} onChange={(path, w, h) => set({ [f.key]: path, ...(f.dims ? { [f.dims[0]]: w, [f.dims[1]]: h } : {}) })} />, f.wide);
    case "watch":
      return <WatchInput draft={draft} set={set} folder={f.folder ?? "media"} />;
    case "relation":
      return wrap(<RelationSelect field={f} draft={draft} value={v as string | null} onChange={(id) => set({ [f.key]: id })} />);
    default:
      return wrap(<Input value={String(v ?? "")} onChange={(e) => set({ [f.key]: e.target.value })} />);
  }
}

function RelationSelect({ field, draft, value, onChange }: { field: Field; draft: Row; value: string | null; onChange: (id: string | null) => void }) {
  const rel = field.relation!;
  const filter = rel.filter?.(draft) ?? {};
  const opts = useQuery({
    queryKey: ["media-admin", "relation", rel.table, filter],
    queryFn: async () => {
      let q = db.from(rel.table).select(`id, ${rel.label}`).order(rel.label).limit(500);
      for (const [k, val] of Object.entries(filter)) {
        if (val === undefined) continue; // depends on a choice not made yet: no filter
        q = Array.isArray(val) ? q.contains(k, val) : val === null ? q.is(k, null) : q.eq(k, val);
      }
      return unwrap(await q) as Row[];
    },
  });
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-10 rounded-md border bg-background px-3">
      <option value="">—</option>
      {(opts.data ?? []).map((o) => <option key={o.id} value={o.id}>{String(o[rel.label])}</option>)}
    </select>
  );
}

function PairsInput({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const entries = Object.entries(value);
  const update = (list: [string, string][]) => onChange(Object.fromEntries(list.filter(([k]) => k.trim())));
  return (
    <div className="space-y-2">
      {[...entries, ["", ""] as [string, string]].map(([k, val], i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <Input placeholder="Label (e.g. Height)" value={k} onChange={(e) => { const l = [...entries]; l[i] = [e.target.value, val]; update(l); }} />
          <Input placeholder="Value (e.g. 1.78 m)" value={val} onChange={(e) => { const l = [...entries]; l[i] = [k, e.target.value]; update(l); }} />
        </div>
      ))}
    </div>
  );
}

function ImageInput({ value, folder, onChange }: { value: string | null; folder: string; onChange: (path: string | null, w?: number, h?: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadDisplayImage(folder, file);
      onChange(up.path, up.w, up.h);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-3">
      <span className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {value && <img src={mediaUrl(value, "sm") ?? undefined} alt="" className="h-full w-full object-cover" />}
      </span>
      <div className="flex flex-col gap-1.5">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {value ? "Replace" : "Upload"}
        </Button>
        {value && <button type="button" className="text-left text-xs text-muted-foreground underline" onClick={() => onChange(null)}>Remove</button>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/**
 * The video or audio: upload a file (kept private, for subscribers unless marked
 * free) or paste a YouTube link (free for everyone). The length and, for
 * episodes, audio or video are filled in from the file itself.
 */
function WatchInput({ draft, set, folder }: { draft: Row; set: (p: Record<string, unknown>) => void; folder: string }) {
  const source = (draft.watch_source as string | null) ?? null;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"file" | "youtube">(source === "youtube" ? "youtube" : "file");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`This file is ${Math.round(file.size / 1024 / 1024)} MB; uploads can be at most ${MAX_UPLOAD_MB} MB. Put it on YouTube (it can be “Unlisted”) and paste the link instead.`);
      setMode("youtube");
      return;
    }
    setBusy(true);
    try {
      const minutes = await mediaMinutes(file);
      const path = await uploadMediaFile(folder, file);
      set({
        watch_source: "storage", watch_ref: path,
        ...(minutes && !draft.duration_minutes ? { duration_minutes: minutes } : {}),
        ...("format" in draft || folder === "episodes" ? { format: file.type.startsWith("audio") ? "audio" : "video" } : {}),
      });
      toast.success("Uploaded");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Video or audio</span>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs font-semibold">
          <button type="button" onClick={() => setMode("file")} className={cn("rounded-md px-2.5 py-1", mode === "file" ? "bg-background shadow-sm" : "text-muted-foreground")}>Upload a file</button>
          <button type="button" onClick={() => setMode("youtube")} className={cn("rounded-md px-2.5 py-1", mode === "youtube" ? "bg-background shadow-sm" : "text-muted-foreground")}>YouTube link</button>
        </div>
      </div>

      {mode === "file" ? (
        source === "storage" && draft.watch_ref ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" /> File uploaded</span>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>Replace</Button>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set({ watch_source: null, watch_ref: null })}>Remove</button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            <span className="font-semibold text-foreground">{busy ? "Uploading…" : "Choose a video or audio file"}</span>
            <span className="text-xs">MP4, WebM, MP3, M4A, AAC or WAV · up to {MAX_UPLOAD_MB} MB</span>
          </button>
        )
      ) : (
        <div className="grid gap-1.5">
          <Input
            value={source === "youtube" ? String(draft.watch_ref ?? "") : ""}
            onChange={(e) => set(e.target.value.trim() ? { watch_source: "youtube", watch_ref: e.target.value, is_free: true } : { watch_source: null, watch_ref: null })}
            placeholder="Paste the YouTube link"
          />
          {source === "youtube" && draft.watch_ref && !youtubeId(String(draft.watch_ref)) ? (
            <span className="text-xs text-destructive">That doesn't look like a YouTube link.</span>
          ) : (
            <span className="text-xs text-muted-foreground">Anyone can watch YouTube videos. Set the video to “Unlisted” on YouTube if it shouldn't show up there.</span>
          )}
        </div>
      )}

      {source === "storage" && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Free for everyone <span className="text-muted-foreground">(otherwise subscribers only)</span></span>
          <Switch checked={!!draft.is_free} onCheckedChange={(v) => set({ is_free: v })} />
        </label>
      )}
      <input ref={input} type="file" accept="video/mp4,video/webm,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}

/** A media file's length in whole minutes, read by the browser (null if it can't tell). */
function mediaMinutes(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration / 60)) : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

// ============== GALLERY IMAGES ==============
/** Images of a work or an event: upload several at once, caption, order, remove. */
export function ImagesEditor({ table, column, parentId, kinds }: { table: "ent_work_images" | "ent_event_images" | "ent_fashion_design_images"; column: string; parentId: string; kinds?: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const key = ["media-admin", table, parentId];
  const images = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await db.from(table).select("*").eq(column, parentId).order("sort")) as Row[],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const start = images.data?.length ?? 0;
    setBusy(files.length);
    for (const [i, file] of [...files].entries()) {
      try {
        const up = await uploadDisplayImage(table === "ent_work_images" ? "works" : table === "ent_fashion_design_images" ? "fashion-hub" : "events", file);
        unwrap(await db.from(table).insert({ [column]: parentId, path: up.path, w: up.w, h: up.h, sort: start + i }));
      } catch (e) {
        toast.error(`${file.name}: ${errorText(e)}`);
      }
      setBusy((n) => n - 1);
    }
    refresh();
    if (input.current) input.current.value = "";
  };
  const patch = async (id: string, p: Record<string, unknown>) => {
    try {
      unwrap(await db.from(table).update(p).eq("id", id));
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const remove = async (id: string) => {
    try {
      unwrap(await db.from(table).delete().eq("id", id));
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Gallery ({images.data?.length ?? 0})</p>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy > 0} onClick={() => input.current?.click()}>
          {busy > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {busy > 0 ? `Uploading ${busy}…` : "Add images"}
        </Button>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(images.data ?? []).map((img) => (
          <div key={img.id} className="space-y-1">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              <img src={mediaUrl(String(img.path), "sm") ?? undefined} alt="" className="h-full w-full object-cover" loading="lazy" />
              <button type="button" onClick={() => remove(img.id)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label="Remove image">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input defaultValue={String(img.caption ?? "")} placeholder="Caption" className="h-8 text-xs" onBlur={(e) => e.target.value !== (img.caption ?? "") && patch(img.id, { caption: e.target.value || null })} />
            {kinds && (
              <select value={String(img.kind ?? "image")} onChange={(e) => patch(img.id, { kind: e.target.value })} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                <option value="image">Image</option>
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== CREATOR CONTACT (staff only) ==============
export function ContactEditor({ creatorId }: { creatorId: string }) {
  const qc = useQueryClient();
  const contact = useQuery({
    queryKey: ["media-admin", "contact", creatorId],
    queryFn: async () => unwrap(await db.from("ent_creator_contacts").select("*").eq("creator_id", creatorId).maybeSingle()) as Row | null,
  });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const cur = form ?? { email: String(contact.data?.email ?? ""), phone: String(contact.data?.phone ?? ""), notes: String(contact.data?.notes ?? "") };
  const save = async () => {
    try {
      unwrap(await db.from("ent_creator_contacts").upsert({ creator_id: creatorId, email: cur.email || null, phone: cur.phone || null, notes: cur.notes || null }));
      toast.success("Contact saved");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["media-admin", "contact", creatorId] });
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  if (contact.isLoading) return null;
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Private contact <span className="font-normal text-muted-foreground">(staff only, never shown on the site)</span></p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Email" value={cur.email} onChange={(e) => setForm({ ...cur, email: e.target.value })} />
        <Input placeholder="Phone" value={cur.phone} onChange={(e) => setForm({ ...cur, phone: e.target.value })} />
      </div>
      <Textarea rows={2} placeholder="Notes (rates, agreements, consent…)" value={cur.notes} onChange={(e) => setForm({ ...cur, notes: e.target.value })} />
      {form && <Button size="sm" onClick={save}>Save contact</Button>}
    </div>
  );
}
