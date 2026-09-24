import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, MapPin, Clock, Calculator, ArrowLeft, History } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
// Isoko-branded trucks; the "left" images face left for the reverse lanes
import truck1 from "@/assets/truck-1-isoko.png";
import truck1Left from "@/assets/truck-1-left-isoko.png";
import truck2Left from "@/assets/truck-2-left-isoko.png";
import truck3 from "@/assets/truck-3-isoko.png";

const features = [
  { icon: Truck, title: "logistics.requestDelivery", desc: "Submit delivery requests with pickup and drop-off details." },
  { icon: MapPin, title: "logistics.realTimeTracking", desc: "Track your shipments live on an interactive map." },
  { icon: Calculator, title: "logistics.pricingCalculator", desc: "Our team will contact you with a tailored quote." },
  { icon: Clock, title: "logistics.orderHistory", desc: "View all your past and ongoing deliveries in one place." },
];

const LogisticsDelivery = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [itemType, setItemType] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please login first", variant: "destructive" });
      navigate("/login");
      return;
    }
    setLoading(true);
    const { error } = await (supabase as any).from("logistics_requests").insert({
      user_id: user.id,
      pickup,
      dropoff,
      weight: weight ? parseFloat(weight) : 0,
      preferred_date: date || null,
      full_name: fullName,
      phone,
      item_type: itemType,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success!", description: "Your delivery request has been submitted. Our team will contact you with a quote." });
      setPickup(""); setDropoff(""); setWeight(""); setDate("");
      setFullName(""); setPhone(""); setItemType("");
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="relative py-20 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-30 dark:opacity-20">
          <img src={truck1} alt="" loading="lazy" className="absolute top-[8%] left-0 h-20 md:h-28 w-auto animate-truck-slide" style={{ animationDelay: "0s" }} />
          <img src={truck2Left} alt="" loading="lazy" className="absolute top-[35%] left-0 h-24 md:h-32 w-auto animate-truck-slide-reverse" style={{ animationDelay: "-6s" }} />
          <img src={truck3} alt="" loading="lazy" className="absolute top-[62%] left-0 h-20 md:h-28 w-auto animate-truck-slide" style={{ animationDelay: "-12s", animationDuration: "22s" }} />
          <img src={truck1Left} alt="" loading="lazy" className="absolute top-[85%] left-0 h-16 md:h-24 w-auto animate-truck-slide-reverse" style={{ animationDelay: "-3s", animationDuration: "28s" }} />
        </div>
        <div className="container relative z-10">
          <div className="flex items-center justify-between mb-6">
            <Link to="/logistics" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" /> Back to Logistics
            </Link>
            <Link to="/logistics/history" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              <History className="h-4 w-4" /> My Requests
            </Link>
          </div>
          <div className="text-center mb-16 space-y-4">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("nav.logistics")}</span>
            <h1 className="text-4xl md:text-5xl font-display font-bold">{t("logistics.title")}</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Submit a delivery request below — our team will contact you to confirm the price based on distance, weight and item type.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 hover-lift text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold mb-2">{t(f.title)}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="max-w-xl mx-auto rounded-xl border border-border bg-card p-8">
            <h2 className="text-2xl font-display font-bold mb-2 text-center">{t("logistics.requestTitle")}</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              No fixed price — our team will get back to you with a quote.
            </p>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full Name</Label>
                  <Input id="full-name" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pickup">{t("logistics.pickup")}</Label>
                <Input id="pickup" placeholder="Enter pickup address" value={pickup} onChange={(e) => setPickup(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dropoff">{t("logistics.dropoff")}</Label>
                <Input id="dropoff" placeholder="Enter drop-off address" value={dropoff} onChange={(e) => setDropoff(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-type">Type of Item</Label>
                <Input
                  id="item-type"
                  placeholder="e.g., Furniture, Electronics, Food, Documents"
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">{t("logistics.weight")}</Label>
                  <Input id="weight" type="number" placeholder="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">{t("logistics.date")}</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? "Submitting..." : t("logistics.submitRequest")}
              </Button>
            </form>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default LogisticsDelivery;
