import { CheckCircle2, Clock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { QueryView, Section } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { applyLink, goldButton, PublicHero } from "@/training/features/public/shared";
import { formatDuration, formatLongDate, formatMoney } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { Program } from "@/training/lib/types";

type Detail = Program & {
  open_intakes: {
    intake_name: string;
    intake_slug: string;
    training_starts_on: string;
    application_closes_on: string;
    intake_program_id: string;
    available_seats: number;
  }[];
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export default function ProgramDetail() {
  const { slug } = useParams();
  const currency = useCenter().data?.currency ?? "RWF";
  const q = useApi<Detail>(`/public/programs/${encodeURIComponent(slug ?? "")}`);

  return (
    <QueryView query={q}>
      {(p) => (
        <>
          <PublicHero eyebrow={p.category} title={p.name}>
            <p>{p.description}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" aria-hidden /> {formatDuration(p.duration_value, p.duration_unit)}
            </p>
          </PublicHero>
          <div className="container grid gap-6 py-10 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {lines(p.course_content).length > 0 && (
                <Section title="What you'll learn">
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {lines(p.course_content).map((l) => (
                      <li key={l} className="flex gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        {l}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {p.requirements && (
                <Section title="Requirements">
                  <p className="whitespace-pre-line text-sm">{p.requirements}</p>
                </Section>
              )}
            </div>
            <div className="space-y-6">
              <Section title="Fees">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tuition</dt><dd className="font-semibold">{formatMoney(p.tuition_fee, currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Registration</dt><dd className="font-semibold">{formatMoney(p.registration_fee, currency)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">Fees for a specific intake may differ; they're shown when you apply.</p>
              </Section>
              <Section title="Open intakes">
                {p.open_intakes.length === 0 ? (
                  <div className="text-sm">
                    <p className="text-muted-foreground">No intake is open for this program right now.</p>
                    <Link to="/training-center/intakes" className="mt-2 inline-block font-semibold text-primary hover:underline">See all available intakes</Link>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {p.open_intakes.map((o) => (
                      <li key={o.intake_program_id} className="rounded-lg border p-3">
                        <p className="font-semibold">{o.intake_name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Starts {formatLongDate(o.training_starts_on)} · Apply by {formatLongDate(o.application_closes_on)}
                        </p>
                        <p className="mt-0.5 text-xs font-medium">
                          {o.available_seats} {o.available_seats === 1 ? "seat" : "seats"} available
                        </p>
                        <Button asChild size="sm" className={`mt-3 w-full ${goldButton}`}>
                          <Link to={applyLink(o.intake_slug, o.intake_program_id)}>Apply Now</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>
        </>
      )}
    </QueryView>
  );
}
