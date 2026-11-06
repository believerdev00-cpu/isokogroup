import { useCallback, useEffect, useMemo, useState } from "react";
import { MailWarning, RefreshCw, Search, Store, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SubscriptionPaymentsAdmin from "@/components/admin/SubscriptionPaymentsAdmin";
import { currentPaymentByUser, type UserPayment, type UserPaymentStatus } from "@/lib/userPaymentStatus";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  role: string;
  business_name: string | null;
  phone: string | null;
  created_at: string;
};

/** One account as Supabase Auth has it (admin_user_confirmations) */
export type UserConfirmation = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_type: "buyer" | "seller";
  is_admin: boolean;
  email_confirmed_at: string | null;
  registered_at: string;
};

type SellerApplication = {
  id: string;
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  status: string;
  created_at: string;
};

type View = "decisions" | "users" | "unconfirmed";
type UserType = "admin" | "seller" | "buyer";
type EmailState = "confirmed" | "waiting";

/** One line of the user list: their profile and their account, as one person */
type UserRow = {
  userId: string;
  name: string | null;
  email: string | null;
  type: UserType;
  business: string | null;
  phone: string | null;
  joined: string;
  emailState: EmailState | null;
  status: UserPaymentStatus;
  applicationWaiting: boolean;
};

const STATUS_LABEL: Record<UserPaymentStatus, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  rejected: "Rejected",
  none: "No payment",
};
const TYPE_LABEL: Record<UserType, string> = { admin: "Admin", seller: "Seller", buyer: "Buyer" };
const PAGE_SIZE = 25;
const REFRESH_MS = 60_000;
const SELECT_CLASS = "h-10 rounded-md border border-input bg-background px-3 text-sm";

const when = (v: string) => new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const accountLabel = (a: UserConfirmation) => (a.is_admin ? "Admin" : a.account_type === "seller" ? "Seller" : "Buyer");

