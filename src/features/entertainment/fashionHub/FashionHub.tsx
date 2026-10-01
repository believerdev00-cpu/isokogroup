// The Isoko Fashion Hub: Isoko's fashion designs on show, each with what a
// visitor can do about it: say they're interested, ask a question, or ask
// Isoko to produce it. Browsing is public; sending a request needs an account
// (the database refuses visitors, see fashion_submit_request), and the design
// is attached by itself. Nothing here promises a price, a date or production:
// a request starts as "Submitted" and only Isoko's staff move it on.
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircleQuestion, Scissors, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { db, errorText, formatDate, unwrap } from "@/features/services/api";
import { PageLoading } from "@/features/services/ui";
import { ENT, linkFor, onlyPublic, useCreators, type Creator } from "../api";
import { CategoryChips, Img, Masonry, PinCard, SectionIntro, StaffOnlyBanner } from "../ui";
import {
  AVAILABILITY_LABEL, HUB, linkForDesign, submitFashionRequest, useDesign, useDesignCategories, useDesignImages, useDesigns,
  useMyFashionRequests, type Design, type RequestKind, type RequestStatus,
} from "./api";

const STATUS_TONE: Record<RequestStatus, string> = {
  submitted: "bg-white/15 text-white", under_review: "bg-sky-500/20 text-sky-200", more_info_required: "bg-amber-500/20 text-amber-200",
  accepted: "bg-emerald-500/20 text-emerald-200", in_production: "bg-violet-500/20 text-violet-200", ready: "bg-emerald-500/25 text-emerald-100",
  completed: "bg-emerald-600/30 text-emerald-100", declined: "bg-red-500/20 text-red-200",
};

const QUICK_QUESTIONS = [
  "Is this available?", "Can you make this for me?", "How much would it cost?", "Can I change the color?",
  "Can I change the fabric?", "Can you make my size?", "Can you make something similar?", "What sizes are available?",
];

