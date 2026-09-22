import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-gold">404</p>
      <h1 className="mt-2 text-3xl font-bold">We couldn't find that page</h1>
      <p className="mt-2 text-muted-foreground">The link may be old, or the page may have moved.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild><Link to="/training-center">Go home</Link></Button>
        <Button asChild variant="outline"><Link to="/training-center/intakes">Available intakes</Link></Button>
      </div>
    </div>
  );
}
