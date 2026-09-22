// Shared plumbing for Isoko's client services (Travel, Consultancy, Data Analysis).
// Customers use their private link (an access token) through database functions;
// staff read and write the service's tables directly, under row-level security.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ISOKO_CONTACT } from "@/lib/company";

export type ServiceKey = "travel" | "consultancy" | "data";

// The generated Supabase types don't include these tables yet (regenerate them
// after deploying the migrations); like the rest of the site, query untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

/** Calls a database function and throws its (human-readable) error message. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message || "Something went wrong. Please try again.");
  return data as T;
}

/** Throws the error of a Supabase query result, returns its data. */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

// ============== FORMATTING ==============
export function formatMoney(amount: number | string | null | undefined, currency = "USD") {
  const n = Number(amount ?? 0);
  if (currency === "RWF") return `${Math.round(n).toLocaleString("en-US")} RWF`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
}

const asDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`);

export function formatDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  return d ? asDate(d).toLocaleDateString("en-GB", opts) : "";
}

/** "15–22 January", "28 January – 3 February", with the year when it isn't this year. */
export function formatDateRange(from: string, to: string) {
  const a = asDate(from);
  const b = asDate(to);
  const year = b.getFullYear() !== new Date().getFullYear() ? ` ${b.getFullYear()}` : "";
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long" });
  if (from === to) return `${a.getDate()} ${month(a)}${year}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${month(b)}${year}`;
  return `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}${year}`;
}

export const formatTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export function nights(from: string, to: string) {
  return Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000);
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ============== CONTACT ==============
export function whatsappLink(text: string) {
  return `https://wa.me/${ISOKO_CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** WhatsApp link to a customer (staff side). Accepts local Rwandan numbers too. */
export function customerWhatsapp(phone: string, text = "") {
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `250${digits.slice(1)}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ============== FILES ==============
const BUCKET = "service-files";
export const MAX_FILE_MB = 25;
export const DATA_FILE_ACCEPT = ".xlsx,.xls,.csv,.pdf,.doc,.docx,.ppt,.pptx,.zip,.json,.txt,.png,.jpg,.jpeg";
export const DOC_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

function safeName(name: string) {
  const clean = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-80);
  return clean || "file";
}

function checkSize(file: File) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB`);
}

// Customers have no Storage access of their own: the 'service-files' Edge Function
// checks their private link and returns short-lived signed URLs.
async function customerFiles<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("service-files", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? "Could not reach Isoko. Please try again.");
  }
  return data as T;
}

/** Uploads into the customer's own folder of a request; returns the stored path. */
export async function uploadClientFile(service: ServiceKey, token: string, file: File) {
  checkSize(file);
  const { path, signedToken } = await customerFiles<{ path: string; signedToken: string }>({ action: "upload", service, token, filename: file.name });
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, signedToken, file, { contentType: file.type || undefined });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  return path;
}

/** Opens a file of the customer's request (their uploads or what Isoko shared). */
export async function openClientFile(service: ServiceKey, token: string, path: string) {
  const tab = window.open("", "_blank");
  try {
    const { url: relative } = await customerFiles<{ url: string }>({ action: "download", service, token, path });
    const url = new URL(relative, import.meta.env.VITE_SUPABASE_URL).toString();
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/** Staff working file for a request (never visible to the customer). */
export async function uploadStaffFile(service: ServiceKey, requestId: string, file: File) {
  checkSize(file);
  const path = `${service}/internal/${requestId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  return path;
}

/** Gives the customer a copy of a staff file (a deliverable), in their shared folder. */
export async function shareWithClient(service: ServiceKey, token: string, internalPath: string) {
  const name = internalPath.split("/").pop()!;
  const dest = `${service}/${token}/shared/${Date.now()}-${name.replace(/^\d+-/, "")}`;
  const { error } = await supabase.storage.from(BUCKET).copy(internalPath, dest);
  if (error) throw new Error(`Could not share the file: ${error.message}`);
  return dest;
}

/** Opens a stored file (staff). */
export async function openFile(path: string, download?: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data) throw new Error("Could not open the file");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

// ============== OFFERINGS ==============
export type Offering = { id: string; service: "consultancy" | "data"; key: string; name: string; description: string; is_active: boolean; sort: number };

export function useOfferings(service: "consultancy" | "data", includeInactive = false) {
  return useQuery({
    queryKey: ["service_offerings", service, includeInactive],
    queryFn: async () => {
      let q = db.from("service_offerings").select("*").eq("service", service).order("sort");
      if (!includeInactive) q = q.eq("is_active", true);
      return unwrap<Offering[]>(await q);
    },
  });
}

// ============== PAYMENTS ==============
export type PaymentMethod = "momo" | "bank" | "card" | "cash" | "other";
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  momo: "Mobile Money",
  bank: "Bank transfer",
  card: "Card",
  cash: "Cash",
  other: "Other",
};
