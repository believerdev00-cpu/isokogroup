import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Entry = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string;
  action: string;
  entity_table: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  details: Record<string, unknown> | null;
};

const AREAS: { label: string; tables: string[] }[] = [
  { label: "Everything", tables: [] },
  { label: "Access & roles", tables: ["user_roles", "seller_applications"] },
  { label: "Money", tables: ["orders", "commissions", "payout_requests", "subscriptions", "travel_payments", "consult_payments", "data_payments", "software_bookings"] },
  { label: "Marketplace", tables: ["products", "orders"] },
  { label: "Logistics", tables: ["shipments", "tracking_logs", "logistics_requests", "packaging_requests", "couriers", "shipping_rates"] },
  { label: "Travel", tables: ["travel_trips", "travel_items", "travel_payments", "travel_documents"] },
  { label: "Consultancy", tables: ["consult_requests", "consult_proposals", "consult_payments", "consult_files"] },
  { label: "Data Analysis", tables: ["data_requests", "data_payments", "data_deliverables", "data_files"] },
  { label: "Files", tables: ["service-files"] },
];
const PAGE = 50;

const who = (e: Entry, names: Map<string, string>) =>
  e.actor_id ? names.get(e.actor_id) ?? e.actor_id.slice(0, 8)
    : e.actor_role === "anon" ? "Customer (link or public form)"
    : e.actor_role === "service_role" ? "Isoko server" : "System";

const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

// Read-only history of changes to money, orders, requests, files and roles.
// Nobody can edit or delete it (enforced in the database).
const AuditLogAdmin = () => {
  const [area, setArea] = useState(0);
  const [limit, setLimit] = useState(PAGE);

  const log = useQuery({
    queryKey: ["audit_log", area, limit],
    queryFn: async () => {
      let q = (supabase as any).from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(limit);
      if (AREAS[area].tables.length) q = q.in("entity_table", AREAS[area].tables);
      const { data, error } = await q;
      if (error) throw error;
      const entries = (data ?? []) as Entry[];
      const ids = [...new Set(entries.map((e) => e.actor_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: people } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        for (const p of people ?? []) if (p.full_name) names.set(p.user_id, p.full_name);
      }
      return { entries, names };
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Every change to payments, orders, requests, documents and roles: who made it, when, and what changed. Entries can't be edited or deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by area">
          {AREAS.map((a, i) => (
            <Button key={a.label} size="sm" variant={i === area ? "default" : "outline"} onClick={() => { setArea(i); setLimit(PAGE); }}>
              {a.label}
            </Button>
          ))}
        </div>

        {log.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : log.isError ? (
          <p className="text-sm text-destructive">The audit log could not be loaded. Please try again.</p>
        ) : log.data!.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded here yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {log.data!.entries.map((e) => {
              const keys = [...new Set([...Object.keys(e.old_data ?? {}), ...Object.keys(e.new_data ?? {})])];
              const changed = e.action === "update";
              return (
                <li key={e.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={e.action === "delete" ? "destructive" : "secondary"}>{e.action}</Badge>
                    <span className="font-medium">{e.entity_table.replace(/_/g, " ")}</span>
                    {e.entity_id && <span className="font-mono text-xs text-muted-foreground">{e.entity_id.slice(0, 8)}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleString()}</span>
                  </div>
                  <p className="text-muted-foreground">By {who(e, log.data!.names)}</p>
                  {e.reason && <p><span className="font-medium">Reason:</span> {e.reason}</p>}
                  {changed ? (
                    <dl className="grid gap-1 sm:grid-cols-[minmax(8rem,auto)_1fr]">
                      {keys.map((k) => (
                        <div key={k} className="contents">
                          <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                          <dd className="break-all">{show(e.old_data?.[k])} → <span className="font-medium">{show(e.new_data?.[k])}</span></dd>
                        </div>
                      ))}
                    </dl>
                  ) : (e.details || e.new_data || e.old_data) && (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">Details</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(e.details ?? e.new_data ?? e.old_data, null, 2)}</pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {log.data && log.data.entries.length === limit && (
          <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>Show older entries</Button>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLogAdmin;
