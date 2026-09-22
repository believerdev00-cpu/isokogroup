import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorText, rpc } from "@/features/services/api";

const ROLES = [
  { key: "travel_staff", label: "Travel Agency" },
  { key: "consultancy_staff", label: "Consultancy" },
  { key: "data_analyst", label: "Data Analysis" },
] as const;
type Role = (typeof ROLES)[number]["key"];
type Row = { user_id: string; full_name: string | null; email: string; roles: string[] };

// Who can work on the Travel, Consultancy and Data Analysis requests. Each person
// only sees the services they're given; admins see all of them.
const ServiceStaffAdmin = () => {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["admin_service_staff"], queryFn: () => rpc<Row[]>("admin_service_staff") });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("travel_staff");
  const [busy, setBusy] = useState(false);

  const set = async (e: string, r: Role, grant: boolean) => {
    setBusy(true);
    try {
      await rpc("admin_set_service_role", { p_email: e, p_role: r, p_grant: grant });
      toast.success(grant ? "Access given" : "Access removed");
      qc.invalidateQueries({ queryKey: ["admin_service_staff"] });
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client services staff</CardTitle>
        <CardDescription>
          Give Isoko staff access to Travel Agency, Consultancy or Data Analysis requests. They work in the{" "}
          <Link to="/staff" className="font-medium text-primary underline">Isoko Workspace</Link>. The Training Center has its own staff in its admin portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await set(email, role, true)) setEmail("");
          }}
        >
          <Input type="email" placeholder="Their Isoko account email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select aria-label="Service" className="h-10 rounded-md border bg-background px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <Button type="submit" disabled={busy || !email.trim()}>Give access</Button>
        </form>

        {staff.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (staff.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No service staff yet. Admins can already work on every service.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {staff.data!.map((s) => (
              <li key={s.user_id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.full_name || s.email}</p>
                  <p className="text-sm text-muted-foreground">{s.email}</p>
                </div>
                {ROLES.filter((r) => s.roles.includes(r.key)).map((r) => (
                  <Button key={r.key} size="sm" variant="outline" disabled={busy} onClick={() => set(s.email, r.key, false)} title="Remove this access">
                    {r.label} ✕
                  </Button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceStaffAdmin;
