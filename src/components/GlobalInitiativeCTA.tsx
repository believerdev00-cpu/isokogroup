import { Link } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The homepage's way into the Global Initiative. It sits in its own band under
 * the hero rather than inside it, so the hero's moving story is left exactly as
 * it is; this button is static and carries no animation of its own.
 */
const GlobalInitiativeCTA = () => (
  <section className="border-b border-border bg-card">
    <div className="container flex flex-col items-start gap-5 py-10 md:flex-row md:items-center md:justify-between md:py-12">
      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          ISOKO Groups Global Initiative
        </p>
        <h2 className="font-display text-2xl font-bold md:text-3xl">
          <span className="text-primary">$1</span> — One Project
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Small contributions, pooled together, help fund one real project at a time across
          entrepreneurship, arts, agriculture, unemployment reduction and research.
        </p>
      </div>

      <Link to="/global-initiative" className="w-full md:w-auto">
        <Button
          size="lg"
          className="h-auto w-full whitespace-normal px-8 py-4 text-base font-bold uppercase leading-snug tracking-wide shadow-lg md:w-auto md:text-lg"
        >
          <HeartHandshake className="h-5 w-5" />
          DONATE WITH ISOKO GROUPS COMPANY
        </Button>
      </Link>
    </div>
  </section>
);

export default GlobalInitiativeCTA;
