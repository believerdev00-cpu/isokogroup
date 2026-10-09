import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AdvertiseDialog from "@/features/adverts/AdvertiseDialog";

/**
 * "Advertise here", directly under the partners.
 *
 * It drifts sideways the same way the partner logos do, and for the same
 * reasons: the row is listed twice so the loop never jumps, it stops on hover
 * and on keyboard focus so nothing moves while it is being read, and
 * .motion-lite stands it still for anyone who asked for less movement.
 *
 * The whole band is one button. A marquee that cannot be clicked is an
 * advertisement for nothing.
 */
const INVITATIONS = [
  "Advertise here",
  "Reach buyers across Rwanda",
  "Put your brand on ISOKO GROUP",
  "Homepage · Marketplace · Banners",
  "Advertise here",
  "Talk to our team about placements",
];

export default function AdvertiseStrip({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  const row = (hidden = false) => (
    <ul className="advertise-row flex shrink-0 items-center gap-10 pr-10 sm:gap-16 sm:pr-16" aria-hidden={hidden || undefined}>
      {INVITATIONS.map((text, i) => (
        <li key={`${text}-${i}`} className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <Megaphone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-[0.14em] text-white sm:text-base">{text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className={cn("pb-14 md:pb-20", className)} aria-labelledby="advertise-title">
      <div className="container">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your brand here</p>
          <h2 id="advertise-title" className="mt-2 font-display text-2xl font-bold md:text-3xl">Advertise with us</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Reach the people who already come to ISOKO GROUP. Tell us what you want to advertise and
            our team will come back to you with placements and pricing.
          </p>
        </div>
      </div>

      {/* The band, cut the same way as the partners band above it */}
      <div className="bg-[#0b1530] px-3 py-6 sm:px-6 [clip-path:polygon(0_0,100%_0,98.5%_50%,100%_100%,0_100%,1.5%_50%)] sm:[clip-path:polygon(0_0,100%_0,99%_50%,100%_100%,0_100%,1%_50%)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Advertise with ISOKO GROUP: open the advertising request form"
          className="advertise-strip group mx-auto block w-full max-w-6xl overflow-hidden rounded-md border border-white/10 bg-white/5 py-4 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="advertise-track flex w-max">
            {row()}
            {row(true)}
          </div>
        </button>

        <div className="mx-auto mt-5 flex max-w-6xl justify-center">
          <Button type="button" size="lg" className="gap-2 font-semibold" onClick={() => setOpen(true)}>
            <Megaphone className="h-5 w-5" />
            Advertise Here
          </Button>
        </div>
      </div>

      <AdvertiseDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
