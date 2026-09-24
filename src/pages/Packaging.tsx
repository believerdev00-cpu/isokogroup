import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import paperBags from "@/assets/paper-bags.jpeg";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackagingSteps, PHOTO_CREDITS } from "@/components/packaging/PackagingSteps";
import { ArrowRight, Check, Minus, Phone, Plus, Search, X } from "lucide-react";

type Product = { code: string; name: string; price: number; unit: string };
type Category = { id: string; title: string; note?: string; products: Product[] };

const categories: Category[] = [
  {
    id: "reuse-pp-sakes",
    title: "Reuse PP Woven Bags (Sakes)",
    note: "Sold per piece (Pcs)",
    products: [
      { code: "USAK-100", name: "Used sakes — 100 kg", price: 130, unit: "pc" },
      { code: "USAK-50", name: "Used sakes — 50 kg", price: 110, unit: "pc" },
      { code: "USAK-25", name: "Used sakes — 25 kg", price: 90, unit: "pc" },
    ],
  },
  {
    id: "reuse-corrboxes",
    title: "Reuse CorrBoxes (Paper Cartons)",
    note: "Price per kg",
    products: [
      { code: "RCB-STR-BIG", name: "Strong CorrBoxes — Big", price: 350, unit: "kg" },
      { code: "RCB-STR-SML", name: "Strong CorrBoxes — Small", price: 350, unit: "kg" },
      { code: "RCB-SFT-BIG", name: "Soft CorrBoxes — Big", price: 350, unit: "kg" },
      { code: "RCB-SFT-SML", name: "Soft CorrBoxes — Small", price: 350, unit: "kg" },
    ],
  },
  {
    id: "plastic-waste",
    title: "Plastic Waste",
    note: "Price per kg",
    products: [
      { code: "PW-G1", name: "Plastic Waste — Grade 1", price: 250, unit: "kg" },
      { code: "PW-G2", name: "Plastic Waste — Grade 2", price: 120, unit: "kg" },
    ],
  },
  {
    id: "paper-egg",
    title: "Paper Roll & Egg Trays",
    products: [
      { code: "PAPR", name: "Paper roll", price: 800, unit: "kg" },
      { code: "EGGT", name: "Egg trays", price: 200, unit: "pc" },
    ],
  },
  {
    id: "corrugated-boxes",
    title: "Corrugated Boxes",
    note: "Sold per piece",
    products: [
      { code: "COR-BX-01", name: "COR-BX-01", price: 3000, unit: "pc" },
      { code: "COR-BX-02", name: "COR-BX-02", price: 3400, unit: "pc" },
      { code: "COR-BX-03", name: "COR-BX-03", price: 3800, unit: "pc" },
      { code: "COR-BX-04", name: "COR-BX-04", price: 4300, unit: "pc" },
    ],
  },
  {
    id: "paper-bags",
    title: "Paper Bags (Envelopes)",
    note: "Price per kg",
    products: [
      { code: "ENV-01", name: "ENV-01", price: 2400, unit: "kg" },
      { code: "ENV-02", name: "ENV-02", price: 2300, unit: "kg" },
      { code: "ENV-03", name: "ENV-03", price: 2200, unit: "kg" },
      { code: "ENV-05", name: "ENV-05", price: 2100, unit: "kg" },
      { code: "ENV-08", name: "ENV-08", price: 2000, unit: "kg" },
      { code: "ENV-10", name: "ENV-10", price: 1900, unit: "kg" },
      { code: "ENV-12", name: "ENV-12", price: 1800, unit: "kg" },
      { code: "ENV-14", name: "ENV-14", price: 1800, unit: "kg" },
      { code: "ENV-16", name: "ENV-16", price: 1800, unit: "kg" },
      { code: "ENV-25", name: "ENV-25", price: 1800, unit: "kg" },
      { code: "ENV-50", name: "ENV-50", price: 3800, unit: "kg" },
    ],
  },
  {
    id: "pp-woven-pcs",
    title: "PP Woven Bags (Sakes)",
    note: "Sold per piece",
    products: [
      { code: "PP-WVN-BG-100", name: "PP-WVN-BG-100", price: 280, unit: "pc" },
      { code: "PP-WVN-BG-50", name: "PP-WVN-BG-50", price: 220, unit: "pc" },
      { code: "PP-WVN-BG-25", name: "PP-WVN-BG-25", price: 230, unit: "pc" },
      { code: "PP-WVN-BG-10", name: "PP-WVN-BG-10", price: 115, unit: "pc" },
      { code: "PP-WVN-BG-05", name: "PP-WVN-BG-05", price: 70, unit: "pc" },
      { code: "PP-WVN-BG-2.5", name: "PP-WVN-BG-2.5", price: 65, unit: "pc" },
    ],
  },
  {
    id: "biodeg-polybags",
    title: "Biodegradable Poly Bags (Food grade)",
    note: "Price per kg",
    products: [
      { code: "BD-PLY-BG-50", name: "BD-PLY-BG-50", price: 3600, unit: "kg" },
      { code: "BD-PLY-BG-25", name: "BD-PLY-BG-25", price: 3200, unit: "kg" },
      { code: "BD-PLY-BG-2", name: "BD-PLY-BG-2", price: 2500, unit: "kg" },
      { code: "BD-PLY-BG-1", name: "BD-PLY-BG-1", price: 2200, unit: "kg" },
    ],
  },
  {
    id: "biodeg-seedling",
    title: "Biodegradable Seedling PolyPots",
    note: "Price per kg",
    products: [
      { code: "BP-SD-PPT-1", name: "BP-SD-PPT-1", price: 2200, unit: "kg" },
      { code: "BP-SD-PPT-2", name: "BP-SD-PPT-2", price: 2100, unit: "kg" },
      { code: "BP-SD-PPT-3", name: "BP-SD-PPT-3", price: 2000, unit: "kg" },
      { code: "BP-SD-PPT-4", name: "BP-SD-PPT-4", price: 1900, unit: "kg" },
      { code: "BP-SD-PPT-5", name: "BP-SD-PPT-5", price: 1800, unit: "kg" },
    ],
  },
  {
    id: "biodeg-grafting",
    title: "Biodegradable Grafting Polythene",
    note: "Single Layer • per kg",
    products: [
      { code: "BD-GP-1", name: "BD-GP-1 (Single Layer)", price: 1000, unit: "kg" },
      { code: "BD-GP-2", name: "BD-GP-2 (Single Layer)", price: 7500, unit: "kg" },
    ],
  },
];

