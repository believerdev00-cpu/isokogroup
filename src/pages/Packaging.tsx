import { useState, useMemo } from "react";
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
import paperBags from "@/assets/paper-bags.jpeg";
import { FlowSteps } from "@/components/motion";
import { Palette, Package as PackageBox, ShoppingBasket, Truck as TruckIcon } from "lucide-react";

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

  const selected = useMemo(() => {
    if (!selectedCode) return null;
    for (const c of categories) {
      const p = c.products.find((x) => x.code === selectedCode);
      if (p) return { ...p, category: c.title };
    }
    return null;
  }, [selectedCode]);

  const itemsTotal = selected ? selected.price * (parseInt(qty) || 0) : 0;

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
      <section className="relative py-20 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
          <img src={paperBags} alt="" className="w-full h-full object-cover opacity-20 dark:opacity-10" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
        <div className="container relative z-10">
          <div className="text-center mb-12 space-y-4">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("nav.packaging")}</span>
            <h1 className="text-4xl md:text-5xl font-display font-bold">Request Packaging</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Browse our official price list, pick what you need, and submit your request.
            </p>
            {/* How packaging is prepared, step by step */}
            <FlowSteps
              className="pt-4"
              steps={[
                { icon: ShoppingBasket, label: "Choose" },
                { icon: Palette, label: "Brand" },
                { icon: PackageBox, label: "Pack" },
                { icon: TruckIcon, label: "Deliver" },
              ]}
            />
          </div>

          {/* Price catalogue */}
          <div className="space-y-10 max-w-6xl mx-auto mb-12">
            <div className="text-center space-y-2">
              <h2 className="text-2xl md:text-3xl font-display font-bold">Packaging Price List</h2>
              <p className="text-muted-foreground text-sm">
                Official ISOKO catalogue. Click any item to add it to your request.
              </p>
            </div>
            {categories.map((cat) => (
              <div key={cat.id}>
                <div className="flex items-baseline justify-between mb-3 px-1">
                  <h3 className="text-lg md:text-xl font-display font-bold">{cat.title}</h3>
                  {cat.note && <span className="text-xs text-muted-foreground">{cat.note}</span>}
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Code</th>
                        <th className="text-left px-4 py-2 font-medium">Product</th>
                        <th className="text-right px-4 py-2 font-medium">Selling price</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.products.map((p) => {
                        const isSel = selectedCode === p.code;
                        return (
                          <tr
                            key={p.code}
                            className={`border-t border-border transition-colors ${isSel ? "bg-primary/10" : "hover:bg-muted/30"}`}
                          >
                            <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                            <td className="px-4 py-2">{p.name}</td>
                            <td className="px-4 py-2 text-right font-semibold text-primary whitespace-nowrap">
                              {fmt(p.price)} <span className="text-xs text-muted-foreground font-normal">/ {p.unit}</span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Button
                                size="sm"
                                variant={isSel ? "default" : "outline"}
                                onClick={() => {
                                  setSelectedCode(p.code);
                                  document.getElementById("pkg-form")?.scrollIntoView({ behavior: "smooth" });
                                }}
                              >
                                {isSel ? "Selected" : "Select"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div id="pkg-form" className="max-w-xl mx-auto rounded-xl border border-border bg-card p-8 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold mb-6 text-center">Submit Packaging Request</h2>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {selected && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{selected.category}</p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{selected.name}</p>
                    <span className="font-bold text-primary whitespace-nowrap">
                      {fmt(selected.price)} / {selected.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Label htmlFor="qty" className="text-xs">Qty ({selected.unit})</Label>
                    <Input id="qty" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="h-8 w-24" />
                    <span className="text-sm text-muted-foreground ml-auto">
                      Total: <span className="font-semibold text-foreground">{fmt(itemsTotal)}</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  placeholder={selected ? "Any specific instructions" : "e.g., 200 jars of honey"}
                  value={items}
                  onChange={(e) => setItems(e.target.value)}
                  required={!selected}
                />
              </div>
              {!selected && (
                <div className="space-y-2">
                  <Label htmlFor="pkg-type">Packaging type</Label>
                  <Input id="pkg-type" placeholder="Kraft / polythene / branded box…" value={packagingType} onChange={(e) => setPackagingType(e.target.value)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
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
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Packaging;
