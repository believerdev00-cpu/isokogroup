// The ISOKO Information Hub desk: research items (statistics, studies, reports,
// findings, datasets, surveys), their numbers, sources, documents and related
// items, plus the countries, regions and topics they are filed under, and the
// questions people ask the hub. Built on the same content manager as the media
// desk. Who may do this is decided by the database (data analysts and admins).
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpenCheck, ExternalLink, FileText, Link2, Loader2, Plus, Tags, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { db, errorText, formatDate, rpc, unwrap } from "@/features/services/api";
import { AttentionTile, EmptyState, Pill } from "../common";
import { EntityManager, type EntityConfig } from "../media/manager";
import { CreateFromDocument, useReviewQueue } from "./ResearchFeeds";
import { KIND_LABEL, KINDS, MAX_DOC_MB, RESEARCH_BUCKET, Shell } from "./shared";

export { KINDS };

type Row = Record<string, unknown> & { id: string };

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

const SOURCE_TYPES: [string, string][] = [
  ["government", "Government institution"], ["statistics_agency", "Statistics agency"], ["university", "University"],
  ["research_institution", "Research institution"], ["international_org", "International organization"],
  ["publication", "Publication"], ["organization", "Organization"], ["isoko", "ISOKO research"], ["other", "Other"],
];
const DOC_MIMES = [
  "application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/json", "text/plain",
];
const DOC_ACCEPT = ".pdf,.csv,.xlsx,.xls,.docx,.zip,.json,.txt";

const tooLong = (v: unknown, max: number) => typeof v === "string" && v.trim().length > max;
const isHttps = (v: unknown) => typeof v !== "string" || v.trim() === "" || /^https:\/\//.test(v.trim());