const Tile = ({ icon: Icon, label, value, hint, attention, onClick }: {
  icon: typeof Users;
  label: string;
  value: number | null;
  hint: string;
  attention?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      attention && value ? "border-primary/60" : "",
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Icon className={cn("h-4 w-4", attention && value ? "text-primary" : "text-muted-foreground")} aria-hidden />
    </div>
    <p className="mt-1 text-2xl font-bold tabular-nums">{value ?? "—"}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
  </button>
);

// Arranged around what the admin has to do: decisions first, then finding anyone,
// then who hasn't confirmed their email. Payments, seller applications and email
// confirmation are three different things and are kept apart. Everything here only
// reads; decisions stay with the payments list and the Sellers tab. The database lets
// only admins read the confirmations.
const AdminUsers = ({ profiles, title, sellerApplications = [], onOpenSellers }: {
  profiles: Profile[];
  title: string;
  sellerApplications?: SellerApplication[];
  onOpenSellers?: () => void;
}) => {
  const [payments, setPayments] = useState<UserPayment[] | null>(null);
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  const [accounts, setAccounts] = useState<UserConfirmation[] | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("decisions");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | UserType>("all");
  const [emailFilter, setEmailFilter] = useState<"all" | EmailState>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserPaymentStatus>("all");
  const [page, setPage] = useState(0);

  const loadPayments = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("subscription_payments_list", { p_status: "all", p_limit: 500 });
    setPaymentsFailed(!!error);
    if (!error) setPayments((data ?? []) as UserPayment[]);
  }, []);

  const loadAccounts = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("admin_user_confirmations");
    setAccountsFailed(!!error);
    // A failed refresh keeps nothing old on show: a wrong list is worse than none
    setAccounts(error ? null : ((data ?? []) as UserConfirmation[]));
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAccounts(), loadPayments()]);
    setRefreshing(false);
  }, [loadAccounts, loadPayments]);

  // Someone who confirms their email leaves the waiting list without a page reload
  useEffect(() => {
    refresh();
    const timer = window.setInterval(loadAccounts, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && loadAccounts();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, loadAccounts]);

  const accountByUser = useMemo(() => new Map((accounts ?? []).map((a) => [a.user_id, a])), [accounts]);
  const waiting = useMemo(() => (accounts ?? []).filter((a) => a.email_confirmed_at === null), [accounts]);
  const current = useMemo(() => currentPaymentByUser(payments ?? []), [payments]);
  const waitingApplicants = useMemo(
    () => new Set(sellerApplications.filter((a) => a.status === "pending").map((a) => a.user_id)),
    [sellerApplications],
  );
  const waitingApplications = useMemo(
    () =>
      sellerApplications
        .filter((a) => a.status === "pending")
        .map((a) => ({
          id: a.id,
          full_name: a.full_name,
          business_name: a.business_name,
          email: a.email ?? accountByUser.get(a.user_id)?.email ?? null,
          created_at: a.created_at,
          paymentReported: current.get(a.user_id)?.status === "pending",
        })),
    [sellerApplications, accountByUser, current],
  );

  // Everyone once: each profile, plus any account that somehow has no profile
  const rows = useMemo<UserRow[]>(() => {
    const seen = new Set<string>();
    const describe = (userId: string, p: Profile | null, a: UserConfirmation | undefined): UserRow => {
      seen.add(userId);
      const payment = current.get(userId);
      const applicationWaiting = waitingApplicants.has(userId);
      return {
        userId,
        name: p?.full_name ?? a?.full_name ?? null,
        email: a?.email ?? payment?.customer_email ?? null,
        // is_admin comes from user_roles: the profile only ever says buyer or seller
        type: a?.is_admin ? "admin" : p?.role === "seller" || (!p && a?.account_type === "seller") ? "seller" : "buyer",
        business: p?.business_name ?? null,
        phone: p?.phone ?? null,
        joined: p?.created_at ?? a?.registered_at ?? "",
        emailState: a ? (a.email_confirmed_at ? "confirmed" : "waiting") : null,
        status: payment?.status === "pending" || applicationWaiting ? "pending" : payment?.status ?? "none",
        applicationWaiting,
      };
    };
    const list = profiles.map((p) => describe(p.user_id, p, accountByUser.get(p.user_id)));
    for (const a of accounts ?? []) if (!seen.has(a.user_id)) list.push(describe(a.user_id, null, a));
    return list.sort((x, y) => y.joined.localeCompare(x.joined));
  }, [profiles, accounts, accountByUser, current, waitingApplicants]);

  const statusKnown = payments !== null;
  const emailKnown = accounts !== null;
  const needsDecision = statusKnown ? rows.filter((r) => r.status === "pending").length : null;
  const sellers = rows.filter((r) => r.type === "seller").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || [r.name, r.email, r.phone, r.business].some((v) => v?.toLowerCase().includes(q))) &&
        (typeFilter === "all" || r.type === typeFilter) &&
        (emailFilter === "all" || r.emailState === emailFilter) &&
        (statusFilter === "all" || r.status === statusFilter),
    );
  }, [rows, search, typeFilter, emailFilter, statusFilter]);

  const filtering = !!search.trim() || typeFilter !== "all" || emailFilter !== "all" || statusFilter !== "all";
  const pages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // A new search or filter starts again from the first page
  useEffect(() => setPage(0), [search, typeFilter, emailFilter, statusFilter]);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setEmailFilter("all");
    setStatusFilter("all");
  };
  const showSellers = () => {
    clearFilters();
    setTypeFilter("seller");
    setView("users");
  };
  const showEveryone = () => {
    clearFilters();
    setView("users");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{title} Management</h2>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw className="mr-1 h-4 w-4" aria-hidden />{refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Users} label="All users" value={rows.length} hint="Everyone registered" onClick={showEveryone} />
        <Tile icon={UserCheck} label="Needs your decision" value={needsDecision} hint="Payments and seller applications" attention onClick={() => setView("decisions")} />
        <Tile icon={MailWarning} label="Email not confirmed" value={emailKnown ? waiting.length : null} hint="They can't sign in yet" onClick={() => setView("unconfirmed")} />
        <Tile icon={Store} label="Sellers" value={sellers} hint="Approved seller accounts" onClick={showSellers} />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="decisions">Needs your decision{needsDecision !== null ? ` (${needsDecision})` : ""}</TabsTrigger>
          <TabsTrigger value="users">All users ({rows.length})</TabsTrigger>
          <TabsTrigger value="unconfirmed">Email not confirmed{emailKnown ? ` (${waiting.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="decisions">
          <SubscriptionPaymentsAdmin onChanged={loadPayments} waitingApplications={waitingApplications} onOpenApplications={onOpenSellers} />
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="space-y-3">
              <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or business" className="pl-9" aria-label="Search users" />
                </div>
                <select aria-label="User type" className={SELECT_CLASS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
                  <option value="all">All types</option>
                  <option value="buyer">Buyers</option>
                  <option value="seller">Sellers</option>
                  <option value="admin">Admin</option>
                </select>
                <select aria-label="Email" className={SELECT_CLASS} value={emailFilter} disabled={!emailKnown} onChange={(e) => setEmailFilter(e.target.value as typeof emailFilter)}>
                  <option value="all">Any email status</option>
                  <option value="confirmed">Email confirmed</option>
                  <option value="waiting">Waiting for confirmation</option>
                </select>
                <select aria-label="Payment or request" className={SELECT_CLASS} value={statusFilter} disabled={!statusKnown} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="all">Any payment status</option>
                  {(Object.keys(STATUS_LABEL) as UserPaymentStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              {(accountsFailed || (paymentsFailed && !statusKnown)) && (
                <p role="alert" className="text-sm text-destructive">
                  Some details couldn't load, so they aren't shown. Press Refresh to try again.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {filtered.length === 0
                    ? "No users match"
                    : `Showing ${safePage * PAGE_SIZE + 1}-${safePage * PAGE_SIZE + shown.length} of ${filtered.length}`}
                </span>
                {filtering && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No users registered yet.</p>
              ) : shown.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Try another search, or clear the filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Business</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Payment or request</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell>
                            <p className="font-medium">{u.name || "—"}</p>
                            {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                          </TableCell>
                          <TableCell>
                            <span className={cn("rounded-full px-2 py-1 text-xs font-medium", u.type === "buyer" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                              {TYPE_LABEL[u.type]}
                            </span>
                          </TableCell>
                          <TableCell>{u.business || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{u.phone || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{u.joined ? new Date(u.joined).toLocaleDateString() : "—"}</TableCell>
                          <TableCell>
                            {u.emailState ? (
                              <Badge variant={u.emailState === "confirmed" ? "default" : "secondary"} className="whitespace-nowrap">
                                {u.emailState === "confirmed" ? "Confirmed" : "Waiting for confirmation"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {statusKnown ? (
                              <Badge variant={u.status === "confirmed" ? "default" : u.status === "rejected" ? "destructive" : "secondary"} className="whitespace-nowrap">
                                {u.applicationWaiting && current.get(u.userId)?.status !== "pending" ? "Seller application waiting" : STATUS_LABEL[u.status]}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {pages > 1 && (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {safePage + 1} of {pages}</span>
                  <Button size="sm" variant="outline" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unconfirmed">
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>Waiting for Confirmation{accounts ? ` (${waiting.length})` : ""}</CardTitle>
              <p className="text-sm text-muted-foreground">
                These people registered but haven't clicked the link in their confirmation email yet. This is about their
                email only, not a payment or an approval. They leave this list once they confirm.
              </p>
            </CardHeader>
            <CardContent>
              {accountsFailed ? (
                <p role="alert" className="py-6 text-center text-sm text-destructive">Couldn't load who has confirmed their email. Press Refresh to try again.</p>
              ) : !accounts ? (
                <p className="py-6 text-center text-muted-foreground">Loading…</p>
              ) : waiting.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">Everyone has confirmed their email.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Registered as</TableHead>
                        <TableHead>Registered on</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waiting.map((a) => (
                        <TableRow key={a.user_id}>
                          <TableCell className="font-medium">{a.full_name || "—"}</TableCell>
                          <TableCell>{a.email || "—"}</TableCell>
                          <TableCell>{accountLabel(a)}</TableCell>
                          <TableCell className="whitespace-nowrap">{when(a.registered_at)}</TableCell>
                          <TableCell><Badge variant="secondary" className="whitespace-nowrap">Waiting for confirmation</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminUsers;
