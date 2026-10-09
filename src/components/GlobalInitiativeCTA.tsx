import { useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DONATIONS_OPEN } from "@/lib/initiative";
import DonateDialog from "@/features/initiative/DonateDialog";

/**
 * The homepage's way into the Global Initiative. It sits in its own band under
 * the hero rather than inside it, so the hero's moving story is left exactly as
 * it is; nothing here carries animation of its own.
 *
 * The hero already shows this invitation to anyone looking at the top of the
 * page, so this band is for people who scrolled past it. That is also why the
 * two must not disagree: a button saying Donate opens the same dialog here as
 * it does over the hero, and the route to the explainer page is a separate,
 * separately labelled action. On a phone the hero shrinks to a small chip with
 * no explanation, so this band is where the fuller invitation actually lands.
 *
 * Being the second ask on one screen, it stays an invitation rather than a
 * demand: no shouting capitals, and it says plainly what happens to the money
 * and that a contributor can check on it afterwards.
 */
const GlobalInitiativeCTA = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-b border-border bg-card">
      <div className="container flex flex-col items-start gap-6 py-10 md:flex-row md:items-center md:justify-between md:py-12">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            ISOKO Groups Global Initiative
          </p>
          <h2 className="font-display text-2xl font-bold md:text-3xl">
            <span className="text-primary">$1</span> — One Project
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Contributions start at 1,000 RWF and are pooled to fund one approved project at a
            time across entrepreneurship, arts, agriculture, unemployment reduction and research.
          </p>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            You pay ISOKO GROUP directly and send us the transaction reference. We match it to
            our records by hand, and you can check on yours at any time.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:shrink-0 md:items-center">
          {/* The same words as the hero, so they must do the same thing. */}
          {DONATIONS_OPEN && (
            <Button
              type="button"
              size="lg"
              onClick={() => setOpen(true)}
              className="h-auto w-full whitespace-normal px-7 py-4 text-base font-semibold leading-snug shadow-lg sm:w-auto"
            >
              <HeartHandshake className="h-5 w-5" />
              Donate with ISOKO Groups Company
            </Button>
          )}
          {/* Going to the explainer is a different action, so it is labelled as one. */}
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-auto w-full whitespace-normal px-6 py-4 text-sm font-semibold leading-snug sm:w-auto"
          >
            <Link to="/global-initiative">See how it works</Link>
          </Button>
        </div>
      </div>

      <DonateDialog open={open} onOpenChange={setOpen} />
    </section>
  );
};

export default GlobalInitiativeCTA;
