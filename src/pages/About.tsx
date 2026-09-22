import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Truck,
  Package,
  ShoppingBag,
  BookOpen,
  Film,
  Code2,
  Target,
  Eye,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Users,
  MapPin,
  Mail,
  Phone,
  ArrowRight,
} from "lucide-react";
import logo from "@/assets/isoko-logo.jpeg";

const pillars = [
  {
    icon: Truck,
    title: "Logistics",
    desc: "Same-day pickups, deliveries and courier runs across Kigali, with tracking from booking to drop-off.",
  },
  {
    icon: Package,
    title: "Packaging",
    desc: "Branded paper bags (white, brown, black) and protective packaging for shops, salons and restaurants.",
  },
  {
    icon: ShoppingBag,
    title: "Marketplace",
    desc: "A trusted online market where Rwandan buyers and verified sellers meet, with secure orders and payments.",
  },
  {
    icon: BookOpen,
    title: "E-Library",
    desc: "A growing digital library of books, guides and study material for students, professionals and entrepreneurs.",
  },
  {
    icon: Film,
    title: "Entertainment",
    desc: "Original films, shorts and podcasts produced under our Isoko Studioz brand.",
  },
  {
    icon: Code2,
    title: "Software",
    desc: "Custom websites and mobile apps from our in-house tech team, plus the Isoko Training Center.",
  },
];

const values = [
  { icon: ShieldCheck, title: "Trust", desc: "Verified sellers, transparent pricing and confirmed deliveries — every time." },
  { icon: HeartHandshake, title: "Community", desc: "We build for Rwandans first: local sellers, local couriers, local stories." },
  { icon: Sparkles, title: "Quality", desc: "From packaging to film production, we obsess over the details our clients see." },
  { icon: Users, title: "Opportunity", desc: "We open doors for small businesses, students and creators to grow online." },
];

const milestones = [
  { year: "2023", text: "ISOKO GROUP founded in Kigali to unify logistics, commerce and digital services." },
  { year: "2024", text: "Marketplace and E-Library launched, onboarding the first verified sellers and authors." },
  { year: "2025", text: "Isoko Studioz produces its first original films, shorts and podcasts." },
  { year: "2026", text: "Software division and Isoko Training Center added — building apps and training the next generation." },
];

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-background via-background to-card">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-16 left-10 w-72 h-72 rounded-full bg-primary blur-3xl" />
            <div className="absolute bottom-0 right-10 w-96 h-96 rounded-full bg-primary blur-3xl" />
          </div>

          <div className="container relative py-20 md:py-28">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" /> About ISOKO GROUP
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight">
                Six services. <span className="text-primary">One Rwandan group.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                ISOKO GROUP is a Kigali-based company building everyday infrastructure for Rwandans —
                logistics, packaging, an online marketplace, an e-library, entertainment and software —
                under one trusted brand.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to="/marketplace">
                  <Button size="lg" className="gap-2">Explore our services <ArrowRight className="h-4 w-4" /></Button>
                </Link>
                <Link to="/become-seller">
                  <Button size="lg" variant="outline">Become a seller</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Story */}
        <section className="py-16 md:py-20">
          <div className="container grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-5">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Our Story</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">Built in Kigali, for Rwanda.</h2>
              <p className="text-muted-foreground leading-relaxed">
                ISOKO GROUP started with a simple observation: Rwandan customers were juggling separate apps
                and contacts to send a parcel, order a product, find a book or get a website built. We set out
                to bring those services together — operated by one team, from one office in Kimironko, with one
                set of standards.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Today we serve buyers, sellers, students, businesses and creators through six connected
                divisions. Whether you are sending a delivery across town, opening a shop online, reading a
                book, watching an Isoko Studioz production or commissioning a custom app — you are working
                with the same group, and the same promise of reliability.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
              <div className="flex items-center gap-4">
                <img src={logo} alt="ISOKO GROUP logo" className="h-16 w-16 rounded-full object-cover" />
                <div>
                  <p className="font-display text-xl font-bold">ISOKO GROUP Ltd</p>
                  <p className="text-sm text-muted-foreground">Headquartered in Kigali, Rwanda</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-2xl font-bold text-primary">6</p>
                  <p className="text-muted-foreground">Service divisions</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">3</p>
                  <p className="text-muted-foreground">Languages supported</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">100%</p>
                  <p className="text-muted-foreground">Rwandan-owned</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">24/7</p>
                  <p className="text-muted-foreground">Online support</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-16 md:py-20 bg-muted/40 border-y border-border">
          <div className="container grid md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-8 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-display font-bold">Our Mission</h3>
              <p className="text-muted-foreground leading-relaxed">
                To make essential digital and logistics services accessible, affordable and reliable for every
                Rwandan — by combining commerce, knowledge and technology under one trusted group.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-8 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Eye className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-display font-bold">Our Vision</h3>
              <p className="text-muted-foreground leading-relaxed">
                To become the most trusted multi-service platform in East Africa, where buyers, sellers,
                students and creators find everything they need to grow — in one place.
              </p>
            </div>
          </div>
        </section>

        {/* What we do */}
        <section className="py-16 md:py-20">
          <div className="container">
            <div className="text-center mb-12 space-y-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">What we do</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">Six services, one group</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Each division runs independently, but shares the same operations team, customer support and quality standards.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {pillars.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-6 hover-lift">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-16 md:py-20 bg-muted/40 border-y border-border">
          <div className="container">
            <div className="text-center mb-12 space-y-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Our Values</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">What we stand for</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="py-16 md:py-20">
          <div className="container max-w-3xl">
            <div className="text-center mb-12 space-y-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Our Journey</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">From idea to group</h2>
            </div>
            <ol className="relative border-l border-border ml-3 space-y-8">
              {milestones.map((m) => (
                <li key={m.year} className="ml-6">
                  <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-4 ring-background" />
                  <p className="font-display text-xl font-bold text-primary">{m.year}</p>
                  <p className="text-muted-foreground leading-relaxed mt-1">{m.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Contact */}
        <section className="py-16 md:py-20 bg-card border-t border-border">
          <div className="container max-w-4xl text-center space-y-8">
            <div className="space-y-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Get in touch</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">We would love to hear from you</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Visit our office, send an email, or call any of our lines — our team is ready to help.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="rounded-xl border border-border bg-background p-6 space-y-2">
                <MapPin className="h-5 w-5 text-primary" />
                <p className="font-semibold">Office</p>
                <p className="text-sm text-muted-foreground">Kimironko, KG 15 Ave (around the market), Kigali</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-6 space-y-2">
                <Phone className="h-5 w-5 text-primary" />
                <p className="font-semibold">Phone</p>
                <div className="flex flex-col text-sm text-muted-foreground">
                  <a href="tel:+250788481648" className="hover:text-primary">0788 481 648</a>
                  <a href="tel:+250793736574" className="hover:text-primary">0793 736 574</a>
                  <a href="tel:+250790176547" className="hover:text-primary">0790 176 547</a>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-6 space-y-2">
                <Mail className="h-5 w-5 text-primary" />
                <p className="font-semibold">Email</p>
                <a href="mailto:isokogrou93@gmail.com" className="text-sm text-muted-foreground hover:text-primary break-all">
                  isokogrou93@gmail.com
                </a>
              </div>
            </div>

            <div>
              <Link to="/login">
                <Button size="lg" className="gap-2">Join ISOKO GROUP <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
