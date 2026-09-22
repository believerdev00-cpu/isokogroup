import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Truck, Package as PackageIcon, MapPin, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const FLOW = ["processing", "packed", "shipped", "in_transit", "out_for_delivery", "delivered"];

const ICONS: Record<string, any> = {
  processing: Clock, packed: PackageIcon, shipped: Truck,
  in_transit: Truck, out_for_delivery: MapPin, delivered: CheckCircle2,
};

type Log = { id: string; status: string; location: string | null; note: string | null; created_at: string };

type Props = { trackingNumber?: string; orderId?: string };

const TrackingTimeline = ({ trackingNumber, orderId }: Props) => {
  const [shipment, setShipment] = useState<any | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    if (trackingNumber) {
      // Public lookup: returns only the status fields, never addresses or driver phones
      const { data } = await (supabase as any).rpc("track_shipment", { p_tracking_number: trackingNumber });
      setShipment(data?.shipment ?? null);
      setLogs(data?.logs ?? []);
      setLoading(false);
      return;
    }
    let q = (supabase as any).from("shipments").select("*");
    if (orderId) q = q.eq("order_id", orderId);
    const { data: s } = await q.maybeSingle();
    setShipment(s);
    if (s) {
      const { data: l } = await (supabase as any)
        .from("tracking_logs").select("*").eq("shipment_id", s.id)
        .order("created_at", { ascending: true });
      setLogs(l || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!trackingNumber && !orderId) return;
    const channel = supabase.channel(`track-${trackingNumber || orderId}-${Math.random()}`);
    channel.on("postgres_changes",
      { event: "*", schema: "public", table: "shipments" }, () => load())
      .on("postgres_changes",
      { event: "*", schema: "public", table: "tracking_logs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingNumber, orderId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading tracking…</p>;
  if (!shipment) return <p className="text-sm text-muted-foreground">No shipment information yet.</p>;

  const currentIdx = FLOW.indexOf(shipment.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Tracking #</p>
          <p className="font-mono font-bold">{shipment.tracking_number}</p>
        </div>
        {shipment.courier && (
          <div>
            <p className="text-xs text-muted-foreground">Courier</p>
            <p>{shipment.courier}</p>
          </div>
        )}
        {shipment.estimated_delivery && (
          <div>
            <p className="text-xs text-muted-foreground">ETA</p>
            <p>{new Date(shipment.estimated_delivery).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      {/* Step bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {FLOW.map((step, i) => {
          const reached = i <= currentIdx;
          const Icon = ICONS[step] || Circle;
          return (
            <div key={step} className="flex items-center gap-1 shrink-0">
              <div className={`flex flex-col items-center gap-1 px-2 ${reached ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] uppercase">{step.replace(/_/g, " ")}</span>
              </div>
              {i < FLOW.length - 1 && (
                <div className={`h-0.5 w-8 ${i < currentIdx ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed log */}
      <div className="space-y-3 border-l-2 border-border pl-4">
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No updates yet.</p>
        ) : (
          [...logs].reverse().map((l) => (
            <div key={l.id} className="relative">
              <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-primary" />
              <p className="text-sm font-medium capitalize">{l.status.replace(/_/g, " ")}</p>
              {l.location && <p className="text-xs text-muted-foreground">{l.location}</p>}
              {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
              <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TrackingTimeline;
