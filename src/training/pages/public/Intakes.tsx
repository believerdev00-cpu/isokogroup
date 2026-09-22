import { CalendarX } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, QueryView, StatusBadge } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { IntakeFacts, OfferingCard, PublicHero } from "@/training/features/public/shared";
import { useApi } from "@/training/lib/query";
import type { PublicIntake } from "@/training/lib/types";

// Shows only what the server says is open: within the application window and with seats left.
export default function Intakes() {
  const currency = useCenter().data?.currency ?? "RWF";
  const intakes = useApi<PublicIntake[]>("/public/intakes");
  return (
    <>
      <PublicHero eyebrow="Apply now" title="Available Intakes">
        These intakes are accepting applications. Choose a program and apply online in a few minutes.
      </PublicHero>
      <div className="container space-y-10 py-10">
        <QueryView query={intakes}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No intakes are open for applications right now"
                description="New intakes open several times a year. Check back soon, or contact us to be told when the next one opens."
                action={
                  <Button asChild variant="outline">
                    <Link to="/training-center/contact">Contact us</Link>
                  </Button>
                }
              />
            ) : (
              list.map((intake) => (
                <section key={intake.id} aria-labelledby={`intake-${intake.id}`} className="space-y-5">
                  <div className="rounded-xl border bg-card p-5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 id={`intake-${intake.id}`} className="text-2xl font-bold">{intake.name}</h2>
                      <StatusBadge status="open" label="Applications Open" />
                    </div>
                    {intake.description && <p className="mt-2 text-sm text-muted-foreground">{intake.description}</p>}
                    <div className="mt-4">
                      <IntakeFacts intake={intake} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {intake.programs.map((o) => (
                      <OfferingCard key={o.intake_program_id} offering={o} intakeSlug={intake.slug} currency={currency} />
                    ))}
                  </div>
                </section>
              ))
            )
          }
        </QueryView>
      </div>
    </>
  );
}
