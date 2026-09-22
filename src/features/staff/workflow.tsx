import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { db, useOfferings } from "@/features/services/api";
import { Panel } from "./common";

/** The steps of a workflow, the current one highlighted, and one button to move on. */
export function StatusStepper<S extends string>({
  steps, labels, current, onChange, offRoad,
}: {
  steps: readonly S[]; labels: Record<S, string>; current: S; onChange: (s: S) => void;
  /** statuses outside the main line (declined, cancelled) */
  offRoad?: readonly S[];
}) {
  const idx = steps.indexOf(current);
  const next = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
  return (
    <Panel title="Status">
      <ol className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => s !== current && onChange(s)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                s === current ? "border-transparent bg-foreground text-background" : i < idx ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={s === current ? "step" : undefined}
            >
              {i < idx && <Check className="h-3 w-3" />}
              {labels[s]}
            </button>
          </li>
        ))}
        {offRoad?.includes(current) && (
          <li><span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{labels[current]}</span></li>
        )}
      </ol>
      {next && (
        <Button className="mt-3 w-full sm:w-auto" onClick={() => onChange(next)}>
          Move to {labels[next]} <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      )}
    </Panel>
  );
}

/** Which services clients can request (Consultancy or Data Analysis). */
export function OfferingsManager({ service }: { service: "consultancy" | "data" }) {
  const offerings = useOfferings(service, true);
  const qc = useQueryClient();
  const toggle = async (id: string, is_active: boolean) => {
    const { error } = await db.from("service_offerings").update({ is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["service_offerings", service] });
  };
  return (
    <Panel title="Services clients can request">
      <p className="mb-3 text-sm text-muted-foreground">Switch a service off to hide it from the website and the request form.</p>
      <ul className="divide-y">
        {(offerings.data ?? []).map((o) => (
          <li key={o.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{o.name}</p>
              <p className="text-sm text-muted-foreground">{o.description}</p>
            </div>
            <Switch checked={o.is_active} onCheckedChange={(v) => toggle(o.id, v)} aria-label={`${o.name} available`} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
