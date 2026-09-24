import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";
import {
  Truck,
  Box,
  ShoppingCart,
  Network,
  ArrowRight,
  MapPin,
  Clock,
  UserCheck,
  Route as RouteIcon,
  FileText,
  Wallet,
  ShieldCheck,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteMap, { TruckMarker } from "@/components/motion/RouteMap";
import { FlowSteps } from "@/components/motion";
import { CheckCircle2, ClipboardList, PackageCheck } from "lucide-react";

const quickServices = [
  {
    to: "/logistics/delivery",
    icon: Truck,
    title: "Logistics",
    desc: "Transport, live tracking, route optimization, driver assignment.",
  },
  {
    to: "/logistics/packaging",
    icon: Box,
    title: "Packaging",
    desc: "Kraft, polythene & branded packaging with auto pricing.",
  },
  {
    to: "/logistics/sourcing",
    icon: ShoppingCart,
    title: "Sourcing & Procurement",
    desc: "We source goods locally and internationally on your behalf.",
  },
  {
    to: "/logistics/supply-chain",
    icon: Network,
    title: "Supply Chain",
    desc: "Bonded/non-bonded shipments, customs, taxes & multi-stage tracking.",
  },
];

const logisticsFeatures = [
  { icon: MapPin, label: "Live shipment tracking" },
  { icon: RouteIcon, label: "Route optimization" },
  { icon: Clock, label: "Delivery time estimation" },
  { icon: UserCheck, label: "Driver assignment system" },
];

const supplyChainFeatures = [
  { icon: MapPin, label: "Real-time shipment map" },
  { icon: ShieldCheck, label: "Customs clearance tracking" },
  { icon: Wallet, label: "Cost breakdown (tax + transport)" },
  { icon: Package, label: "Multi-stage delivery tracking" },
];

const Logistics = () => {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="container relative grid items-center gap-10 py-20 md:py-28 lg:grid-cols-[1.1fr_1fr]">
          <div className="max-w-3xl space-y-6 animate-slide-up">
            <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-primary">
              ISOKO Logistics
            </span>
            <h1 className="text-4xl md:text-6xl font-display font-bold leading-tight">
              Fast, Reliable Logistics &{" "}
              <span className="text-gradient">Smart Packaging</span> Solutions
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              From sourcing to delivery — we handle everything. Transport,
              packaging, procurement, and full supply-chain management across
              Rwanda and beyond.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="hover-glow">
                <Link to="/logistics/delivery">Request Service</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/track">Track Shipment</Link>
              </Button>
            </div>
          </div>

          {/* How a delivery moves: request, pickup, route, delivered */}
          <div className="rounded-3xl border bg-card/80 p-6 shadow-lg backdrop-blur fade-in-up" style={{ animationDelay: "150ms" }}>
            <RouteMap
              stops={[
                { label: "Your address", x: 40, y: 130 },
                { label: "Isoko hub", x: 170, y: 52 },
                { label: "Customer", x: 360, y: 110 },
              ]}
              marker={<TruckMarker />}
              road
            />
            <FlowSteps
              className="mt-5"
              steps={[
                { icon: ClipboardList, label: "Request" },
                { icon: PackageCheck, label: "Pickup" },
                { icon: Truck, label: "On the way" },
                { icon: CheckCircle2, label: "Delivered" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Quick Services */}
      <section className="py-16 md:py-20">
        <div className="container">
          <div className="text-center mb-12 space-y-3">
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Our Services
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose the service you need. Every request is tracked end-to-end.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {quickServices.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="group rounded-2xl border border-border bg-card p-6 hover-lift transition-all hover:border-primary"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-lg font-display font-bold mb-1">
                  {s.title}
                </h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Logistics module */}
      <section className="py-16 bg-card/40 border-y border-border">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Logistics Module
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Move anything, anywhere — with full visibility
            </h2>
            <p className="text-muted-foreground">
              Sourcing, procurement and transport management in one place. Every
              shipment gets a tracking number, an assigned driver, and a live
              status: Pending, In Transit or Delivered.
            </p>
            <Button asChild>
              <Link to="/logistics/delivery">Request Delivery</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {logisticsFeatures.map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-border bg-background p-5 hover-lift"
              >
                <f.icon className="h-6 w-6 text-primary mb-3" />
                <p className="font-semibold text-sm">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packaging module */}
      <section className="py-16">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div className="grid grid-cols-3 gap-3 order-2 md:order-1">
            {[
              { t: "Kraft Paper", c: "bg-amber-700/20 text-amber-600" },
              { t: "Polythene", c: "bg-zinc-500/20 text-zinc-400" },
              { t: "Branded", c: "bg-primary/10 text-primary" },
              { t: "Small", c: "bg-secondary text-foreground" },
              { t: "Medium", c: "bg-secondary text-foreground" },
              { t: "Large", c: "bg-secondary text-foreground" },
              { t: "Brown", c: "bg-amber-800/30 text-amber-700" },
              { t: "Black", c: "bg-zinc-900 text-zinc-100 border border-border" },
              { t: "White", c: "bg-zinc-100 text-zinc-900" },
            ].map((b) => (
              <div
                key={b.t}
                className={`rounded-xl p-5 text-center font-semibold text-sm ${b.c}`}
              >
                {b.t}
              </div>
            ))}
          </div>
          <div className="space-y-5 order-1 md:order-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Packaging Module
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Smart packaging with automatic pricing
            </h2>
            <p className="text-muted-foreground">
              Pick a type, size and color — we calculate the price instantly.
              Bulk discounts and custom branding (logo printing) available.
            </p>
            <Button asChild>
              <Link to="/logistics/packaging">Order Packaging</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Supply chain module */}
      <section className="py-16 bg-card/40 border-y border-border">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Supply Chain Management
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Origin to destination — with customs handled
            </h2>
            <p className="text-muted-foreground">
              Bonded and non-bonded shipments. Tax types supported: CO2, WO1,
              WO2 and CIF. Get a clear cost breakdown before you commit.
            </p>
            <Button asChild>
              <Link to="/logistics/supply-chain">Start Supply Chain Request</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {supplyChainFeatures.map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-border bg-background p-5 hover-lift"
              >
                <f.icon className="h-6 w-6 text-primary mb-3" />
                <p className="font-semibold text-sm">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Documentation strip */}
      <section className="py-16">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-4">
            <FileText className="h-10 w-10 text-primary" />
            <h2 className="text-3xl font-display font-bold">
              Full documentation, digitally
            </h2>
            <p className="text-muted-foreground">
              Exit notes, invoices, loading permits, weight bridge slips,
              payment vouchers, driver licenses and plate numbers — all uploaded,
              auto-filled, and downloadable as receipts.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Logistics;
