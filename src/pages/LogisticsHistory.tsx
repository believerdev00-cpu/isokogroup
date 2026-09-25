import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowLeft, Package as PackageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { openSecureFile } from "@/features/services/api";

type LogisticsRequest = {
  id: string;
  pickup: string;
  dropoff: string;
  weight: number;
  preferred_date: string | null;
  status: string;
  full_name: string | null;
  phone: string | null;
  item_type: string | null;
  proof_url: string | null;
  created_at: string;
};

const statusVariant = (status: string) => {
  switch (status) {
    case "completed":
    case "delivered":
      return "default";
    case "in_progress":
    case "in-progress":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
};

const LogisticsHistory = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<LogisticsRequest[]>([]);
  // Every status each request went through (kept by the database, never rewritten)
  const [history, setHistory] = useState<Record<string, { status: string; created_at: string }[]>>({});

  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) return;
      const { data } = await (supabase as any)
        .from("logistics_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) {
        setRequests(data);
        const { data: steps } = await (supabase as any)
          .from("request_status_history")
          .select("request_id, status, created_at")
          .eq("request_table", "logistics_requests")
          .in("request_id", data.map((r: LogisticsRequest) => r.id))
          .order("id");
        const byRequest: Record<string, { status: string; created_at: string }[]> = {};
        for (const st of steps ?? []) (byRequest[st.request_id] ??= []).push(st);
        setHistory(byRequest);
      }
      setLoading(false);
    };
    fetchRequests();
  }, [user]);

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container max-w-4xl">
          <Link to="/logistics/delivery" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Logistics
          </Link>
          <div className="mb-10 space-y-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">History</span>
            <h1 className="text-3xl md:text-4xl font-display font-bold">My Delivery Requests</h1>
            <p className="text-muted-foreground">Track all the logistics requests you have submitted.</p>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-center py-12">Loading...</p>
          ) : requests.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <PackageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">You haven't submitted any delivery requests yet.</p>
              <Link to="/logistics/delivery" className="text-primary text-sm font-medium hover:underline mt-2 inline-block">
                Submit your first request
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-6 hover-lift">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold">{r.item_type || "Item"}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Submitted {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={statusVariant(r.status) as any}>{r.status}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Pickup:</span>{" "}
                      <span className="font-medium">{r.pickup}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Drop-off:</span>{" "}
                      <span className="font-medium">{r.dropoff}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Weight:</span>{" "}
                      <span className="font-medium">{r.weight} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Preferred date:</span>{" "}
                      <span className="font-medium">{r.preferred_date || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Contact:</span>{" "}
                      <span className="font-medium">{r.full_name} {r.phone ? `(${r.phone})` : ""}</span>
                    </div>
                  </div>
                  {(history[r.id]?.length ?? 0) > 1 && (
                    <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Status history">
                      {history[r.id].map((st, i) => (
                        <li key={i}>
                          <span className="font-medium text-foreground">{st.status.replace(/_/g, " ")}</span>{" "}
                          {new Date(st.created_at).toLocaleString()}
                        </li>
                      ))}
                    </ol>
                  )}
                  {r.proof_url && (
                    <Button
                      variant="outline" size="sm" className="mt-4"
                      onClick={() => openSecureFile("delivery-proofs", r.proof_url!).catch((e) => toast.error(e.message))}
                    >
                      View proof of delivery
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default LogisticsHistory;
