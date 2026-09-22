import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Code, Smartphone, Palette, Wrench, Layout, ArrowRight, CheckCircle2 } from "lucide-react";

const services = [
  { icon: Layout, title: "Web Design", desc: "Beautiful, conversion-focused designs tailored to your brand." },
  { icon: Code, title: "Web Development", desc: "Fast, scalable, modern websites and web apps." },
  { icon: Smartphone, title: "Mobile App Development", desc: "Native-feeling iOS & Android apps." },
  { icon: Palette, title: "UI/UX Design", desc: "Research-driven interfaces users love." },
  { icon: Wrench, title: "Maintenance", desc: "Updates, monitoring, and ongoing support." },
];

const steps = [
  "Submit booking request",
  "We review your project",
  "Consultation meeting (online or physical)",
  "Agreement on price & timeline",
  "Client pays 50% upfront",
  "Project development starts",
  "Final delivery",
  "Client pays remaining 50%",
];

const Software = () => {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative py-20 md:py-28 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="container text-center max-w-3xl mx-auto space-y-6">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">Isoko Software</span>
          <h1 className="text-4xl md:text-6xl font-display font-bold leading-tight">
            Build Your Dream Website or App With Us
          </h1>
          <p className="text-lg text-muted-foreground">
            Book a consultation — we turn ideas into shipped products.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/software/booking">
              <Button size="lg" className="gap-2">Book a Consultation <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16">
        <div className="container">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-display font-bold">Our Services</h2>
            <p className="text-muted-foreground mt-2">Pick the service that fits your project.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((s) => (
              <div key={s.title} className="rounded-xl border border-border bg-card p-6 hover-lift">
                <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{s.desc}</p>
                <Link to={`/software/booking?service=${encodeURIComponent(s.title)}`}>
                  <Button size="sm" variant="outline" className="gap-1">Request Service <ArrowRight className="h-3 w-3" /></Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-muted/30">
        <div className="container max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-display font-bold">How It Works</h2>
            <p className="text-muted-foreground mt-2">A simple, transparent flow from idea to delivery.</p>
          </div>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <p className="text-sm md:text-base font-medium pt-1">{step}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 p-6 rounded-xl border border-primary/30 bg-primary/5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Payment Policy</h4>
                <p className="text-sm text-muted-foreground">
                  Consultation is <strong>free</strong>. After agreement, <strong>50% is required to start</strong> and the
                  remaining <strong>50% is paid at completion</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link to="/software/booking">
              <Button size="lg" className="gap-2">Get Started <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Software;
