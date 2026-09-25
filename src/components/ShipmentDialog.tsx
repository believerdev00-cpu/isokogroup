import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Download, Package as PackageIcon, FileText, Tag, Calculator } from "lucide-react";
import { calculateShippingCost, fetchShippingRates, type ShippingRate, type ShippingZone } from "@/lib/shipping";

type Props = {
  orderId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
};

const STATUSES = [
  "processing",
  "packed",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const PKG_TYPES = ["box", "envelope", "pallet", "custom"];

const ShipmentDialog = ({ orderId, open, onOpenChange, onSaved }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pkg, setPkg] = useState({
    package_type: "box",
    length_cm: 30, width_cm: 20, height_cm: 15, weight_kg: 1, notes: "",
    barcode: "",
  });
  const [shipment, setShipment] = useState({
    tracking_number: "",
    courier: "",
    courier_id: "" as string,
    driver_name: "",
    driver_phone: "",
    shipping_cost: 0,
    distance_km: 0,
    estimated_delivery: "",
    status: "processing",
  });
  const [zone, setZone] = useState<ShippingZone>("local");
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [shipId, setShipId] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [rates, setRates] = useState<ShippingRate[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        (supabase as any).from("packages").select("*").eq("order_id", orderId).maybeSingle(),
        (supabase as any).from("shipments").select("*").eq("order_id", orderId).maybeSingle(),
      ]);
      if (p) {
        setPkgId(p.id);
        setPkg({
          package_type: p.package_type, length_cm: p.length_cm, width_cm: p.width_cm,
          height_cm: p.height_cm, weight_kg: p.weight_kg, notes: p.notes ?? "", barcode: p.barcode,
        });
      } else {
        setPkgId(null);
      }
      if (s) {
        setShipId(s.id);
        setShipment({
          tracking_number: s.tracking_number, courier: s.courier ?? "",
          courier_id: s.courier_id ?? "",
          driver_name: s.driver_name ?? "", driver_phone: s.driver_phone ?? "",
          shipping_cost: s.shipping_cost ?? 0,
          distance_km: s.distance_km ?? 0,
          estimated_delivery: s.estimated_delivery ?? "",
          status: s.status,
        });
      } else {
        setShipId(null);
      }
      const [{ data: cs }, rs] = await Promise.all([
        (supabase as any).from("couriers").select("*").eq("active", true).order("name"),
        fetchShippingRates().catch(() => []),
      ]);
      setCouriers(cs ?? []);
      setRates(rs);
    })();
  }, [open, orderId]);

  const save = async () => {
    setLoading(true);
    try {
      // Move the order first: the server refuses shipping unpaid orders, and a
      // shipment marked delivered keeps the order "shipped" until the buyer confirms.
      const { error: statusError } = await (supabase as any).rpc("seller_set_order_status", {
        p_order_id: orderId, p_status: shipment.status,
      });
      if (statusError) throw statusError;

      // Upsert package
      if (pkgId) {
        const { error } = await (supabase as any).from("packages").update({
          package_type: pkg.package_type, length_cm: pkg.length_cm, width_cm: pkg.width_cm,
          height_cm: pkg.height_cm, weight_kg: pkg.weight_kg, notes: pkg.notes,
        }).eq("id", pkgId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("packages").insert({
          order_id: orderId, package_type: pkg.package_type,
          length_cm: pkg.length_cm, width_cm: pkg.width_cm, height_cm: pkg.height_cm,
          weight_kg: pkg.weight_kg, notes: pkg.notes,
        });
        if (error) throw error;
      }

      // Upsert shipment
      const shipPayload: any = {
        courier: shipment.courier, courier_id: shipment.courier_id || null,
        driver_name: shipment.driver_name,
        driver_phone: shipment.driver_phone, shipping_cost: Number(shipment.shipping_cost) || 0,
        distance_km: Number(shipment.distance_km) || 0,
        estimated_delivery: shipment.estimated_delivery || null,
        status: shipment.status,
      };
      if (shipId) {
        const { error } = await (supabase as any).from("shipments").update(shipPayload).eq("id", shipId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("shipments").insert({
          order_id: orderId, ...shipPayload,
        });
        if (error) throw error;
      }
      // The buyer is notified by the database (SHIPMENT_UPDATED, ORDER_SHIPPED)

      toast({ title: "Saved", description: "Shipment updated." });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = (type: "label" | "packing_slip" | "invoice") => {
    toast({ title: "Preparing PDF…", description: "Your file will download shortly." });
    // Defer heavy work off the click handler to keep the UI responsive (improves INP)
    setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ type, order_id: orderId }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || "Failed to generate PDF");
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${type}-${orderId.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (e: any) {
        toast({ title: "PDF error", description: e.message, variant: "destructive" });
      }
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Shipment & Packaging — Order #{orderId.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Packaging */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><PackageIcon className="h-4 w-4" /> Packaging</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={pkg.package_type} onValueChange={(v) => setPkg({ ...pkg, package_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PKG_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input type="number" step="0.01" value={pkg.weight_kg}
                  onChange={(e) => setPkg({ ...pkg, weight_kg: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Length (cm)</Label>
                <Input type="number" value={pkg.length_cm}
                  onChange={(e) => setPkg({ ...pkg, length_cm: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Width (cm)</Label>
                <Input type="number" value={pkg.width_cm}
                  onChange={(e) => setPkg({ ...pkg, width_cm: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Height (cm)</Label>
                <Input type="number" value={pkg.height_cm}
                  onChange={(e) => setPkg({ ...pkg, height_cm: parseFloat(e.target.value) || 0 })} />
              </div>
              {pkg.barcode && (
                <div>
                  <Label>Barcode</Label>
                  <Input value={pkg.barcode} readOnly className="font-mono text-xs" />
                </div>
              )}
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={pkg.notes} onChange={(e) => setPkg({ ...pkg, notes: e.target.value })} />
            </div>
          </section>

          {/* Shipment */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Tag className="h-4 w-4" /> Shipment</h3>
            <div className="grid grid-cols-2 gap-3">
              {shipment.tracking_number && (
                <div className="col-span-2">
                  <Label>Tracking number</Label>
                  <Input value={shipment.tracking_number} readOnly className="font-mono" />
                </div>
              )}
              <div>
                <Label>Registered courier</Label>
                <Select
                  value={shipment.courier_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setShipment({ ...shipment, courier_id: "" });
                      return;
                    }
                    const c = couriers.find((x) => x.id === v);
                    setShipment({
                      ...shipment,
                      courier_id: v,
                      courier: c?.company || c?.name || shipment.courier,
                      driver_name: c?.name || shipment.driver_name,
                      driver_phone: c?.phone || shipment.driver_phone,
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select courier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {couriers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.company ? `(${c.company})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Courier (free text)</Label>
                <Input value={shipment.courier} placeholder="DHL, local courier…"
                  onChange={(e) => setShipment({ ...shipment, courier: e.target.value })} />
              </div>
              <div>
                <Label>Driver name</Label>
                <Input value={shipment.driver_name}
                  onChange={(e) => setShipment({ ...shipment, driver_name: e.target.value })} />
              </div>
              <div>
                <Label>Driver phone</Label>
                <Input value={shipment.driver_phone}
                  onChange={(e) => setShipment({ ...shipment, driver_phone: e.target.value })} />
              </div>
              <div>
                <Label>Zone</Label>
                <Select value={zone} onValueChange={(v) => setZone(v as ShippingZone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="regional">Regional</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Distance (km)</Label>
                <Input type="number" value={shipment.distance_km}
                  onChange={(e) => setShipment({ ...shipment, distance_km: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2 flex items-end gap-2">
                <div className="flex-1">
                  <Label>Shipping cost (RWF)</Label>
                  <Input type="number" value={shipment.shipping_cost}
                    onChange={(e) => setShipment({ ...shipment, shipping_cost: parseInt(e.target.value) || 0 })} />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const { total, rate } = calculateShippingCost(rates, {
                      zone, weight_kg: pkg.weight_kg, distance_km: shipment.distance_km,
                    });
                    if (!rate) {
                      toast({ title: "No matching rate", description: "Adjust zone or weight bracket.", variant: "destructive" });
                      return;
                    }
                    setShipment({ ...shipment, shipping_cost: total });
                    toast({ title: "Calculated", description: `Estimated cost: ${total.toLocaleString()} RWF` });
                  }}
                >
                  <Calculator className="h-4 w-4 mr-1" /> Calculate
                </Button>
              </div>
              <div>
                <Label>Estimated delivery</Label>
                <Input type="date" value={shipment.estimated_delivery}
                  onChange={(e) => setShipment({ ...shipment, estimated_delivery: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={shipment.status} onValueChange={(v) => setShipment({ ...shipment, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {(pkgId || shipId) && (
            <section className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadPdf("label")}>
                <Download className="h-3 w-3 mr-1" /> Shipping Label
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadPdf("packing_slip")}>
                <FileText className="h-3 w-3 mr-1" /> Packing Slip
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadPdf("invoice")}>
                <FileText className="h-3 w-3 mr-1" /> Invoice
              </Button>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShipmentDialog;
