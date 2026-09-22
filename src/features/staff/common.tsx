import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, MessageCircle, Phone, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  customerWhatsapp, db, errorText, formatDate, formatMoney, PAYMENT_METHOD_LABEL, unwrap, type PaymentMethod, type ServiceKey,
} from "@/features/services/api";
import { useStaffDirectory } from "./access";

// ============== PAGE SHELL ==============
export function StaffPage({ title, subtitle, nav, actions, children }: { title: ReactNode; subtitle?: ReactNode; nav?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-4">
      {nav}
      <div className="mb-5 mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1 text-muted-foreground">{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** Section tabs of a service; a fixed bottom bar on phones, tabs on larger screens. */
export function SubNav({ items }: { items: { to: string; label: string; icon: typeof Plus; end?: boolean }[] }) {
  const link = (mobile: boolean) =>
    items.map((i) => (
      <NavLink
        key={i.to}
        to={i.to}
        end={i.end}
        className={({ isActive }) =>
          mobile
            ? cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-foreground" : "text-muted-foreground")
            : cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")
        }
      >
        <i.icon className={mobile ? "h-5 w-5" : "h-4 w-4"} />
        {i.label}
      </NavLink>
    ));
  return (
    <>
      <nav className="hidden gap-1 rounded-xl bg-muted p-1 sm:inline-flex" aria-label="Sections">{link(false)}</nav>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Sections">
        {link(true)}
      </nav>
    </>
  );
}

// ============== DASHBOARD ==============
export function AttentionTile({ count, label, to, tone = "default" }: { count: number | undefined; label: string; to: string; tone?: "default" | "alert" }) {
  const n = count ?? 0;
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md",
        n > 0 && tone === "alert" && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className={cn("font-display text-3xl font-bold tabular-nums", n === 0 && "text-muted-foreground/50")}>{count === undefined ? "–" : n}</span>
    </Link>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Panel({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const PILL: Record<string, string> = {
  new: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  wait: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  off: "bg-muted text-muted-foreground",
  work: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
};
export function Pill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", PILL[tone])}>{children}</span>;
}

// ============== CONTACT ==============
export function ContactButtons({ phone, email, name, reference, compact = false }: { phone: string; email: string; name: string; reference: string; compact?: boolean }) {
  const hello = `Hello ${name.split(" ")[0]}, this is Isoko about your request ${reference}.`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size={compact ? "sm" : "default"} className="bg-[#1f9d55] text-white hover:bg-[#188047]">
        <a href={customerWhatsapp(phone, hello)} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp</a>
      </Button>
      <Button asChild size={compact ? "sm" : "default"} variant="outline">
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone className="mr-1.5 h-4 w-4" /> Call</a>
      </Button>
      {!compact && (
        <Button asChild variant="outline">
          <a href={`mailto:${email}?subject=${encodeURIComponent(`Isoko · ${reference}`)}`}><Mail className="mr-1.5 h-4 w-4" /> Email</a>
        </Button>
      )}
    </div>
  );
}

/** A link staff can send the customer to follow their request. */
export function CustomerLinkButton({ path }: { path: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          toast.success("Customer link copied");
        } catch {
          toast.error("Couldn't copy");
        }
      }}
    >
      Copy customer link
    </Button>
  );
}

// ============== ASSIGNMENT ==============
export function AssignSelect({ service, value, onChange, label }: { service: ServiceKey; value: string | null; onChange: (id: string | null) => void; label: string }) {
  const staff = useStaffDirectory(service);
  const { user } = useAuth();
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="mt-1 h-10 w-full rounded-md border bg-background px-3"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Not assigned</option>
        {(staff.data ?? []).map((s) => (
          <option key={s.user_id} value={s.user_id}>{s.full_name}{s.user_id === user?.id ? " (me)" : ""}</option>
        ))}
      </select>
    </label>
  );
}

// ============== NOTES ==============
export function NotesPanel({ value, onSave, title = "Staff notes" }: { value: string; onSave: (v: string) => Promise<void>; title?: string }) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const dirty = text !== value;
  return (
    <Panel title={title} right={<span className="text-xs text-muted-foreground">Never shown to the customer</span>}>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={10000} />
      {dirty && (
        <Button
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(text);
              toast.success("Notes saved");
            } catch (e) {
              toast.error(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save notes
        </Button>
      )}
    </Panel>
  );
}

// ============== TASKS ==============
type Task = { id: string; title: string; due_date: string | null; done: boolean };

