import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Package, Clock, Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import TrackingTimeline from "@/components/TrackingTimeline";

type Order = {
  id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  shipping_address: string | null;
  seller_id: string;
  delivered_confirmed_at: string | null;
  created_at: string;
};

const statusColor = (s: string) => {
  if (s === "delivered") return "bg-green-500/15 text-green-500";
  if (s === "shipped") return "bg-blue-500/15 text-blue-500";
  if (s === "cancelled") return "bg-destructive/15 text-destructive";
  return "bg-yellow-500/15 text-yellow-500";
};

const BuyerOrders = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("orders")
      .select("*")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });
    setOrders((data as Order[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const confirmDelivery = async (order: Order) => {
    // Marks the order delivered and notifies the seller on the server
    const { error } = await (supabase as any).rpc("confirm_delivery", { p_order_id: order.id });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Delivery confirmed", description: "Thanks! The seller has been notified." });
    load();
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadInvoice = (orderId: string) => {
    if (downloadingId) return;
    setDownloadingId(orderId);
    toast({ title: "Preparing invoice…", description: "Your PDF will download shortly." });

    // Defer heavy work off the click handler so the UI updates immediately (fixes INP)
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
          body: JSON.stringify({ type: "invoice", order_id: orderId }),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `invoice-${orderId.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
      } finally {
        setDownloadingId(null);
      }
    }, 0);
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">My Orders</h1>
        <p className="text-muted-foreground mb-8">Track your orders and confirm when items arrive.</p>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">You have no orders yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <Card key={o.id}>
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">
                    Order #{o.id.slice(0, 8)} ·{" "}
                    <span className="text-primary">{o.total_amount.toLocaleString()} RWF</span>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge className={statusColor(o.status)} variant="outline">{o.status}</Badge>
                    <Badge variant="outline">payment: {o.payment_status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid sm:grid-cols-2 gap-2 text-muted-foreground">
                    <p><span className="font-medium text-foreground">Method:</span> {o.payment_method || "—"}</p>
                    <p><span className="font-medium text-foreground">Reference:</span> {o.payment_reference || "—"}</p>
                    <p className="sm:col-span-2"><span className="font-medium text-foreground">Ship to:</span> {o.shipping_address || "—"}</p>
                    <p><span className="font-medium text-foreground">Placed:</span> {new Date(o.created_at).toLocaleString()}</p>
                  </div>

                  {o.status === "shipped" && !o.delivered_confirmed_at && (
                    <Button onClick={() => confirmDelivery(o)} className="gap-2">
                      <CheckCircle className="h-4 w-4" /> Confirm I received this order
                    </Button>
                  )}
                  {o.status === "delivered" && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Delivery confirmed
                    </p>
                  )}
                  {o.status === "pending" && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Waiting for company to verify your payment
                    </p>
                  )}

                  <div className="pt-2 border-t border-border">
                    <TrackingTimeline orderId={o.id} />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => downloadInvoice(o.id)} disabled={downloadingId === o.id}>
                      <Download className="h-3 w-3 mr-1" /> {downloadingId === o.id ? "Preparing…" : "Invoice"}
                    </Button>
                    <Link to="/track">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-3 w-3 mr-1" /> Public tracking page
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default BuyerOrders;