// ============== FASHION → FASHION HUB ==============
/** Two pills at the top of every Fashion page: the portfolio, and the Hub. */
export function FashionSubNav() {
  const { t } = useI18n();
  const items = [
    { to: `${ENT}/fashion`, label: t("ent.fashion"), end: true },
    { to: HUB, label: t("ent.fashionHub"), end: false },
  ];
  return (
    <nav className="flex gap-2 px-4 pt-5 md:px-10" aria-label="Fashion">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) => cn("rounded-full px-4 py-2 text-sm font-semibold transition-colors", isActive ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20")}
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** A banner on the Fashion portfolio page that leads to the Hub. */
export function FashionHubBanner() {
  const { t } = useI18n();
  return (
    <Link to={HUB} className="group mx-4 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-pink-700 to-pink-950 p-5 ring-1 ring-white/10 transition hover:ring-white/40 md:mx-10 md:p-7">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Shirt className="h-6 w-6" /></span>
      <span className="min-w-0">
        <span className="block font-display text-xl font-bold md:text-2xl">{t("ent.fashionHub")}</span>
        <span className="block text-sm text-white/80">{t("hub.intro")}</span>
      </span>
    </Link>
  );
}

// ============== THE HUB ==============
export function FashionHubPage() {
  const { t } = useI18n();
  const designs = useDesigns();
  const cats = useDesignCategories();
  const designers = useCreators("designer", 24);
  const [cat, setCat] = useState<string | null>(null);
  const [shown, setShown] = useState(30);
  if (designs.isLoading) return <PageLoading />;

  const all = onlyPublic(designs.data);
  const catId = cat ? (cats.data ?? []).find((c) => c.slug === cat)?.id : null;
  const list = catId ? all.filter((d) => d.category_id === catId) : all;
  const catName = (id: string | null) => (cats.data ?? []).find((c) => c.id === id)?.name ?? null;
  const people = onlyPublic(designers.data);

  return (
    <>
      <FashionSubNav />
      <SectionIntro eyebrow="Isoko Fashion" title={t("hub.title")} text={t("hub.intro")}>
        <Link to={`${HUB}/requests`} className="inline-flex h-11 items-center rounded-full bg-white/10 px-5 text-sm font-semibold hover:bg-white/20">{t("hub.myRequests")}</Link>
      </SectionIntro>

      <div className="space-y-10">
        {people.length > 0 && (
          <section className="px-4 md:px-10">
            <h2 className="mb-3 font-display text-xl font-bold">{t("hub.designer")}</h2>
            <div className="no-scrollbar flex gap-3 overflow-x-auto">
              {people.map((p) => <PersonCard key={p.id} person={p} />)}
            </div>
          </section>
        )}

        <section className="px-4 md:px-10">
          <div className="mb-5"><CategoryChips items={cats.data ?? []} value={cat} onChange={(v) => { setCat(v); setShown(30); }} /></div>
          {all.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <Shirt className="h-9 w-9 text-neutral-500" />
              <p className="mt-3 max-w-sm text-sm text-neutral-400">{t("hub.noDesigns")}</p>
            </div>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-neutral-400">{t("ent.nothingYet")}</p>
          ) : (
            <>
              <Masonry>
                {list.slice(0, shown).map((d) => (
                  <PinCard
                    key={d.id}
                    to={linkForDesign(d.slug)}
                    title={d.name}
                    path={d.cover_path}
                    w={d.cover_w}
                    h={d.cover_h}
                    subtitle={[AVAILABILITY_LABEL[d.availability], catName(d.category_id)].filter(Boolean).join(" · ")}
                    demo={d.is_demo}
                  />
                ))}
              </Masonry>
              {list.length > shown && (
                <div className="mt-6 text-center">
                  <button type="button" onClick={() => setShown((n) => n + 30)} className="rounded-full bg-white/10 px-6 py-3 font-semibold hover:bg-white/20">Show more</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function PersonCard({ person: p }: { person: Creator }) {
  return (
    <Link to={linkFor("creator", p.slug)} className="group w-[38vw] max-w-[180px] shrink-0 snap-start md:w-[170px]">
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10 transition group-hover:ring-white/40">
        <Img path={p.avatar_path ?? p.cover_path} alt={p.display_name} size="sm" ratio="1 / 1" className="transition-transform duration-500 group-hover:scale-105" />
      </div>
      <p className="mt-2 font-semibold">{p.display_name}</p>
      {p.headline && <p className="line-clamp-1 text-xs text-neutral-400">{p.headline}</p>}
    </Link>
  );
}

// ============== ONE DESIGN ==============
export function DesignDetail() {
  const { t } = useI18n();
  const { slug } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const design = useDesign(slug);
  const images = useDesignImages(design.data?.id);
  const cats = useDesignCategories();
  const designer = useQuery({
    queryKey: ["ent", "creator-by-id", design.data?.designer_id],
    enabled: !!design.data?.designer_id,
    queryFn: async () => unwrap(await db.from("ent_creators").select("*").eq("id", design.data!.designer_id).maybeSingle()) as Creator | null,
  });
  const more = useDesigns(40);
  const [open, setOpen] = useState<RequestKind | null>(null);

  // Back from signing in with ?request=inquiry|production: open that form. The
  // parameter stays in the address until the form is closed: the page can be
  // mounted twice while the route transition finishes, and the second mount
  // must open the form again.
  const wanted = params.get("request");
  useEffect(() => {
    if (user && (wanted === "inquiry" || wanted === "production")) setOpen(wanted);
  }, [user, wanted]);
  const closeRequest = () => {
    setOpen(null);
    if (params.has("request")) {
      params.delete("request");
      setParams(params, { replace: true });
    }
  };

  if (design.isLoading) return <PageLoading />;
  const d = design.data;
  if (!d) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-semibold">{t("ent.nothingYet")}</p>
        <Link to={HUB} className="mt-5 rounded-full bg-white px-6 py-3 font-semibold text-black hover:bg-white/85">{t("ent.fashionHub")}</Link>
      </div>
    );
  }
  const category = (cats.data ?? []).find((c) => c.id === d.category_id)?.name ?? null;
  const gallery = images.data ?? [];
  const related = onlyPublic(more.data).filter((o) => o.id !== d.id && (o.category_id === d.category_id || o.designer_id === d.designer_id)).slice(0, 10);

  return (
    <>
      <StaffOnlyBanner status={d.status} />
      <FashionSubNav />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-6 md:grid-cols-[1.3fr_1fr] md:pt-8">
        <div className="space-y-3">
          <Img path={d.cover_path} alt={d.name} ratio={d.cover_w && d.cover_h ? `${d.cover_w} / ${d.cover_h}` : "4 / 5"} className="rounded-3xl" />
          {gallery.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {gallery.map((i) => (
                <figure key={i.id}>
                  <Img path={i.path} alt={i.caption ?? d.name} size="sm" ratio={i.w && i.h ? `${i.w} / ${i.h}` : "4 / 5"} className="rounded-2xl" />
                  {i.caption && <figcaption className="mt-1 text-xs text-neutral-400">{i.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 md:sticky md:top-24 md:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("ent.fashionHub")}{category ? ` · ${category}` : ""}</p>
          <h1 className="font-display text-3xl font-bold md:text-5xl">{d.name}</h1>
          <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{t("hub.availability")}: {AVAILABILITY_LABEL[d.availability]}</p>
          {d.description && <p className="whitespace-pre-line leading-relaxed text-neutral-300">{d.description}</p>}

          <dl className="space-y-3 text-sm">
            {d.style_notes && <Fact label={t("hub.style")}>{d.style_notes}</Fact>}
            {d.colors.length > 0 && <Fact label={t("hub.colors")}><Chips items={d.colors} /></Fact>}
            {d.sizes.length > 0 && <Fact label={t("hub.sizes")}><Chips items={d.sizes} /></Fact>}
            {d.fabric && <Fact label={t("hub.fabric")}>{d.fabric}</Fact>}
            {designer.data && (
              <Fact label={t("hub.designer")}>
                <Link to={linkFor("creator", designer.data.slug)} className="font-semibold underline-offset-4 hover:underline">{designer.data.display_name}</Link>
              </Fact>
            )}
            {category && <Fact label={t("hub.category")}>{category}</Fact>}
          </dl>

          {/* What you can do with this design */}
          <div className="flex flex-col gap-2 pt-2">
            <button type="button" onClick={() => setOpen("inquiry")} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-semibold text-black hover:bg-white/85">
              <Heart className="h-5 w-5" /> {t("hub.interested")}
            </button>
            <button type="button" onClick={() => setOpen("inquiry")} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-6 font-semibold hover:bg-white/20">
              <MessageCircleQuestion className="h-5 w-5" /> {t("hub.ask")}
            </button>
            <button type="button" onClick={() => setOpen("production")} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-white hover:bg-primary/90">
              <Scissors className="h-5 w-5" /> {t("hub.request")}
            </button>
            <p className="text-xs text-neutral-400">{t("hub.noPromise")}</p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14 px-4 md:px-10">
          <h2 className="mb-4 font-display text-2xl font-bold">{t("ent.fashionHub")}</h2>
          <Masonry>
            {related.map((o) => <PinCard key={o.id} to={linkForDesign(o.slug)} title={o.name} path={o.cover_path} w={o.cover_w} h={o.cover_h} subtitle={AVAILABILITY_LABEL[o.availability]} demo={o.is_demo} />)}
          </Masonry>
        </section>
      )}
      <div className="mt-10 px-4 md:px-10">
        <Link to={HUB} className="text-sm font-semibold text-neutral-400 hover:text-white">← {t("ent.fashionHub")}</Link>
      </div>

      <RequestDialog design={d} kind={open} onClose={closeRequest} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-neutral-200">{children}</dd>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return <div className="flex flex-wrap gap-1.5">{items.map((c) => <span key={c} className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm">{c}</span>)}</div>;
}

// ============== THE REQUEST ==============
/** Asking about a design, or asking Isoko to produce it. The design is attached by itself. */
function RequestDialog({ design: d, kind, onClose }: { design: Design; kind: RequestKind | null; onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [fabric, setFabric] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customization, setCustomization] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const open = kind !== null;

  useEffect(() => {
    if (!open) {
      setMessage(""); setSize(""); setColor(""); setFabric(""); setQuantity("1"); setCustomization(""); setError(null); setDone(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      const r = await submitFashionRequest({
        design_id: d.id, kind, message,
        ...(kind === "production" ? { size, color, fabric, quantity, customization } : {}),
      });
      setDone(r.reference);
      qc.invalidateQueries({ queryKey: ["ent", "fashion-requests"] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Where to come back to after signing in or registering: this design, with the form open
  const from = `${location.pathname}?request=${kind ?? "inquiry"}`;
  const title = kind === "production" ? t("hub.request") : t("hub.ask");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-h-[92vh] overflow-y-auto border-white/10 bg-neutral-900 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2 text-left">
              <Img path={d.cover_path} alt="" size="sm" ratio="1 / 1" className="w-12 shrink-0 rounded-lg" />
              <span className="min-w-0 text-sm text-neutral-300">
                <span className="block truncate font-semibold text-white">{d.name}</span>
                <span className="block truncate text-xs">{AVAILABILITY_LABEL[d.availability]}{d.fabric ? ` · ${d.fabric}` : ""}</span>
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="space-y-4">
            <p className="font-semibold">{t("access.accountRequired")}</p>
            <p className="text-sm text-neutral-300">{t("access.explain")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1 rounded-full"><Link to="/login?tab=register" state={{ from }}>{t("access.register")}</Link></Button>
              <Button asChild variant="outline" className="flex-1 rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/login" state={{ from }}>{t("access.signIn")}</Link></Button>
            </div>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-semibold">{t("hub.sent")}</p>
            <p className="font-mono text-2xl font-bold tracking-wider">{done}</p>
            <p className="text-sm text-neutral-300">{t("hub.noPromise")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1 rounded-full"><Link to={`${HUB}/requests`}>{t("hub.myRequests")}</Link></Button>
              <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">OK</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {kind === "inquiry" && (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setMessage((m) => (m.trim() ? `${m.trim()}\n${q}` : q))}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {kind === "production" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("hub.size")}>
                  {d.sizes.length > 0 ? (
                    <Choice value={size} onChange={setSize} options={d.sizes} />
                  ) : (
                    <Input value={size} onChange={(e) => setSize(e.target.value)} maxLength={40} className="border-white/15 bg-white/5" />
                  )}
                </Field>
                <Field label={t("hub.color")}>
                  {d.colors.length > 0 ? (
                    <Choice value={color} onChange={setColor} options={d.colors} />
                  ) : (
                    <Input value={color} onChange={(e) => setColor(e.target.value)} maxLength={60} className="border-white/15 bg-white/5" />
                  )}
                </Field>
                <Field label={t("hub.fabricPref")}>
                  <Input value={fabric} onChange={(e) => setFabric(e.target.value)} maxLength={120} placeholder={d.fabric ?? ""} className="border-white/15 bg-white/5" />
                </Field>
                <Field label={t("hub.quantity")}>
                  <Input type="number" min={1} max={1000} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="border-white/15 bg-white/5" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t("hub.customization")}>
                    <Textarea rows={2} value={customization} onChange={(e) => setCustomization(e.target.value)} maxLength={2000} className="border-white/15 bg-white/5" />
                  </Field>
                </div>
              </div>
            )}
            <Field label={t("hub.message")}>
              <Textarea rows={kind === "inquiry" ? 4 : 2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} required={kind === "inquiry"} className="border-white/15 bg-white/5" />
            </Field>
            {error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
            <p className="text-xs text-neutral-400">{t("hub.noPromise")}</p>
            <Button type="submit" disabled={busy} className="w-full rounded-full">{busy ? "…" : t("hub.send")}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-neutral-300">{label}</span>
      {children}
    </label>
  );
}

function Choice({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white [&>option]:text-black">
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ============== MY REQUESTS ==============
export function MyFashionRequests() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const location = useLocation();
  const requests = useMyFashionRequests();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <>
      <FashionSubNav />
      <SectionIntro eyebrow={t("ent.fashionHub")} title={t("hub.myRequests")} text={t("hub.noPromise")} />
      <div className="px-4 md:px-10">
        {requests.isLoading ? (
          <PageLoading />
        ) : !requests.data?.length ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <Shirt className="h-9 w-9 text-neutral-500" />
            <p className="mt-3 text-sm text-neutral-400">{t("ent.nothingYet")}</p>
            <Link to={HUB} className="mt-5 rounded-full bg-white px-6 py-3 font-semibold text-black hover:bg-white/85">{t("ent.fashionHub")}</Link>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {requests.data.map((r) => (
              <li key={r.id} className="flex gap-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                <Link to={r.design ? linkForDesign(r.design.slug) : HUB} className="shrink-0">
                  <Img path={r.design?.cover_path} alt="" size="sm" ratio="3 / 4" className="w-20 rounded-xl" />
                </Link>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold tracking-wider">{r.reference}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[r.status])}>{t(`hub.status.${r.status}`)}</span>
                  </div>
                  <p className="truncate font-semibold">{r.design?.name ?? "—"}</p>
                  <p className="text-xs text-neutral-400">{r.kind === "production" ? t("hub.request") : t("hub.ask")} · {formatDate(r.created_at)}</p>
                  {r.kind === "production" && (
                    <p className="text-xs text-neutral-400">
                      {[r.size && `${t("hub.size")}: ${r.size}`, r.color && `${t("hub.color")}: ${r.color}`, r.quantity && `${t("hub.quantity")}: ${r.quantity}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {r.message && <p className="line-clamp-3 whitespace-pre-line text-sm text-neutral-300">{r.message}</p>}
                  {r.staff_note && (
                    <p className="rounded-lg bg-white/10 px-3 py-2 text-sm"><span className="font-semibold">Isoko:</span> {r.staff_note}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
