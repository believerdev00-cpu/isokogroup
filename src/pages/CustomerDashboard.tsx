import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Truck, Box, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import NotificationPreferences from "@/components/NotificationPreferences";
import SubscriptionStatusCard from "@/components/SubscriptionStatusCard";

const statusColor = (s: string) => {
  if (["delivered", "completed"].includes(s)) return "bg-green-500/15 text-green-500";
  if (["shipped", "in_progress", "assigned"].includes(s)) return "bg-blue-500/15 text-blue-500";
  if (s === "cancelled" || s === "rejected") return "bg-destructive/15 text-destructive";
  return "bg-yellow-500/15 text-yellow-500";
};

const CustomerDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [logistics, setLogistics] = useState<any[]>([]);
  const [packaging, setPackaging] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [o, l, p] = await Promise.all([
        (supabase as any).from("orders").select("*").eq("buyer_id", user.id).order("created_at", { ascending: false }),
        (supabase as any).from("logistics_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        (supabase as any).from("packaging_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setOrders(o.data || []);
      setLogistics(l.data || []);
      setPackaging(p.data || []);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const stats = [
    { label: "Marketplace Orders", value: orders.length, icon: ShoppingBag },
    { label: "Delivery Requests", value: logistics.length, icon: Truck },
    { label: "Packaging Requests", value: packaging.length, icon: Box },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">My Dashboard</h1>
        <p className="text-muted-foreground mb-8">All your orders, deliveries and packaging in one place.</p>

        {/* Where the account stands: trial, active, expiring, pending, expired or none */}
        <SubscriptionStatusCard className="mb-8" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <s.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Recent Orders</CardTitle>
                <Link to="/my-orders" className="text-sm text-primary hover:underline">View all</Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : orders.slice(0, 5).map((o) => (
                  <div key={o.id} className="flex justify-between items-center text-sm border-b border-border pb-2">
                    <div>
                      <p className="font-medium">#{o.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{o.total_amount.toLocaleString()} RWF</p>
                    </div>
                    <Badge className={statusColor(o.status)} variant="outline">{o.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Truck className="h-5 w-5" /> Recent Deliveries</CardTitle>
                <Link to="/logistics/history" className="text-sm text-primary hover:underline">View all</Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {logistics.length === 0 ? <p className="text-sm text-muted-foreground">No delivery requests yet.</p> : logistics.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-sm border-b border-border pb-2">
                    <div>
                      <p className="font-medium">{r.item_type || "Item"}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.pickup} → {r.dropoff}</p>
                    </div>
                    <Badge className={statusColor(r.status)} variant="outline">{r.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Box className="h-5 w-5" /> Packaging Requests</CardTitle>
                <Link to="/logistics/packaging" className="text-sm text-primary hover:underline">New request</Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {packaging.length === 0 ? <p className="text-sm text-muted-foreground">No packaging requests yet.</p> : packaging.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-sm border-b border-border pb-2">
                    <div>
                      <p className="font-medium">{r.item_description}</p>
                      <p className="text-xs text-muted-foreground">Qty: {r.quantity}</p>
                    </div>
                    <Badge className={statusColor(r.status)} variant="outline">{r.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mt-8 max-w-xl">
          <NotificationPreferences />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/logistics/delivery"><Button variant="outline"><Truck className="h-4 w-4 mr-2" /> New Delivery</Button></Link>
          <Link to="/logistics/packaging"><Button variant="outline"><Box className="h-4 w-4 mr-2" /> New Packaging</Button></Link>
          <Link to="/marketplace"><Button variant="outline"><Package className="h-4 w-4 mr-2" /> Shop</Button></Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CustomerDashboard;
