import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, MapPin, Camera, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const statusColor = (s: string) => {
  if (["delivered", "completed"].includes(s)) return "bg-green-500/15 text-green-500";
  if (["in_progress", "assigned", "picked_up"].includes(s)) return "bg-blue-500/15 text-blue-500";
  return "bg-yellow-500/15 text-yellow-500";
};

const DriverDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isDriver, setIsDriver] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("role").eq("user_id", user.id);
      const driver = (roles || []).some((r: any) => r.role === "driver" || r.role === "admin");
      setIsDriver(driver);
      if (driver) {
        const { data } = await (supabase as any)
          .from("logistics_requests")
          .select("*")
          .eq("assigned_driver_id", user.id)
          .order("created_at", { ascending: false });
        setRequests(data || []);
      }
      setLoading(false);
    })();
  }, [user]);

  const updateStatus = async (id: string, status: string, extra: Record<string, any> = {}) => {
    const req = requests.find((r) => r.id === id);
    const { error } = await (supabase as any)
      .from("logistics_requests")
      .update({ status, driver_note: notes[id] || req?.driver_note || null, ...extra })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // The customer is notified by the database (DELIVERY_UPDATED / DELIVERY_COMPLETED)
    toast({ title: "Updated", description: `Status set to ${status}` });
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status, ...extra } : r)));
  };

  const uploadProof = async (id: string, file: File) => {
    setUploading(id);
    try {
      const path = `${user!.id}/${id}-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: upErr } = await supabase.storage.from("delivery-proofs").upload(path, file);
      if (upErr) throw upErr;
      // The path, not a link: the customer and admins open it through file-access
      await updateStatus(id, "delivered", {
        proof_url: path,
        delivered_at: new Date().toISOString(),
      });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  if (authLoading || isDriver === null) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isDriver) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-20 text-center">
          <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Driver access required</h1>
          <p className="text-muted-foreground">This dashboard is for assigned drivers only. Contact admin to be added.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const active = requests.filter((r) => !["delivered", "cancelled"].includes(r.status));
  const completed = requests.filter((r) => ["delivered", "cancelled"].includes(r.status));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Driver Dashboard</h1>
        <p className="text-muted-foreground mb-8">Manage your assigned deliveries and upload proof on completion.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <Card><CardContent className="p-4"><p className="text-2xl font-bold">{active.length}</p><p className="text-sm text-muted-foreground">Active</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-2xl font-bold">{completed.length}</p><p className="text-sm text-muted-foreground">Completed</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-2xl font-bold">{requests.length}</p><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        </div>

        {loading ? <p className="text-muted-foreground">Loading…</p> : active.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No active deliveries assigned.</p>
        ) : (
          <div className="space-y-4">
            {active.map((r) => (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{r.item_type || "Delivery"} · {r.weight} kg</CardTitle>
                  <Badge className={statusColor(r.status)} variant="outline">{r.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <p><MapPin className="h-3 w-3 inline mr-1" /><span className="text-muted-foreground">Pickup:</span> {r.pickup}</p>
                    <p><MapPin className="h-3 w-3 inline mr-1" /><span className="text-muted-foreground">Dropoff:</span> {r.dropoff}</p>
                    <p><span className="text-muted-foreground">Customer:</span> {r.full_name} {r.phone && `(${r.phone})`}</p>
                    <p><span className="text-muted-foreground">Date:</span> {r.preferred_date || "—"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`note-${r.id}`}>Driver note (optional)</Label>
                    <Textarea
                      id={`note-${r.id}`}
                      defaultValue={r.driver_note || ""}
                      placeholder="Any update for the customer…"
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {r.status === "pending" && (
                      <Button size="sm" onClick={() => updateStatus(r.id, "in_progress", { picked_up_at: new Date().toISOString() })}>
                        Mark Picked Up
                      </Button>
                    )}
                    <Label htmlFor={`proof-${r.id}`} className="cursor-pointer">
                      <span className="inline-flex items-center gap-1 text-xs h-9 px-3 rounded-md border border-input bg-background hover:bg-accent">
                        <Camera className="h-3 w-3" /> {uploading === r.id ? "Uploading…" : "Upload proof & deliver"}
                      </span>
                      <Input
                        id={`proof-${r.id}`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={uploading === r.id}
                        onChange={(e) => e.target.files?.[0] && uploadProof(r.id, e.target.files[0])}
                      />
                    </Label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><CheckCircle className="h-5 w-5" /> Completed</h2>
            <div className="space-y-2">
              {completed.slice(0, 10).map((r) => (
                <div key={r.id} className="flex justify-between items-center p-3 border border-border rounded-lg text-sm">
                  <div>
                    <p className="font-medium">{r.item_type || "Delivery"}</p>
                    <p className="text-xs text-muted-foreground">{r.pickup} → {r.dropoff}</p>
                  </div>
                  <Badge className={statusColor(r.status)} variant="outline">{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default DriverDashboard;
