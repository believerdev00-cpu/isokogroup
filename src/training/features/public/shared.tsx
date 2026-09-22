import type { ReactNode } from "react";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { SeatsMeter, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { formatDuration, formatLongDate, formatMoney } from "@/training/lib/format";
import type { Program, PublicIntake, PublicOffering } from "@/training/lib/types";
import { cn } from "@/lib/utils";

export const applyLink = (intakeSlug: string, intakeProgramId?: string) =>
  `/training-center/apply?intake=${encodeURIComponent(intakeSlug)}${intakeProgramId ? `&program=${intakeProgramId}` : ""}`;

export const goldButton = "bg-gold text-gold-foreground hover:bg-gold/90";

/** Page title band used at the top of public pages. */
export function PublicHero({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b bg-secondary/60">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/15 blur-2xl" />
      <div className="container relative py-10 sm:py-14">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-extrabold text-primary sm:text-4xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-muted-foreground">{children}</div>}
      </div>
    </section>
  );
}

export function ProgramCard({ program, currency }: { program: Program; currency: string }) {
  return (
    <Link
      to={`/training-center/programs/${program.slug}`}
      className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/30"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-gold">{program.category}</p>
      <h3 className="mt-1 text-lg font-bold group-hover:text-primary">{program.name}</h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{program.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" aria-hidden />{formatDuration(program.duration_value, program.duration_unit)}</span>
        <span className="font-semibold">{formatMoney(program.tuition_fee, currency)}</span>
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        View program <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export function OfferingCard({ offering, intakeSlug, currency }: { offering: PublicOffering; intakeSlug: string; currency: string }) {
  return (
    <div className={cn("flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm", offering.is_full && "bg-muted/40")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">{offering.category}</p>
          <h3 className="mt-1 text-lg font-bold">{offering.name}</h3>
        </div>
        {offering.is_full && <StatusBadge status="full" label="FULL" />}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatDuration(offering.duration_value, offering.duration_unit)}
        {offering.schedule && ` · ${offering.schedule}`}
      </p>
      <div className="mt-4">
        <p className="mb-1 text-sm text-muted-foreground">{offering.capacity} seats</p>
        <SeatsMeter enrolled={offering.enrolled} capacity={offering.capacity} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Tuition</dt>
          <dd className="font-semibold">{formatMoney(offering.tuition_fee, currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Registration</dt>
          <dd className="font-semibold">{formatMoney(offering.registration_fee, currency)}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-1 items-end">
        {offering.is_full ? (
          <p className="text-sm font-medium text-muted-foreground">This program is full for this intake.</p>
        ) : (
          <Button asChild className={cn("w-full", goldButton)}>
            <Link to={applyLink(intakeSlug, offering.intake_program_id)}>Apply Now</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function IntakeFacts({ intake }: { intake: PublicIntake }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div className="flex gap-2">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div>
          <dt className="text-xs text-muted-foreground">Training starts</dt>
          <dd className="font-semibold">{formatLongDate(intake.training_starts_on)}</dd>
        </div>
      </div>
      <div className="flex gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <div>
          <dt className="text-xs text-muted-foreground">Application deadline</dt>
          <dd className="font-semibold">{formatLongDate(intake.application_closes_on)}</dd>
        </div>
      </div>
      {intake.location && (
        <div className="flex gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <dt className="text-xs text-muted-foreground">Location</dt>
            <dd className="font-semibold">{intake.location}</dd>
          </div>
        </div>
      )}
    </dl>
  );
}
