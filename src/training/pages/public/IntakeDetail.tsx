import { CalendarClock, CalendarX } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, Loading, StatusBadge } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { IntakeFacts, OfferingCard, PublicHero } from "@/training/features/public/shared";
import { ApiError } from "@/training/lib/api";
import { formatLongDate } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { PublicIntake } from "@/training/lib/types";

/**
 * One intake, on its own page. This is where the website's intake band and the
 * intake list send people: everything about the intake and its programs, with
 * Apply Now on each program that is still taking applications. An intake that is
 * published but has not opened yet says when it opens instead.
 */
export default function IntakeDetail() {
  const { slug } = useParams();
  const currency = useCenter().data?.currency ?? "RWF";
  const intake = useApi<PublicIntake>(slug ? `/public/intakes/${encodeURIComponent(slug)}` : null);

  if (intake.isLoading) return <Loading label="Loading the intake…" />;

  if (intake.error || !intake.data) {
    const gone = intake.error instanceof ApiError && intake.error.status === 404;
    return (
      <div className="container py-16">
        <EmptyState
          icon={CalendarX}
          title={gone ? "This intake is not taking applications" : "The intake could not be loaded"}
          description={
            gone
              ? "It may have closed, filled up, or been taken off the site. These intakes are open right now."
              : "Please check your connection and try again."
          }
          action={
            <Button asChild variant="outline">
              <Link to="/training-center/intakes">See the open intakes</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const i = intake.data;
  const open = i.applications_open !== false;
  const bookable = i.programs.filter((p) => !p.is_full);

  return (
    <>
      <PublicHero eyebrow={open ? "Apply now" : "Coming soon"} title={i.name}>
        {i.description || (open ? "This intake is accepting applications." : "This intake is not open for applications yet.")}
      </PublicHero>
      <div className="container space-y-8 py-10">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              status={open ? "open" : "upcoming"}
              label={open ? "Applications Open" : "Coming Soon"}
            />
            <span className="text-sm text-muted-foreground">
              {i.programs.length} program{i.programs.length === 1 ? "" : "s"}
            </span>
          </div>
          {!open && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                Applications open on <b>{formatLongDate(i.application_opens_on)}</b> and close on{" "}
                <b>{formatLongDate(i.application_closes_on)}</b>. Come back then, or ask us to tell you when it opens.
              </span>
            </p>
          )}
          <div className="mt-4">
            <IntakeFacts intake={i} />
          </div>
        </div>

        <section aria-labelledby="intake-programs" className="space-y-4">
          <h2 id="intake-programs" className="text-xl font-bold">
            {open ? "Choose a program and apply" : "What this intake will offer"}
          </h2>
          {i.programs.length === 0 ? (
            <EmptyState title="The programs for this intake are being set up" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {i.programs.map((o) => (
                <OfferingCard
                  key={o.intake_program_id}
                  offering={o}
                  intakeSlug={i.slug}
                  currency={currency}
                  opensOn={open ? undefined : i.application_opens_on}
                />
              ))}
            </div>
          )}
          {open && bookable.length === 0 && (
            <p className="text-sm text-muted-foreground">Every program in this intake is full. Contact us about the next one.</p>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/training-center/intakes">All open intakes</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/training-center/contact">Ask a question</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
