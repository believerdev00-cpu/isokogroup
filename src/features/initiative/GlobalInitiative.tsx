import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/lib/seo";
import {
  DONATIONS_OPEN, FOCUS_AREAS, MIN_DONATION_RWF, classificationLabel, rwf,
} from "@/lib/initiative";
import { INITIATIVE, INITIATIVE_NAME, TAGLINE, useImpact, usePublicProjects, type PublicProject } from "./api";
import DonateDialog from "./DonateDialog";
import {
  AlertCircle, ArrowRight, Briefcase, FlaskConical, GraduationCap, HeartHandshake, Info, Mail, Palette, Phone, Sprout,
} from "lucide-react";

const AREA_ICONS: Record<string, typeof Briefcase> = {
  entrepreneurship: Briefcase,
  arts: Palette,
  agriculture: Sprout,
  unemployment_reduction: GraduationCap,
  research: FlaskConical,
};

const STEPS = [
  {
    step: "01",
    title: "You contribute",
    desc: `Contributions start at ${rwf(MIN_DONATION_RWF)} and are made to ISOKO GROUP's own Mobile Money or bank account. You then send us the transaction reference.`,
  },
  {
    step: "02",
    title: "Contributions are pooled",
    desc: "Small contributions are gathered together and directed to one approved project within one of the five focus areas.",
  },
  {
    step: "03",
    title: "The project is delivered",
    desc: "ISOKO GROUP runs the project with its own team, then records what it achieved and who verified it.",
  },
];

/** Shown where real records will appear. Nothing is invented to fill a section. */
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
    <Info className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
    <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">{children}</p>
  </div>
);

/**
 * Shown when we could not read the records at all. "None" and "we don't know"
 * are different answers, and a section that failed to load must never be able
 * to pass for one that is genuinely empty.
 */
const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
    <AlertCircle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
    <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
      We couldn&apos;t load this information. Please try again.
    </p>
    <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
  </div>
);

const ProjectCard = ({ p }: { p: PublicProject }) => {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-2 p-6">
        <p className="text-xs text-muted-foreground">{classificationLabel(p)}</p>
        <h3 className="text-lg font-semibold">{p.title}</h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {p.completion_summary || p.description}
        </p>
        {/* No figures here, by design: neither what has been collected nor what
            is wanted. A target invites someone to measure their gift against it,
            and a project shown as fully funded tells people to stop giving.
            Contributions are not capped. */}
        <p className="pt-2 text-sm text-muted-foreground">{p.location}</p>
      </div>
    </div>
  );
};