const fmt = (n: number) => `${n.toLocaleString()} RWF`;

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

const Packaging = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState("");
  const [qty, setQty] = useState("1");
  const [packagingType, setPackagingType] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [formInView, setFormInView] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // The bottom bar is only needed while the request form is off screen
  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setFormInView(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const selected = useMemo(() => {
    if (!selectedCode) return null;
    for (const c of categories) {
      const p = c.products.find((x) => x.code === selectedCode);
      if (p) return { ...p, category: c.title };
    }
    return null;
  }, [selectedCode]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => q || activeCategory === "all" || c.id === activeCategory)
      .map((c) => ({
        ...c,
        products: q ? c.products.filter((p) => `${p.code} ${p.name} ${c.title}`.toLowerCase().includes(q)) : c.products,
      }))
      .filter((c) => c.products.length > 0);
  }, [activeCategory, search]);

  const quantity = parseInt(qty) || 0;
  const itemsTotal = selected ? selected.price * quantity : 0;
  const stepQty = (delta: number) => setQty(String(Math.max(1, quantity + delta)));

  const choose = (code: string) => {
    setSelectedCode((cur) => (cur === code ? "" : code));
    setQty("1");
  };

  const pickCategory = (id: string) => {
    setSearch("");
    setActiveCategory(id);
  };

  const customRequest = (type = "") => {
    setSelectedCode("");
    if (type) setPackagingType(type);
    scrollToId("pkg-form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please login first", variant: "destructive" });
      navigate("/login");
      return;
    }
    setLoading(true);
    const description = selected
      ? `${selected.category} — ${selected.name} (${selected.code}) × ${qty} ${selected.unit} @ ${fmt(selected.price)}/${selected.unit} = ${fmt(itemsTotal)}${items ? ` | ${items}` : ""}`
      : items;
    const { error } = await (supabase as any).from("packaging_requests").insert({
      user_id: user.id,
      item_description: description,
      quantity: parseInt(qty) || 1,
      packaging_type: packagingType || (selected?.category ?? ""),
      pickup_date: pickupDate || null,
      full_name: fullName,
      phone,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success!", description: "Your packaging request has been submitted." });
      setItems(""); setQty("1"); setPackagingType(""); setPickupDate(""); setFullName(""); setPhone("");
      setSelectedCode("");
    }
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="container relative grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2">
          <div className="space-y-5 fade-in-up">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("nav.packaging")}</span>
            <h1 className="text-4xl font-display font-bold leading-tight md:text-5xl">Request Packaging</h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Envelopes, bags, sacks, boxes and eco-friendly packaging at official ISOKO prices, prepared and delivered for you.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="hover-glow gap-2" onClick={() => scrollToId("catalogue")}>
                See prices <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => customRequest()}>
                Custom request
              </Button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border shadow-2xl fade-in-up" style={{ animationDelay: "150ms" }}>
            <img src={paperBags} alt="ISOKO paper bags in black, white and kraft" className="aspect-[16/10] w-full object-cover" />
            {/* ISOKO watermark across the photo */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[18%] flex -rotate-12 select-none justify-center font-display text-6xl font-black tracking-[0.35em] text-white/25 mix-blend-overlay sm:text-8xl">
              ISOKO
            </span>
            <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/60 px-2 py-3 text-white backdrop-blur-md sm:inset-x-4 sm:bottom-4 sm:p-4">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/70">How it works</p>
              <PackagingSteps />
            </div>
          </div>
        </div>
      </section>

      {/* Price list */}
      <section id="catalogue" className="scroll-mt-24 py-12 md:py-16">
        <div className="container max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-display font-bold">Price list</h2>
              <p className="text-sm text-muted-foreground">Choose an item to add it to your request.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={search ? "all" : activeCategory} onValueChange={pickCategory}>
                <SelectTrigger aria-label="Category" className="h-10 rounded-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search packaging"
                  placeholder="Search name or code…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-full pl-9 pr-9"
                />
                {search && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="font-semibold">Nothing matches "{search}".</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another word, or send a custom request.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" onClick={() => pickCategory("all")}>Show all</Button>
                <Button onClick={() => customRequest()}>Custom request</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {visible.map((cat) => (
                <div key={cat.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                    <h3 className="font-display text-lg font-bold">{cat.title}</h3>
                    {cat.note && <span className="text-xs text-muted-foreground">{cat.note}</span>}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {cat.products.map((p) => {
                      const isSel = selectedCode === p.code;
                      const showCode = p.name !== p.code;
                      return (
                        <button
                          key={p.code}
                          type="button"
                          aria-pressed={isSel}
                          onClick={() => choose(p.code)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                            isSel ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{p.name}</span>
                            {showCode && <span className="block font-mono text-xs text-muted-foreground">{p.code}</span>}
                          </span>
                          <span className="whitespace-nowrap text-right">
                            <span className="font-bold text-primary">{p.price.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground"> RWF/{p.unit}</span>
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                              isSel ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            )}
                          >
                            {isSel ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Credits the photo licences ask for */}
      <div className="container max-w-6xl pb-8">
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Photo credits</summary>
          <p className="mt-2">Packaging photos from Wikimedia Commons, with the ISOKO brand added:</p>
          <ul className="mt-1 space-y-0.5">
            {PHOTO_CREDITS.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">{c.title}</a> by {c.author}, {c.license}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {/* Request form with the order summary beside it */}
      <section className="border-t border-border bg-card/40 py-12 md:py-16">
        <div id="pkg-form" ref={formRef} className="container grid max-w-6xl scroll-mt-28 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-2xl font-display font-bold md:text-3xl">Your request</h2>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pkg-full-name">Full Name</Label>
                  <Input id="pkg-full-name" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pkg-phone">Phone</Label>
                  <Input id="pkg-phone" type="tel" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="items">{selected ? "Extra notes (optional)" : "What needs packaging?"}</Label>
                <Input
                  id="items"
                  placeholder={selected ? "e.g. print our logo on it" : "e.g., 200 jars of honey"}
                  value={items}
                  onChange={(e) => setItems(e.target.value)}
                  required={!selected}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!selected && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pkg-type">Packaging type</Label>
                    <Input id="pkg-type" placeholder="Kraft / polythene / branded box / basket…" value={packagingType} onChange={(e) => setPackagingType(e.target.value)} />
                  </div>
                )}
                {!selected && (
                  <div className="space-y-2">
                    <Label htmlFor="qty-plain">Quantity</Label>
                    <Input id="qty-plain" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="pickup-date">Pickup / delivery date</Label>
                  <Input id="pickup-date" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
                </div>
              </div>
              <Button className="w-full gap-2 hover-glow" size="lg" disabled={loading}>
                {loading ? "Submitting..." : <>Submit Request <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> We call you to confirm the price and date before anything is prepared.
              </p>
            </form>
          </div>

          <aside className="rounded-3xl border border-border bg-card p-6 lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your order</p>
            {selected ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{selected.category}</p>
                    <p className="font-semibold">{selected.name}</p>
                  </div>
                  <button type="button" aria-label="Remove item" onClick={() => setSelectedCode("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="qty" className="text-sm">Quantity ({selected.unit})</Label>
                  <div className="flex items-center rounded-xl border border-border">
                    <button type="button" aria-label="Less" onClick={() => stepQty(-1)} className="flex h-9 w-9 items-center justify-center hover:text-primary">
                      <Minus className="h-4 w-4" />
                    </button>
                    <Input
                      id="qty"
                      type="number"
                      min="1"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="h-9 w-16 border-0 text-center shadow-none focus-visible:ring-0"
                    />
                    <button type="button" aria-label="More" onClick={() => stepQty(1)} className="flex h-9 w-9 items-center justify-center hover:text-primary">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-4">
                  <span className="text-sm text-muted-foreground">{fmt(selected.price)} / {selected.unit}</span>
                  <span className="text-2xl font-display font-bold text-primary">{fmt(itemsTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">No item chosen. Describe what you need, or pick one from the price list.</p>
                <Button variant="outline" className="w-full" onClick={() => scrollToId("catalogue")}>
                  See prices
                </Button>
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* The picked item stays in reach until the form is on screen */}
      {selected && !formInView && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 fade-in-up">
          <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-primary/40 bg-card/95 p-3 pl-4 shadow-2xl backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {qty} {selected.unit} · <span className="font-semibold text-primary">{fmt(itemsTotal)}</span>
              </p>
            </div>
            <Button className="shrink-0 gap-1.5" onClick={() => scrollToId("pkg-form")}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Packaging;