// ============== ITEMS ==============
/** The item config needs the signed-in person (who verified it), so it is built per page. */
function useItemsConfig(): EntityConfig {
  const { user } = useAuth();
  return useMemo<EntityConfig>(() => ({
    table: "research_items", noun: "Item", titleKey: "title", imageKey: "cover_path", publishable: true, featurable: true, slug: true,
    subtitle: (r) => [
      KIND_LABEL[String(r.kind)] ?? String(r.kind),
      r.verification === "verified" ? "Verified" : "Unverified",
      r.origin === "external" ? "External source" : "ISOKO",
      r.published_on ? String(r.published_on).slice(0, 10) : null,
      `Updated ${formatDate(String(r.updated_at), { day: "numeric", month: "short", year: "numeric" })}`,
    ].filter(Boolean).join(" · "),
    fields: [
      { key: "title", label: "Title", type: "text", required: true, basic: true, help: "Up to 200 characters." },
      { key: "kind", label: "What is it?", type: "select", required: true, basic: true, options: opts(KINDS) },
      { key: "summary", label: "Summary", type: "textarea", basic: true, help: "What a reader gets in a few sentences (up to 1,000 characters). Shown in search results." },
      { key: "country_id", label: "Country", type: "relation", basic: true, relation: { table: "research_countries", label: "name" } },
      { key: "topic_id", label: "Topic", type: "relation", basic: true, relation: { table: "research_topics", label: "name", filter: () => ({ parent_id: null }) } },
      { key: "body", label: "Findings and details", type: "textarea", wide: true,
        help: "Plain text. Leave a blank line between paragraphs; start a line with \"## \" for a heading and \"- \" for a bullet. Up to 50,000 characters." },
      { key: "subtopic_id", label: "Subtopic", type: "relation", relation: { table: "research_topics", label: "name", filter: (d) => ({ parent_id: d.topic_id ?? null }) },
        help: "Subtopics of the chosen topic (add them under Topics)." },
      { key: "region_id", label: "Region / district / city", type: "relation", relation: { table: "research_regions", label: "name", filter: (d) => ({ country_id: d.country_id }) },
        help: "Regions of the chosen country." },
      { key: "period_start", label: "Research period from", type: "date" },
      { key: "period_end", label: "Research period to", type: "date" },
      { key: "published_on", label: "Publication date", type: "date" },
      { key: "author", label: "Author / researcher", type: "text" },
      { key: "organization", label: "Organization", type: "text" },
      { key: "methodology", label: "Methodology", type: "textarea", wide: true, help: "How the information was gathered (up to 5,000 characters)." },
      { key: "origin", label: "Where it comes from", type: "select", required: true, options: opts([["isoko", "ISOKO's own research"], ["external", "An external source"]]) },
      { key: "source_name", label: "Main source", type: "text", help: "e.g. National Institute of Statistics of Rwanda" },
      { key: "source_url", label: "Main source link", type: "text", help: "https:// only" },
      { key: "verification", label: "Verification", type: "select", required: true, options: opts([["unverified", "Unverified"], ["verified", "Verified by ISOKO"]]),
        help: "Verified: an ISOKO analyst checked it against its source." },
      { key: "keywords", label: "Keywords", type: "tags", help: "Comma separated; they help the search find it." },
      { key: "tags", label: "Tags", type: "tags" },
      { key: "cover_path", label: "Cover picture", type: "image", folder: "research" },
    ],
    defaults: { status: "draft", kind: "research", origin: "isoko", verification: "unverified", keywords: [], tags: [] },
    validate: (d) => {
      if (tooLong(d.title, 200)) return "The title can have at most 200 characters.";
      if (tooLong(d.summary, 1000)) return "The summary can have at most 1,000 characters.";
      if (tooLong(d.body, 50000)) return "The findings can have at most 50,000 characters.";
      if (tooLong(d.author, 200) || tooLong(d.organization, 200) || tooLong(d.source_name, 200)) return "Author, organization and source can have at most 200 characters each.";
      if (tooLong(d.methodology, 5000)) return "The methodology can have at most 5,000 characters.";
      if (!isHttps(d.source_url)) return "The source link must start with https://";
      if (d.period_start && d.period_end && String(d.period_end) < String(d.period_start)) return "The research period ends before it starts.";
      if (d.status === "scheduled" && !d.publish_at) return "Choose when it should go on the website.";
      return null;
    },
    // "Verified" records who checked it and when; going back to unverified clears that
    prepare: (p) => {
      if (p.verification === "verified") {
        if (!p.verified_at) p.verified_at = new Date().toISOString();
        if (!p.verified_by) p.verified_by = user?.id ?? null;
      } else {
        p.verified_at = null;
        p.verified_by = null;
      }
    },
    extrasHint: "Now add its numbers, sources, documents and related items below, or press Done.",
    extras: (r) => (
      <div className="space-y-4">
        <StatsEditor itemId={r.id} />
        <SourcesEditor itemId={r.id} />
        <DocumentsEditor itemId={r.id} />
        <RelatedPicker itemId={r.id} />
      </div>
    ),
  }), [user?.id]);
}

const COUNTRIES: EntityConfig = {
  table: "research_countries", noun: "Country", titleKey: "name", order: "sort",
  subtitle: (r) => `${r.code} · ${r.slug} · ${r.is_active ? "active" : "not yet active"}`,
  fields: [
    { key: "name", label: "Name", type: "text", required: true, basic: true },
    { key: "code", label: "Country code", type: "text", required: true, basic: true, help: "Two letters (ISO 3166-1), e.g. RW." },
    { key: "slug", label: "Web name", type: "text", required: true, basic: true, help: "Lowercase letters, numbers and dashes, e.g. rwanda." },
    { key: "is_active", label: "Active on the website", type: "bool", basic: true, help: "Inactive countries are kept for later but not shown." },
    { key: "sort", label: "Order", type: "number" },
  ],
  defaults: { is_active: true, sort: 0 },
  validate: (d) => {
    if (!/^[A-Za-z]{2}$/.test(String(d.code ?? ""))) return "The country code is two letters.";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(d.slug ?? ""))) return "The web name uses lowercase letters, numbers and dashes.";
    if (tooLong(d.name, 80)) return "The name can have at most 80 characters.";
    return null;
  },
  prepare: (p) => { p.code = String(p.code ?? "").toUpperCase(); },
  deleteBlocked: "This country can't be deleted: items or regions are filed under it. Make it inactive instead.",
};

