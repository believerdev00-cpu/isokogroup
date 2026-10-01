// The Isoko Fashion Hub in the media desk: the designs on show (same manager
// as every other kind of content) and the requests people sent about them,
// which staff answer and move through their statuses. Who may do this is
// decided by the database (media staff and admins).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink } from "react-router-dom";
import { ArrowLeft, Inbox, Shirt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { errorText, formatDate } from "@/features/services/api";
import { mediaUrl } from "@/features/entertainment/api";
import {
  AVAILABILITY_LABEL, REQUEST_STATUSES, linkForDesign, updateFashionRequest, useFashionDesk, type DeskRow, type RequestStatus,
} from "@/features/entertainment/fashionHub/api";
import { EmptyState, Pill, StaffPage } from "../common";
import { EntityManager, ImagesEditor, type EntityConfig } from "./manager";

const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Submitted", under_review: "Under review", more_info_required: "More information required", accepted: "Accepted",
  in_production: "In production", ready: "Ready", completed: "Completed", declined: "Declined",
};
const STATUS_TONE: Record<RequestStatus, "new" | "wait" | "work" | "done" | "off"> = {
  submitted: "new", under_review: "wait", more_info_required: "wait", accepted: "work", in_production: "work", ready: "done", completed: "done", declined: "off",
};

const DESIGNS: EntityConfig = {
  table: "ent_fashion_designs", noun: "Design", titleKey: "name", imageKey: "cover_path", publishable: true, featurable: true, slug: true,
  deleteBlocked: "This design can't be deleted: customers have already sent requests about it. Archive it instead, and it leaves the website while their requests keep their history.",
  subtitle: (r) => [AVAILABILITY_LABEL[r.availability as keyof typeof AVAILABILITY_LABEL], r.fabric, ((r.sizes as string[]) ?? []).join("/")].filter(Boolean).join(" · "),
  fields: [
    { key: "name", label: "Design name", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "cover_path", label: "Main picture", type: "image", folder: "fashion-hub", dims: ["cover_w", "cover_h"], basic: true },
    { key: "availability", label: "Availability", type: "select", required: true, basic: true,
      options: (Object.keys(AVAILABILITY_LABEL) as (keyof typeof AVAILABILITY_LABEL)[]).map((value) => ({ value, label: AVAILABILITY_LABEL[value] })) },
    { key: "category_id", label: "Category", type: "relation", relation: { table: "ent_categories", label: "name", filter: () => ({ section: "design" }) } },
    { key: "designer_id", label: "Designer", type: "relation", relation: { table: "ent_creators", label: "display_name", filter: () => ({ kinds: ["designer"] }) } },
    { key: "style_notes", label: "Style notes", type: "textarea", wide: true, help: "Cut, occasion, how it is worn." },
    { key: "colors", label: "Available colours", type: "tags" },
    { key: "sizes", label: "Available sizes", type: "tags", help: "e.g. S, M, L, XL or measurements." },
    { key: "fabric", label: "Fabric / material", type: "text" },
  ],
  defaults: { status: "draft", availability: "on_request", colors: [], sizes: [] },
  validate: (d) => (d.status === "scheduled" && !d.publish_at ? "Choose when it should go on the website." : null),
  extrasHint: "Add more pictures below if you like, or press Done.",
  extras: (r) => <ImagesEditor table="ent_fashion_design_images" column="design_id" parentId={r.id} />,
};

const NAV = [
  { to: "/staff/media/fashion-hub", label: "Designs", icon: Shirt, end: true },
  { to: "/staff/media/fashion-hub/requests", label: "Requests", icon: Inbox },
];

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <StaffPage
      title={title}
      subtitle={subtitle}
      nav={
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4" aria-label="Fashion Hub sections">
          <Link to="/staff/media" className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Media
          </Link>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
      }
    >
      {children}
    </StaffPage>
  );
}

export const MediaFashionHub = () => (
  <Shell title="Fashion Hub designs" subtitle="The styles people can ask about or ask Isoko to produce. Publish a design to show it in the Hub.">
    <EntityManager config={DESIGNS} openKey="design" />
  </Shell>
);

export function MediaFashionRequests() {
  const desk = useFashionDesk();
  const [filter, setFilter] = useState<RequestStatus | "all" | "open">("open");
  const rows = (desk.data ?? []).filter((r) =>
    filter === "all" ? true : filter === "open" ? !["completed", "declined"].includes(r.status) : r.status === filter,
  );
  return (
    <Shell title="Fashion Hub requests" subtitle="Questions and production requests about the designs. Reply in the note to the customer; move the status only when it is true.">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {([["open", "Open"], ["all", "All"], ...REQUEST_STATUSES.map((s) => [s, STATUS_LABEL[s]])] as [RequestStatus | "all" | "open", string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium", filter === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
          >
            {label}
            {key === "open" && desk.data ? ` (${desk.data.filter((r) => !["completed", "declined"].includes(r.status)).length})` : ""}
          </button>
        ))}
      </div>
      {desk.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : desk.isError ? (
        <EmptyState>{errorText(desk.error)}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>No requests here.</EmptyState>
      ) : (
        <div className="space-y-3">{rows.map((r) => <RequestCard key={r.id} row={r} />)}</div>
      )}
    </Shell>
  );
}

function RequestCard({ row: r }: { row: DeskRow }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RequestStatus>(r.status);
  const [staffNote, setStaffNote] = useState(r.staff_note ?? "");
  const [internalNote, setInternalNote] = useState(r.internal_note ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = status !== r.status || staffNote !== (r.staff_note ?? "") || internalNote !== (r.internal_note ?? "");
  const save = async () => {
    setBusy(true);
    try {
      await updateFashionRequest(r.id, status, staffNote, internalNote);
      toast.success(`${r.reference} saved`);
      qc.invalidateQueries({ queryKey: ["media-admin", "fashion-desk"] });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const wishes = [
    r.size && `Size: ${r.size}`, r.color && `Colour: ${r.color}`, r.fabric && `Fabric: ${r.fabric}`, r.quantity && `Quantity: ${r.quantity}`,
  ].filter(Boolean).join(" · ");
  return (
    <article className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <Link to={linkForDesign(r.design_slug)} target="_blank" className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {r.design_cover_path && <img src={mediaUrl(r.design_cover_path, "sm") ?? undefined} alt="" className="h-full w-full object-cover" loading="lazy" />}
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold tracking-wider">{r.reference}</span>
            <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
            <Pill tone="off">{r.kind === "production" ? "Production request" : "Question"}</Pill>
          </div>
          <p className="font-semibold">{r.design_name}</p>
          <p className="text-sm text-muted-foreground">
            {r.customer_name ?? "—"}{r.customer_email ? ` · ${r.customer_email}` : ""} · {formatDate(r.created_at)}
          </p>
          {wishes && <p className="text-sm">{wishes}</p>}
          {r.customization && <p className="text-sm"><span className="font-semibold">Customization:</span> {r.customization}</p>}
          {r.message && <p className="whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-sm">{r.message}</p>}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[200px_1fr_1fr]">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as RequestStatus)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Reply to the customer <span className="font-normal text-muted-foreground">(they see this)</span></span>
          <Textarea rows={3} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} maxLength={2000} placeholder="Price, timing, what you need from them…" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Private note <span className="font-normal text-muted-foreground">(staff only)</span></span>
          <Textarea rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={2000} />
        </label>
      </div>
      {dirty && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </article>
  );
}
