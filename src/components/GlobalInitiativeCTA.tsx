import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DONATIONS_OPEN } from "@/lib/initiative";
import DonateDialog from "@/features/initiative/DonateDialog";

/**
 * The one way into the Global Initiative from the homepage.
 *
 * There used to be two, this and a card laid over the hero, and they competed
 * with each other and with the hero's own buttons. One invitation, in its own
 * band directly under the hero, leaves the hero untouched and says the thing
 * once.
 *
 * It stays deliberately spare: an eyebrow, a name, a single sentence, one
 * button, and a quiet link for anyone who wants to read more before giving.
 * How a contribution is actually paid and confirmed belongs in the dialog, at
 * the point where someone is deciding, not on the homepage.
 */
const GlobalInitiativeCTA = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-b border-border bg-card">
      <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between md:gap-10 md:py-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            ISOKO Groups Global Initiative
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">
            <span className="text-primary">$1</span> — One Project
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Contributions start at 1,000 RWF and are pooled to fund one approved project at a time.
          </p>
        </div>

        <div className="flex items-center gap-5 md:shrink-0">
          {DONATIONS_OPEN && (
            <Button
              type="button"
              size="lg"
              onClick={() => setOpen(true)}
              className="h-12 px-8 text-base font-semibold"
            >
              Donate
            </Button>
          )}
          <Link
            to="/global-initiative"
            className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            How it works
          </Link>
        </div>
      </div>

      <DonateDialog open={open} onOpenChange={setOpen} />
    </section>
  );
};

export default GlobalInitiativeCTA;