/** The public face of the Global Initiative. Every figure comes from a record. */
export default function GlobalInitiative() {
  useSeo({
    title: `${INITIATIVE_NAME}: ${TAGLINE}`,
    description:
      "Small contributions, pooled together, help fund one real project at a time across entrepreneurship, arts, agriculture, unemployment reduction and research.",
    canonical: INITIATIVE,
  });

  const [donateOpen, setDonateOpen] = useState(false);
  const seeking = usePublicProjects("seeking_support");
  const completed = usePublicProjects("completed");
  const impact = useImpact();
  // Only a reading that actually arrived can say the initiative has nothing to
  // show yet. A failed query says nothing at all, and is handled on its own.
  const nothingYet = !!impact.data && impact.data.published === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Introduction */}
        <section className="border-b border-border bg-gradient-to-br from-background via-background to-card">
          <div className="container py-20 md:py-28">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" /> {INITIATIVE_NAME}
              </div>
              <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
                <span className="text-primary">$1</span> — One Project
              </h1>
              <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
                &quot;$1 — One Project&quot; is our campaign idea: small contributions, pooled together,
                help fund one real project at a time across five focus areas — entrepreneurship, arts,
                agriculture, unemployment reduction and research. Contributions are made and recorded
                in Rwandan Francs.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to={`${INITIATIVE}/apply`}>
                  <Button size="lg" className="gap-2">
                    <HeartHandshake className="h-4 w-4" /> Apply for project support
                  </Button>
                </Link>
                <a href="#focus-areas">
                  <Button size="lg" variant="outline">Explore the five focus areas</Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 md:py-20">
          <div className="container">
            <div className="mb-12 space-y-3 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">From small contributions to one project</h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEPS.map(({ step, title, desc }) => (
                <div key={step} className="rounded-xl border border-border bg-card p-6">
                  <p className="mb-3 font-display text-3xl font-bold text-primary">{step}</p>
                  <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The five focus areas */}
        <section id="focus-areas" className="scroll-mt-20 border-y border-border bg-muted/40 py-16 md:py-20">
          <div className="container">
            <div className="mb-12 space-y-3 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Where support goes</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">The five focus areas</h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">Every funded project belongs to one of these areas.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FOCUS_AREAS.map((area) => {
                const Icon = AREA_ICONS[area.key] ?? Briefcase;
                return (
                  <div key={area.key} className="rounded-xl border border-border bg-card p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-3 text-lg font-semibold">{area.label}</h3>
                    <ul className="space-y-1.5">
                      {area.subcategories.map((sub) => (
                        <li key={sub.key} className="text-sm text-muted-foreground">
                          <span className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            {sub.label}
                          </span>
                          {sub.items && (
                            <ul className="ml-4 mt-1 space-y-1">
                              {sub.items.map((it) => (
                                <li key={it.key} className="flex items-start gap-2 text-xs">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                                  {it.label}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Projects seeking support */}
        <section className="py-16 md:py-20">
          <div className="container">
            <div className="mb-10 space-y-3 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Open for support</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">Projects seeking support</h2>
            </div>
            {seeking.isLoading ? (
              <Empty>Loading…</Empty>
            ) : seeking.isError ? (
              <LoadFailed onRetry={() => seeking.refetch()} />
            ) : seeking.data && seeking.data.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {seeking.data.map((p) => <ProjectCard key={p.id} p={p} />)}
              </div>
            ) : (
              <Empty>No projects are currently seeking support.</Empty>
            )}
          </div>
        </section>

        {/* Completed projects */}
        <section className="border-y border-border bg-muted/40 py-16 md:py-20">
          <div className="container">
            <div className="mb-10 space-y-3 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Our record</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">Completed projects</h2>
            </div>
            {completed.isLoading ? (
              <Empty>Loading…</Empty>
            ) : completed.isError ? (
              <LoadFailed onRetry={() => completed.refetch()} />
            ) : completed.data && completed.data.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {completed.data.map((p) => <ProjectCard key={p.id} p={p} />)}
              </div>
            ) : (
              <Empty>No Global Initiative projects have been completed yet.</Empty>
            )}
          </div>
        </section>

        {/* Impact, counted from the records */}
        <section className="py-16 md:py-20">
          <div className="container">
            <div className="mb-10 space-y-3 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Impact</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">What the initiative has done</h2>
            </div>
            {impact.isLoading ? (
              <Empty>Loading…</Empty>
            ) : impact.isError ? (
              <LoadFailed onRetry={() => impact.refetch()} />
            ) : nothingYet ? (
              <Empty>Impact data will appear here as projects are funded and completed.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                {[
                  { label: "Projects published", value: impact.data?.published ?? 0 },
                  { label: "Projects funded", value: impact.data?.funded ?? 0 },
                  { label: "Projects completed", value: impact.data?.completed ?? 0 },
                  { label: "Areas supported", value: Object.keys(impact.data?.byArea ?? {}).length },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-card p-6 text-center">
                    <p className="font-display text-3xl font-bold text-primary">{s.value}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Contributing */}
        <section id="donate" className="scroll-mt-20 border-y border-border bg-card py-16 md:py-20">
          <div className="container max-w-4xl">
            <div className="mb-10 space-y-3 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Donate</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">
                Contribute from {rwf(MIN_DONATION_RWF)}
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Contributions are made in Rwandan Francs to ISOKO GROUP&apos;s own Mobile Money and bank
                accounts. You pay us directly and send the transaction reference, and we match it against
                our records before it counts towards a project.
              </p>
            </div>

            <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-border bg-background p-6 text-center md:p-8">
              {DONATIONS_OPEN ? (
                <Button
                  size="lg"
                  className="h-auto w-full whitespace-normal py-4 text-base font-bold uppercase leading-snug tracking-wide"
                  onClick={() => setDonateOpen(true)}
                >
                  <HeartHandshake className="h-5 w-5" />
                  Donate with ISOKO Groups Company
                </Button>
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Contributions are paused for the moment. Nothing is being collected, and nobody is
                  being asked to send money.
                </p>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground">
                No card details are ever asked for, and nothing is taken from you on this website. A
                contribution waits to be confirmed until a person has checked it against the statement,
                so no figure on this page is one we have not verified.
              </p>
              <p className="text-sm text-muted-foreground">
                Need support for your own project instead?{" "}
                <Link to={`${INITIATIVE}/apply`} className="text-primary hover:underline">
                  Apply for project support
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Applying */}
        <section className="py-16 md:py-20">
          <div className="container max-w-4xl space-y-8 text-center">
            <div className="space-y-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">Apply for support</span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">Have a project in one of the five areas?</h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Tell us about it. Choose your focus area, describe what you want to achieve and what
                support you need, and our team will review it and come back to you.
              </p>
              <div className="pt-2">
                <Link to={`${INITIATIVE}/apply`}>
                  <Button size="lg" className="gap-2">Apply for project support <ArrowRight className="h-4 w-4" /></Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 text-left sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border bg-card p-6">
                <Mail className="h-5 w-5 text-primary" />
                <p className="font-semibold">Email</p>
                <a href="mailto:isokogrou93@gmail.com" className="break-all text-sm text-muted-foreground hover:text-primary">
                  isokogrou93@gmail.com
                </a>
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-card p-6">
                <Phone className="h-5 w-5 text-primary" />
                <p className="font-semibold">Phone</p>
                <div className="flex flex-col text-sm text-muted-foreground">
                  <a href="tel:+250788481648" className="hover:text-primary">0788 481 648</a>
                  <a href="tel:+250793736574" className="hover:text-primary">0793 736 574</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />
    </div>
  );
}