export function TasksPanel({ table, requestId }: { table: "consult_tasks" | "data_tasks"; requestId: string }) {
  const qc = useQueryClient();
  const key = [table, requestId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => unwrap<Task[]>(await db.from(table).select("*").eq("request_id", requestId).order("created_at")),
  });
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const run = useMutation({
    mutationFn: async (fn: () => Promise<{ error: { message: string } | null }>) => {
      const { error } = await fn();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorText(e)),
  });
  const tasks = q.data ?? [];
  return (
    <Panel title="Tasks" right={tasks.length > 0 && <span className="text-xs text-muted-foreground">{tasks.filter((t) => t.done).length}/{tasks.length} done</span>}>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-muted/50">
            <button
              type="button"
              aria-label={t.done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
              onClick={() => run.mutate(() => db.from(table).update({ done: !t.done }).eq("id", t.id))}
              className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", t.done && "border-transparent bg-emerald-600 text-white")}
            >
              {t.done && <Check className="h-3.5 w-3.5" />}
            </button>
            <span className={cn("min-w-0 flex-1 text-sm", t.done && "text-muted-foreground line-through")}>{t.title}</span>
            {t.due_date && <span className="text-xs text-muted-foreground">{formatDate(t.due_date, { day: "numeric", month: "short" })}</span>}
            <button type="button" aria-label={`Delete "${t.title}"`} className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100" onClick={() => run.mutate(() => db.from(table).delete().eq("id", t.id))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run.mutate(() => db.from(table).insert({ request_id: requestId, title: title.trim(), due_date: due || null }));
          setTitle("");
          setDue("");
        }}
      >
        <Input placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <Input type="date" aria-label="Due date" className="w-36 shrink-0" value={due} onChange={(e) => setDue(e.target.value)} />
        <Button type="submit" size="icon" aria-label="Add task" disabled={!title.trim()}><Plus className="h-4 w-4" /></Button>
      </form>
    </Panel>
  );
}

// ============== PAYMENTS ==============
export type Payment = {
  id: string; amount: number; method: PaymentMethod; reference: string; status: "pending" | "confirmed" | "rejected";
  from_customer: boolean; created_at: string; confirmed_at: string | null;
};

/** Record payments, and confirm the ones customers report. */
export function PaymentsPanel({
  table, fk, parentId, total, currency, onChange,
}: { table: "travel_payments" | "consult_payments" | "data_payments"; fk: "trip_id" | "request_id"; parentId: string; total: number | null; currency: string; onChange?: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = [table, parentId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => unwrap<Payment[]>(await db.from(table).select("*").eq(fk, parentId).order("created_at")),
  });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("momo");
  const [ref, setRef] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["staff_payments"] });
    onChange?.();
  };
  const setStatus = async (p: Payment, status: "confirmed" | "rejected") => {
    const { error } = await db.from(table).update({ status, confirmed_at: new Date().toISOString(), confirmed_by: user?.id }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(status === "confirmed" ? "Payment confirmed" : "Payment rejected");
    refresh();
  };
  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await db.from(table).insert({
      [fk]: parentId, amount: Number(amount), method, reference: ref.trim(), status: "confirmed", from_customer: false,
      confirmed_at: new Date().toISOString(), confirmed_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    setOpen(false);
    setAmount("");
    setRef("");
    refresh();
  };
  const payments = q.data ?? [];
  const paid = payments.filter((p) => p.status === "confirmed").reduce((s, p) => s + Number(p.amount), 0);
  return (
    <Panel title="Payments" right={<Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "Cancel" : "Record payment"}</Button>}>
      <p className="text-sm">
        Paid <span className="font-bold">{formatMoney(paid, currency)}</span>
        {total != null && <> of {formatMoney(total, currency)} · Remaining <span className="font-bold">{formatMoney(Math.max(total - paid, 0), currency)}</span></>}
      </p>
      {open && (
        <form onSubmit={record} className="mt-3 grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-4">
          <Input type="number" min="0.01" step="any" placeholder={`Amount (${currency})`} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </select>
          <Input placeholder="Reference" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} />
          <Button type="submit" disabled={!amount}>Save</Button>
        </form>
      )}
      {payments.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-semibold tabular-nums">{formatMoney(p.amount, currency)}</span>
              <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method]}{p.reference && ` · ${p.reference}`} · {formatDate(p.created_at, { day: "numeric", month: "short" })}</span>
              <span className="ml-auto flex items-center gap-2">
                {p.status === "pending" ? (
                  <>
                    <Pill tone="wait">From customer · check</Pill>
                    <Button size="sm" onClick={() => setStatus(p, "confirmed")}><Check className="mr-1 h-4 w-4" />Confirm</Button>
                    <Button size="sm" variant="ghost" aria-label="Reject payment" onClick={() => setStatus(p, "rejected")}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <Pill tone={p.status === "confirmed" ? "done" : "off"}>{p.status === "confirmed" ? "Confirmed" : "Rejected"}</Pill>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
