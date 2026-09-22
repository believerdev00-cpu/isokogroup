import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Briefcase, GraduationCap, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatDate, rpc } from "@/features/services/api";
import { ServiceLayout } from "@/features/services/ui";

// Isoko's four client services. Each has its own page and its own single action;
// nothing is mixed into one form.
const SERVICES = [
  {
    key: "training",
    icon: GraduationCap,
    title: "Training Center",
    text: "Professional skills development: practical programs with Isoko certificates.",
    cta: "Explore Training",
    to: "/training-center",
    accent: "from-red-600 to-rose-700",
  },
  {
    key: "travel",
    icon: Plane,
    title: "Travel Agency",
    text: "Complete travel support in Rwanda, from your arrival to your departure.",
    cta: "Plan My Trip",
    to: "/travel",
    accent: "from-emerald-700 to-teal-800",
  },
  {
    key: "consultancy",
    icon: Briefcase,
    title: "Consultancy",
    text: "Professional support for businesses and organizations: strategy, operations, technology.",
    cta: "Request Consultancy",
    to: "/consultancy",
    accent: "from-slate-800 to-blue-900",
  },
  {
    key: "data",
    icon: BarChart3,
    title: "Data Analysis",
    text: "Turn your data into useful information and better decisions.",
    cta: "Request Data Analysis",
    to: "/data-analysis",
    accent: "from-indigo-700 to-violet-800",
  },
] as const;

type MyRequest = { service: "travel" | "consultancy" | "data"; reference: string; token: string; title: string; status: string; created_at: string };

const REQUEST_LINK: Record<MyRequest["service"], string> = {
  travel: "/travel/trip/",
  consultancy: "/consultancy/r/",
  data: "/data-analysis/r/",
};

function MyRequests() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my_service_requests", user?.id],
    queryFn: () => rpc<MyRequest[]>("my_service_requests"),
    enabled: !!user,
  });
  if (!user || !q.data?.length) return null;
  return (
    <section className="container max-w-5xl pb-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Your requests</h2>
      <ul className="divide-y rounded-2xl border bg-card">
        {q.data.slice(0, 5).map((r) => (
          <li key={r.reference}>
            <Link to={REQUEST_LINK[r.service] + r.token} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {r.reference} · {formatDate(r.created_at)}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const Services = () => (
  <ServiceLayout>
    <section className="container max-w-5xl py-12 text-center sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">Isoko services</p>
      <h1 className="mt-2 font-display text-3xl font-bold sm:text-5xl">How can Isoko help you?</h1>
      <p className="mx-auto mt-4 max-w-2xl text-muted-foreground sm:text-lg">
        Choose a service, make a short request, and Isoko takes care of the rest.
      </p>
    </section>

    <MyRequests />

    <section className="container max-w-5xl pb-20">
      <div className="grid gap-5 sm:grid-cols-2">
        {SERVICES.map((s) => (
          <article key={s.key} className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg">
            <div className={cn("flex items-center gap-3 bg-gradient-to-br p-6 text-white", s.accent)}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
                <s.icon className="h-6 w-6" />
              </span>
              <h2 className="font-display text-2xl font-bold">{s.title}</h2>
            </div>
            <div className="flex flex-1 flex-col gap-5 p-6">
              <p className="flex-1 text-muted-foreground">{s.text}</p>
              <Button asChild size="lg" variant="outline" className="h-12 w-full justify-between text-base font-semibold">
                <Link to={s.to}>
                  {s.cta} <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  </ServiceLayout>
);

export default Services;
