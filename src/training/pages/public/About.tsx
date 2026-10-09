import { Handshake, Hammer, HeartHandshake, Lightbulb, Target, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { goldButton, PublicHero } from "@/training/features/public/shared";

const PRACTICAL = [
  { icon: Hammer, title: "Hands-on from day one", text: "Most class time is spent building, designing and practising, not listening to lectures." },
  { icon: Users, title: "Trainers from industry", text: "Our trainers work as developers, designers and marketers, and teach what they use every day." },
  { icon: Target, title: "Small classes", text: "Limited seats per intake so every student gets attention and feedback." },
];

const VALUES = [
  { icon: HeartHandshake, title: "Respect", text: "Every learner is welcome, whatever their starting point." },
  { icon: Lightbulb, title: "Practical excellence", text: "We measure success by what our students can do." },
  { icon: Handshake, title: "Integrity", text: "Honest advice, clear fees and certificates anyone can verify." },
];

export default function About() {
  return (
    <>
      <PublicHero eyebrow="About us" title="Skills that open doors">
        Isoko Training Center helps young people and professionals around the world gain practical, job-ready skills in technology, design and business.
      </PublicHero>
      <div className="container space-y-14 py-12">
        <section className="max-w-3xl">
          <h2 className="text-2xl font-bold">Our mission</h2>
          <p className="mt-3 text-muted-foreground">
            To turn ambition into employable skills. We run focused programs in regular intakes, so learners can start soon, learn in a supportive group,
            and finish with work they can show and a certificate employers trust.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold">What makes Isoko practical</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {PRACTICAL.map((p) => (
              <div key={p.title} className="rounded-xl border bg-card p-5 shadow-sm">
                <p.icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Our values</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {VALUES.map((v) => (
              <div key={v.title} className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold">
                  <v.icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h3 className="font-semibold">{v.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{v.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className={goldButton}><Link to="/training-center/intakes">See available intakes</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/training-center/contact">Contact us</Link></Button>
        </div>
      </div>
    </>
  );
}