const REGIONS: EntityConfig = {
  table: "research_regions", noun: "Region", titleKey: "name", order: "sort",
  subtitle: (r) => [r.level, r.code].filter(Boolean).join(" · "),
  fields: [
    { key: "country_id", label: "Country", type: "relation", required: true, basic: true, relation: { table: "research_countries", label: "name" } },
    { key: "name", label: "Name", type: "text", required: true, basic: true },
    { key: "level", label: "Level", type: "text", required: true, basic: true, help: "province, district, sector, city, county… whatever the country uses." },
    { key: "slug", label: "Web name", type: "text", required: true, basic: true, help: "Lowercase letters, numbers and dashes; unique within the country." },
    { key: "parent_id", label: "Part of", type: "relation", relation: { table: "research_regions", label: "name", filter: (d) => ({ country_id: d.country_id }) },
      help: "The larger region this one belongs to (a district's province, for example)." },
    { key: "code", label: "Code", type: "text" },
    { key: "sort", label: "Order", type: "number" },
  ],
  defaults: { sort: 0, level: "district" },
  validate: (d) => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(d.slug ?? ""))) return "The web name uses lowercase letters, numbers and dashes.";
    if (tooLong(d.name, 120) || tooLong(d.level, 40)) return "The name (120) or level (40) is too long.";
    if (d.parent_id && d.parent_id === d.id) return "A region can't be part of itself.";
    return null;
  },
  deleteBlocked: "This region can't be deleted: items or smaller regions are filed under it.",
};

const TOPICS: EntityConfig = {
  table: "research_topics", noun: "Topic", titleKey: "name", order: "sort",
  subtitle: (r) => [r.parent_id ? "subtopic" : "topic", r.slug].join(" · "),
  fields: [
    { key: "name", label: "Name", type: "text", required: true, basic: true },
    { key: "slug", label: "Web name", type: "text", required: true, basic: true, help: "Lowercase letters, numbers and dashes, e.g. youth-employment." },
    { key: "parent_id", label: "Subtopic of", type: "relation", basic: true, relation: { table: "research_topics", label: "name", filter: () => ({ parent_id: null }) },
      help: "Leave empty for a main topic." },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "sort", label: "Order", type: "number" },
  ],
  defaults: { sort: 0 },
  validate: (d) => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(d.slug ?? ""))) return "The web name uses lowercase letters, numbers and dashes.";
    if (tooLong(d.name, 80)) return "The name can have at most 80 characters.";
    if (d.parent_id && d.parent_id === d.id) return "A topic can't be a subtopic of itself.";
    return null;
  },
  deleteBlocked: "This topic can't be deleted: items or subtopics are filed under it.",
};

