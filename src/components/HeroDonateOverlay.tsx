import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DONATIONS_OPEN } from "@/lib/initiative";
import DonateDialog from "@/features/initiative/DonateDialog";

/**
 * The way into the Global Initiative from the homepage hero.
 *
 * It is a sibling of the hero, laid over it by the page, so the hero's own
 * markup, its slideshow and its timings are untouched. Two things follow from
 * that and are deliberate:
 *
 * The wrapper takes no pointer events and only the card and the button take
 * them back, so dragging, swiping and the arrow keys still reach the carousel
 * everywhere else.
 *
 * It sits where the hero is actually empty, which is not the same place on
 * every screen. On a wide screen the hero's words stop well short of the right
 * edge, so a card fits there, clear of the slide dots on the left and the photo
 * credit in the corner. On a phone there is no such gap, so it becomes a small
 * button in the top corner instead of covering the slide.
 */
const HeroDonateOverlay = () => {
  const [open, setOpen] = useState(false);

  // Collection can be stopped from one place without a migration and without
  // leaving a button that would only fail. The database is still the real gate:
  // closing this alone does not make the table refuse a donation.
  if (!DONATIONS_OPEN) return null;

  return (
    <>
      <div data-donate-overlay className="pointer-events-none absolute inset-0 z-30">
        {/* Phones: a button in the one corner the slide leaves free. */}
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto absolute right-3 top-3 h-10 gap-1.5 rounded-full px-4 text-xs font-bold uppercase tracking-wide shadow-lg md:hidden"
        >
          <HeartHandshake className="h-4 w-4" />
          Donate $1
        </Button>

        {/* Wider screens: the full invitation, beside the slide rather than over it. */}
        <div className="pointer-events-auto absolute bottom-16 right-6 hidden w-[21rem] rounded-2xl border border-white/15 bg-neutral-900/80 p-5 shadow-2xl backdrop-blur-md md:block lg:bottom-20 lg:w-[23rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            ISOKO Groups Global Initiative
          </p>
          <p className="mt-1.5 font-display text-2xl font-bold text-white">
            <span className="text-primary">$1</span> — One Project
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            Small contributions, pooled together, fund one real project at a time across
            entrepreneurship, arts, agriculture, unemployment reduction and research.
          </p>
          <Button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 h-auto w-full whitespace-normal py-3 text-sm font-bold uppercase leading-snug tracking-wide shadow-lg"
          >
            <HeartHandshake className="h-5 w-5" />
            Donate with ISOKO Groups Company
          </Button>
        </div>
      </div>

      <DonateDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default HeroDonateOverlay;