// ============== PARTS OF AN ITEM ==============
/** A small editable table of child rows (numbers, sources): add, change in place, remove. */
function useChildRows(table: string, itemId: string, order: string) {
  const qc = useQueryClient();
  const key = ["research-admin", table, itemId];
  const rows = useQuery({ queryKey: key, queryFn: async () => unwrap(await db.from(table).select("*").eq("item_id", itemId).order(order)) as Row[] });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["research"] }); };
  const insert = async (values: Record<string, unknown>) => {
    try { unwrap(await db.from(table).insert({ item_id: itemId, ...values })); refresh(); return true; } catch (e) { toast.error(errorText(e)); return false; }
  };
  const patch = async (id: string, p: Record<string, unknown>) => {
    try { unwrap(await db.from(table).update(p).eq("id", id)); refresh(); } catch (e) { toast.error(errorText(e)); }
  };
  const remove = async (id: string) => {
    try { unwrap(await db.from(table).delete().eq("id", id)); refresh(); } catch (e) { toast.error(errorText(e)); }
  };
  return { rows, insert, patch, remove };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function StatsEditor({ itemId }: { itemId: string }) {
  const { rows, insert, patch, remove } = useChildRows("research_stats", itemId, "sort");
  const [draft, setDraft] = useState({ label: "", value: "", unit: "", period_label: "", period_date: "", series: "" });
  const add = async () => {
    if (!draft.label.trim()) return toast.error("Give the number a label (e.g. Population).");
    if (draft.value.trim() === "" || Number.isNaN(Number(draft.value))) return toast.error("The value must be a number (no spaces or commas).");
    if (draft.label.length > 120 || draft.unit.length > 40 || draft.period_label.length > 40 || draft.series.length > 80) return toast.error("Label (120), unit (40), period (40) or series (80) is too long.");
    const ok = await insert({
      label: draft.label.trim(), value: Number(draft.value), unit: draft.unit.trim() || null, period_label: draft.period_label.trim() || null,
      period_date: draft.period_date || null, series: draft.series.trim() || null, sort: rows.data?.length ?? 0,
    });
    if (ok) setDraft({ label: "", value: "", unit: "", period_label: "", period_date: "", series: draft.series });
  };
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Numbers and statistics <span className="font-normal text-muted-foreground">({rows.data?.length ?? 0})</span></p>
      <p className="text-xs text-muted-foreground">Each row is one figure. Give several rows the same series name and a period to draw them as one chart line (e.g. series "Population", period 2012, 2022).</p>
      {(rows.data ?? []).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="p-1">Label</th><th className="p-1">Value</th><th className="p-1">Unit</th><th className="p-1">Period</th><th className="p-1">Series</th><th className="p-1" /></tr></thead>
            <tbody>
              {(rows.data ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-1"><Input defaultValue={String(r.label)} className="h-8 min-w-28 text-xs" onBlur={(e) => e.target.value !== r.label && patch(r.id, { label: e.target.value })} /></td>
                  <td className="p-1"><Input defaultValue={String(r.value)} type="number" className="h-8 w-28 text-xs" onBlur={(e) => Number(e.target.value) !== Number(r.value) && !Number.isNaN(Number(e.target.value)) && patch(r.id, { value: Number(e.target.value) })} /></td>
                  <td className="p-1"><Input defaultValue={String(r.unit ?? "")} className="h-8 w-20 text-xs" onBlur={(e) => e.target.value !== (r.unit ?? "") && patch(r.id, { unit: e.target.value || null })} /></td>
                  <td className="p-1"><Input defaultValue={String(r.period_label ?? "")} className="h-8 w-20 text-xs" placeholder="2022" onBlur={(e) => e.target.value !== (r.period_label ?? "") && patch(r.id, { period_label: e.target.value || null })} /></td>
                  <td className="p-1"><Input defaultValue={String(r.series ?? "")} className="h-8 w-24 text-xs" onBlur={(e) => e.target.value !== (r.series ?? "") && patch(r.id, { series: e.target.value || null })} /></td>
                  <td className="p-1"><button type="button" onClick={() => remove(r.id)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove this number"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Label (e.g. Population)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-9 text-sm" />
        <Input placeholder="Value (e.g. 13246394)" type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className="h-9 text-sm" />
        <Input placeholder="Unit (e.g. people, %, RWF)" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="h-9 text-sm" />
        <Input placeholder="Period label (e.g. 2022)" value={draft.period_label} onChange={(e) => setDraft({ ...draft, period_label: e.target.value })} className="h-9 text-sm" />
        <Input type="date" value={draft.period_date} onChange={(e) => setDraft({ ...draft, period_date: e.target.value })} className="h-9 text-sm" aria-label="Period date" />
        <Input placeholder="Series (for a chart)" value={draft.series} onChange={(e) => setDraft({ ...draft, series: e.target.value })} className="h-9 text-sm" />
      </div>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={add}><Plus className="h-4 w-4" /> Add number</Button>
    </div>
  );
}

export function SourcesEditor({ itemId }: { itemId: string }) {
  const { rows, insert, patch, remove } = useChildRows("research_sources", itemId, "sort");
  const [draft, setDraft] = useState({ title: "", url: "", publisher: "", source_type: "other", published_on: "", note: "" });
  const add = async () => {
    if (!draft.title.trim()) return toast.error("Give the source a title.");
    if (draft.title.length > 300 || draft.publisher.length > 200 || draft.note.length > 1000) return toast.error("Title (300), publisher (200) or note (1,000) is too long.");
    if (!isHttps(draft.url)) return toast.error("The source link must start with https://");
    const ok = await insert({
      title: draft.title.trim(), url: draft.url.trim() || null, publisher: draft.publisher.trim() || null, source_type: draft.source_type,
      published_on: draft.published_on || null, note: draft.note.trim() || null, sort: rows.data?.length ?? 0,
    });
    if (ok) setDraft({ title: "", url: "", publisher: "", source_type: "other", published_on: "", note: "" });
  };
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Sources <span className="font-normal text-muted-foreground">({rows.data?.length ?? 0})</span></p>
      <p className="text-xs text-muted-foreground">Where this information comes from. Kept for verification; the website shows the title and publisher.</p>
      <ul className="space-y-1.5">
        {(rows.data ?? []).map((r) => (
          <li key={r.id} className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{String(r.title)} <span className="font-normal text-muted-foreground">· {SOURCE_TYPES.find(([v]) => v === r.source_type)?.[1] ?? String(r.source_type)}</span></p>
              <p className="text-muted-foreground">{[r.publisher, r.published_on ? String(r.published_on).slice(0, 10) : null].filter(Boolean).join(" · ")}</p>
              {r.url ? <a href={String(r.url)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /> {String(r.url)}</a> : null}
              {r.note ? <p className="mt-0.5">{String(r.note)}</p> : null}
            </div>
            <select value={String(r.source_type)} onChange={(e) => patch(r.id, { source_type: e.target.value })} className="h-8 rounded-md border bg-background px-1 text-xs" aria-label="Source type">
              {SOURCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" onClick={() => remove(r.id)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove this source"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-9 text-sm sm:col-span-2" />
        <Input placeholder="https://…" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} className="h-9 text-sm" />
        <Input placeholder="Publisher (e.g. NISR)" value={draft.publisher} onChange={(e) => setDraft({ ...draft, publisher: e.target.value })} className="h-9 text-sm" />
        <select value={draft.source_type} onChange={(e) => setDraft({ ...draft, source_type: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Source type">
          {SOURCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Input type="date" value={draft.published_on} onChange={(e) => setDraft({ ...draft, published_on: e.target.value })} className="h-9 text-sm" aria-label="Published on" />
        <Textarea rows={2} placeholder="Note (what it supports, page, table…)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="text-sm sm:col-span-2" />
      </div>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={add}><Plus className="h-4 w-4" /> Add source</Button>
    </div>
  );
}

/** Supporting files, kept in the private research bucket: staff see them, the public never does. */
export function DocumentsEditor({ itemId }: { itemId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const key = ["research-admin", "research_documents", itemId];
  const docs = useQuery({ queryKey: key, queryFn: async () => unwrap(await db.from("research_documents").select("*").eq("item_id", itemId).order("created_at")) as Row[] });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(files.length);
    for (const file of [...files]) {
      try {
        if (!DOC_MIMES.includes(file.type)) throw new Error("Choose a PDF, CSV, Excel, Word, ZIP, JSON or text file.");
        if (file.size > MAX_DOC_MB * 1024 * 1024) throw new Error(`Files must be under ${MAX_DOC_MB} MB.`);
        const safe = file.name.replace(/[^\w.-]+/g, "-").slice(0, 100);
        const path = `${itemId}/${crypto.randomUUID()}-${safe}`;
        unwrap(await supabase.storage.from(RESEARCH_BUCKET).upload(path, file, { contentType: file.type, upsert: false }));
        unwrap(await db.from("research_documents").insert({ item_id: itemId, name: file.name.slice(0, 200), path, size: file.size, mime: file.type, created_by: user?.id ?? null }));
      } catch (e) {
        toast.error(`${file.name}: ${errorText(e)}`);
      }
      setBusy((n) => n - 1);
    }
    refresh();
    if (input.current) input.current.value = "";
  };
  const remove = async (d: Row) => {
    try {
      await supabase.storage.from(RESEARCH_BUCKET).remove([String(d.path)]);
      unwrap(await db.from("research_documents").delete().eq("id", d.id));
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const open = async (d: Row) => {
    try {
      const { data, error } = await supabase.storage.from(RESEARCH_BUCKET).createSignedUrl(String(d.path), 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Documents <span className="font-normal text-muted-foreground">({docs.data?.length ?? 0}, staff only)</span></p>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy > 0} onClick={() => input.current?.click()}>
          {busy > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy > 0 ? `Uploading ${busy}…` : "Add files"}
        </Button>
        <input ref={input} type="file" multiple accept={DOC_ACCEPT} hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <p className="text-xs text-muted-foreground">The full report, dataset or questionnaire behind the item. Visitors never see or download these; they read the findings on the page.</p>
      {(docs.data ?? []).length > 0 && (
        <ul className="divide-y rounded-lg border text-xs">
          {(docs.data ?? []).map((d) => (
            <li key={d.id} className="flex items-center gap-2 p-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => open(d)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">{String(d.name)}</button>
              <span className="shrink-0 text-muted-foreground">{(Number(d.size) / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => remove(d)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${String(d.name)}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Other items shown as "Related" on the page: search by title, tick to link. */
export function RelatedPicker({ itemId }: { itemId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const key = ["research-admin", "research_item_links", itemId];
  const links = useQuery({ queryKey: key, queryFn: async () => unwrap(await db.from("research_item_links").select("related_id, related:research_items!research_item_links_related_id_fkey(id,title,kind)").eq("item_id", itemId)) as { related_id: string; related: Row | null }[] });
  const found = useQuery({
    queryKey: ["research-admin", "related-search", itemId, q],
    enabled: q.trim().length >= 2,
    queryFn: async () => unwrap(await db.from("research_items").select("id,title,kind,status").neq("id", itemId).ilike("title", `%${q.trim()}%`).order("title").limit(10)) as Row[],
  });
  const chosen = new Set((links.data ?? []).map((l) => l.related_id));
  const toggle = async (id: string) => {
    try {
      if (chosen.has(id)) unwrap(await db.from("research_item_links").delete().eq("item_id", itemId).eq("related_id", id));
      else unwrap(await db.from("research_item_links").insert({ item_id: itemId, related_id: id }));
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["research"] });
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Related items <span className="font-normal text-muted-foreground">({chosen.size})</span></p>
      {(links.data ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(links.data ?? []).map((l) => (
            <button key={l.related_id} type="button" onClick={() => toggle(l.related_id)} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium" title="Unlink">
              <Link2 className="h-3 w-3" /> {String(l.related?.title ?? "Item")} ×
            </button>
          ))}
        </div>
      )}
      <Input placeholder="Search items by title to link them" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 text-sm" />
      {q.trim().length >= 2 && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border text-xs">
          {found.isLoading ? <li className="p-2 text-muted-foreground">Searching…</li>
            : (found.data ?? []).length === 0 ? <li className="p-2 text-muted-foreground">Nothing found.</li>
            : (found.data ?? []).map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 p-2 hover:bg-muted">
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="min-w-0 flex-1 truncate">{String(r.title)}</span>
                  <span className="text-muted-foreground">{KIND_LABEL[String(r.kind)] ?? String(r.kind)}{r.status !== "published" ? ` · ${String(r.status)}` : ""}</span>
                </label>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ============== PAGES ==============
export function ResearchOverview() {
  const items = useQuery({
    queryKey: ["research-admin", "overview"],
    queryFn: async () => unwrap(await db.from("research_items").select("id,title,slug,kind,status,verification,updated_at").order("updated_at", { ascending: false }).limit(2000)) as Row[],
  });
  const all = items.data ?? [];
  const byKind = KINDS.map(([k, label]) => ({ k, label, n: all.filter((r) => r.kind === k).length }));
  const byStatus = ["published", "draft", "scheduled", "archived"].map((s) => ({ s, n: all.filter((r) => r.status === s).length }));
  const unverified = all.filter((r) => r.verification !== "verified" && r.status === "published").length;
  const review = useReviewQueue();
  return (
    <Shell title="Information Hub" subtitle="Research, statistics, reports, studies, findings and datasets on the ISOKO Information Hub. Published items are on the website at once.">
      <h2 className="mb-3 font-semibold">What do you want to add?</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KINDS.map(([k, label]) => (
          <Link key={k} to={`/staff/research/items?new=${k}`} className="card-interactive flex items-center gap-2 rounded-2xl border bg-card p-4 font-semibold">
            <Plus className="h-4 w-4 text-primary" /> {label}
          </Link>
        ))}
        <Link to="/staff/research/topics" className="card-interactive flex items-center gap-2 rounded-2xl border bg-card p-4 font-semibold"><Tags className="h-4 w-4 text-primary" /> A topic</Link>
      </div>

      <h2 className="mb-3 font-semibold">On the hub</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byStatus.map(({ s, n }) => (
          <div key={s} className="flex items-center justify-between rounded-2xl border bg-card p-4"><span className="font-medium capitalize">{s}</span><span className="text-3xl font-bold tabular-nums">{items.data ? n : "–"}</span></div>
        ))}
        <AttentionTile count={review.data?.length} label="Waiting for review" to="/staff/research/review" tone="alert" />
        <div className={cn("flex items-center justify-between rounded-2xl border bg-card p-4", unverified > 0 && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30")}>
          <span className="font-medium">Published but unverified</span><span className="text-3xl font-bold tabular-nums">{items.data ? unverified : "–"}</span>
        </div>
        {byKind.map(({ k, label, n }) => (
          <Link key={k} to="/staff/research/items" className="card-interactive flex items-center justify-between rounded-2xl border bg-card p-4"><span className="font-medium">{label}s</span><span className="text-3xl font-bold tabular-nums">{items.data ? n : "–"}</span></Link>
        ))}
      </div>

      <h2 className="mb-3 font-semibold">Last updated</h2>
      {items.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : all.length === 0 ? <EmptyState>Nothing on the hub yet. Add the first item above.</EmptyState> : (
        <ul className="divide-y rounded-2xl border bg-card">
          {all.slice(0, 10).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{String(r.title)}</span>
              <Pill tone={r.status === "published" ? "done" : r.status === "draft" ? "off" : "wait"}>{String(r.status)}</Pill>
              <span className="text-xs text-muted-foreground">{KIND_LABEL[String(r.kind)]}</span>
              <span className="text-xs text-muted-foreground">{r.verification === "verified" ? "verified" : "unverified"}</span>
              <span className="text-xs text-muted-foreground">updated {formatDate(String(r.updated_at), { day: "numeric", month: "short", year: "numeric" })}</span>
              {r.status === "published" && <Link to={`/research/${String(r.slug)}`} target="_blank" className="text-xs text-primary hover:underline">View</Link>}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

export function ResearchItems() {
  const config = useItemsConfig();
  // ?new=statistic|research|… opens the form with that kind chosen
  const kind = new URLSearchParams(window.location.search).get("new");
  const cfg = useMemo(() => (kind && KIND_LABEL[kind] ? { ...config, defaults: { ...config.defaults, kind } } : config), [config, kind]);
  return (
    <Shell
      title="Items"
      subtitle="Everything on the hub. Fill in the title, kind, summary, country and topic; add numbers, sources and documents once it is saved. Or start from a document: the hub reads it and drafts the item with its figures."
      actions={<CreateFromDocument kind={kind && KIND_LABEL[kind] ? kind : undefined} />}
    >
      <EntityManager config={cfg} openKey={kind && KIND_LABEL[kind] ? kind : undefined} editKey="edit" />
    </Shell>
  );
}

export const ResearchCountries = () => <Shell title="Countries" subtitle="A country stays inactive until there is information about it."><EntityManager config={COUNTRIES} /></Shell>;
export const ResearchRegions = () => <Shell title="Regions" subtitle="Provinces, districts, sectors, cities… each country keeps its own structure."><EntityManager config={REGIONS} /></Shell>;
export const ResearchTopics = () => <Shell title="Topics" subtitle="The subjects information is filed under, with subtopics."><EntityManager config={TOPICS} /></Shell>;

export function ResearchQuestions() {
  const q = useQuery({ queryKey: ["research-admin", "trending"], queryFn: () => rpc<{ question: string; ask_count: number }[]>("research_trending_questions", { p_limit: 20 }) });
  return (
    <Shell title="Questions people ask" subtitle="The most asked questions on the hub, so you know which information to add or improve next. No names or accounts are kept, only the questions.">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{errorText(q.error)}</p> : !q.data?.length ? <EmptyState>No questions asked yet.</EmptyState> : (
        <ol className="divide-y rounded-2xl border bg-card">
          {q.data.map((r, i) => (
            <li key={r.question} className="flex items-center gap-3 p-3 text-sm">
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">{r.question}</span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{r.ask_count}×</span>
            </li>
          ))}
        </ol>
      )}
    </Shell>
  );
}

export const RESEARCH_ICON = BookOpenCheck;
