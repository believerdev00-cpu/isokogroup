import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Users, ShoppingCart, DollarSign, TrendingUp, Package, BookOpen, Truck, Box, Bell, Settings, FileText, Eye, Download, Film, Mic, Upload, Wallet, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import CouriersAdmin from "@/components/admin/CouriersAdmin";
import TrainingCenterAdmin from "@/components/admin/TrainingCenterAdmin";
import ServiceStaffAdmin from "@/components/admin/ServiceStaffAdmin";
import DeliveriesAnalytics from "@/components/admin/DeliveriesAnalytics";
import DataAnalysis from "@/components/admin/DataAnalysis";
import InsightsWorkspace from "@/components/admin/insights/InsightsWorkspace";
import MyOverview from "@/components/admin/MyOverview";
import AuditLogAdmin from "@/components/admin/AuditLogAdmin";
import { PaymentsPanel } from "@/features/finance/PaymentsPanel";
import type { BillableTable } from "@/features/finance/api";
import { useIsAdmin } from "@/hooks/use-is-admin";

const COLORS = ["hsl(0, 85%, 50%)", "hsl(0, 0%, 20%)", "hsl(0, 85%, 65%)", "hsl(0, 0%, 45%)", "hsl(0, 85%, 80%)"];

const Admin = () => {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [logisticsRequests, setLogisticsRequests] = useState<any[]>([]);
  const [packagingRequests, setPackagingRequests] = useState<any[]>([]);
  const [sellerApplications, setSellerApplications] = useState<any[]>([]);
  const [entertainment, setEntertainment] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [softwareBookings, setSoftwareBookings] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Book form
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookCategory, setBookCategory] = useState("Business");
  const [bookPages, setBookPages] = useState("");
  const [bookDesc, setBookDesc] = useState("");
  const [bookCoverFile, setBookCoverFile] = useState<File | null>(null);
  const [bookContentFile, setBookContentFile] = useState<File | null>(null);
  const [bookUploading, setBookUploading] = useState(false);

  // Entertainment form
  const [entForm, setEntForm] = useState({
    title: "",
    creator: "",
    type: "film" as "film" | "podcast",
    category: "trending",
    description: "",
    price: 0,
    duration: 0,
    trending: true,
  });
  const [entCoverFile, setEntCoverFile] = useState<File | null>(null);
  const [entMediaFile, setEntMediaFile] = useState<File | null>(null);
  const [entUploading, setEntUploading] = useState(false);
  const [entUploadProgress, setEntUploadProgress] = useState(0);

  // Reject dialog state
  const [rejectingApp, setRejectingApp] = useState<any | null>(null);
  const [paymentsFor, setPaymentsFor] = useState<{ table: BillableTable; id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const MAX_REASON = 500;

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    const [profilesRes, ordersRes, commissionsRes, productsRes, subsRes, booksRes, logRes, packRes, sellerRes, entRes, payoutsRes, swRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("commissions").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("logistics_requests").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("packaging_requests").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("seller_applications").select("*").order("created_at", { ascending: false }),
      supabase.from("entertainment").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("payout_requests").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("software_bookings").select("*").order("created_at", { ascending: false }),
    ]);
    setProfiles(profilesRes.data || []);
    setOrders(ordersRes.data || []);
    setCommissions(commissionsRes.data || []);
    setProducts(productsRes.data || []);
    setSubscriptions(subsRes.data || []);
    setBooks(booksRes.data || []);
    setLogisticsRequests(logRes.data || []);
    setPackagingRequests(packRes.data || []);
    setSellerApplications(sellerRes.data || []);
    setEntertainment(entRes.data || []);
    setPayouts(payoutsRes.data || []);
    setSoftwareBookings(swRes.data || []);
    // Load driver users
    const { data: driverRoles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "driver");
    if (driverRoles?.length) {
      const ids = driverRoles.map((r: any) => r.user_id);
      const { data: dProfiles } = await supabase.from("profiles").select("user_id, full_name, phone").in("user_id", ids);
      setDrivers(dProfiles || []);
    } else {
      setDrivers([]);
    }
    setLoading(false);
  };

  if (authLoading || roleLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const totalCommissions = commissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const categoryMap: Record<string, number> = {};
  products.forEach(p => { categoryMap[p.category] = (categoryMap[p.category] || 0) + 1; });
  const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  const monthlyMap: Record<string, { revenue: number; orders: number }> = {};
  orders.forEach(o => {
    const month = new Date(o.created_at).toLocaleString("default", { month: "short" });
    if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, orders: 0 };
    monthlyMap[month].revenue += o.total_amount || 0;
    monthlyMap[month].orders += 1;
  });
  const revenueData = Object.entries(monthlyMap).map(([month, d]) => ({ month, ...d }));

  const commMonthlyMap: Record<string, number> = {};
  commissions.forEach(c => {
    const month = new Date(c.created_at).toLocaleString("default", { month: "short" });
    commMonthlyMap[month] = (commMonthlyMap[month] || 0) + c.commission_amount;
  });
  const commissionData = Object.entries(commMonthlyMap).map(([month, commission]) => ({ month, commission }));

  const stats = [
    { label: t("admin.totalUsers"), value: profiles.length.toLocaleString(), icon: Users },
    { label: t("admin.totalOrders"), value: orders.length.toLocaleString(), icon: ShoppingCart },
    { label: t("admin.revenue"), value: `${totalRevenue.toLocaleString()} RWF`, icon: DollarSign },
    { label: t("admin.commission"), value: `${totalCommissions.toLocaleString()} RWF`, icon: TrendingUp },
  ];

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (!error) { toast({ title: "Updated" }); fetchAll(); }
  };

  const handleConfirmPayment = async (order: any) => {
    // The buyer's reported payment becomes a payment; the order follows it
    const { error } = await (supabase as any).rpc("confirm_order_payment", { p_order_id: order.id });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    // Buyer and seller are notified by the database (PAYMENT_SUCCESSFUL, ORDER_PAID)
    toast({ title: "Payment confirmed", description: "Seller has been notified to deliver." });
    fetchAll();
  };

  const handleUpdatePayout = async (payout: any, status: "paid" | "rejected", note?: string) => {
    const update: any = { status, admin_note: note ?? null };
    if (status === "paid") update.paid_at = new Date().toISOString();
    const { error } = await (supabase as any).from("payout_requests").update(update).eq("id", payout.id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    // The seller is notified by the database (PAYOUT_PAID / PAYOUT_REJECTED)
    toast({ title: status === "paid" ? "Marked as paid" : "Rejected" });
    fetchAll();
  };

  const handleUpdateProductStatus = async (productId: string, status: string) => {
    const { error } = await supabase.from("products").update({ status }).eq("id", productId);
    if (!error) { toast({ title: "Updated" }); fetchAll(); }
  };

  const handleDeleteProduct = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (!error) { toast({ title: "Deleted" }); fetchAll(); }
  };

  const handleDeleteBook = async (id: string) => {
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (!error) { toast({ title: "Deleted" }); fetchAll(); }
  };

  const uploadBookFile = async (file: File, prefix: string) => {
    const ext = file.name.split(".").pop();
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("books").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return supabase.storage.from("books").getPublicUrl(path).data.publicUrl;
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookContentFile) {
      toast({ title: "Book file required", description: "Upload a PDF or EPUB.", variant: "destructive" });
      return;
    }
    setBookUploading(true);
    try {
      // Upload cover and content in parallel for max speed
      const [cover_url, content_url] = await Promise.all([
        bookCoverFile ? uploadBookFile(bookCoverFile, "covers") : Promise.resolve(null),
        uploadBookFile(bookContentFile, "content"),
      ]);
      const { error } = await supabase.from("books").insert({
        title: bookTitle, author: bookAuthor, category: bookCategory,
        pages: parseInt(bookPages) || 0, description: bookDesc,
        cover_url, content_url,
      });
      if (error) throw error;
      toast({ title: "Book added!" });
      setBookTitle(""); setBookAuthor(""); setBookPages(""); setBookDesc("");
      setBookCoverFile(null); setBookContentFile(null);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBookUploading(false);
    }
  };

  // Entertainment handlers
  const uploadEntFile = async (file: File, prefix: string, onProgress?: (pct: number) => void) => {
    const ext = file.name.split(".").pop();
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const SIX_MB = 6 * 1024 * 1024;

    // Small files: use standard upload
    if (file.size <= SIX_MB) {
      const { error } = await supabase.storage.from("entertainment").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      onProgress?.(100);
      return supabase.storage.from("entertainment").getPublicUrl(path).data.publicUrl;
    }

    // Large files: resumable TUS upload
    const tusModule: any = await import("tus-js-client");
    const TusUpload = tusModule.Upload || tusModule.default?.Upload || tusModule.default;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("You must be signed in to upload.");

    const projectUrl = (supabase as any).supabaseUrl as string;

    await new Promise<void>((resolve, reject) => {
      const upload = new TusUpload(file, {
        endpoint: `${projectUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${token}`,
          "x-upsert": "false",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: "entertainment",
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024, // required by Supabase
        onError: (err) => reject(err),
        onProgress: (sent, total) => {
          onProgress?.(Math.round((sent / total) * 100));
        },
        onSuccess: () => resolve(),
      });
      upload.start();
    });

    return supabase.storage.from("entertainment").getPublicUrl(path).data.publicUrl;
  };

  const handleAddEntertainment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entForm.title.trim() || !entForm.creator.trim()) {
      toast({ title: "Missing fields", description: "Title and creator are required.", variant: "destructive" });
      return;
    }
    if (!entMediaFile) {
      toast({ title: "Media file required", description: "Upload a video or audio file.", variant: "destructive" });
      return;
    }
    setEntUploading(true);
    setEntUploadProgress(0);
    try {
      // Upload cover first (small), then media with progress tracking
      const cover_url = entCoverFile ? await uploadEntFile(entCoverFile, "covers") : null;
      const media_url = await uploadEntFile(entMediaFile, "media", (pct) => setEntUploadProgress(pct));
      const { error } = await supabase.from("entertainment").insert({
        title: entForm.title.trim(),
        creator: entForm.creator.trim(),
        type: entForm.type,
        category: entForm.category.trim() || "trending",
        description: entForm.description.trim() || null,
        price: Number(entForm.price) || 0,
        cover_url,
        media_url,
        duration_minutes: Number(entForm.duration) || 0,
        trending: entForm.trending,
      });
      if (error) throw error;
      toast({ title: "Uploaded", description: `${entForm.title} is now live.` });
      setEntForm({ title: "", creator: "", type: "film", category: "trending", description: "", price: 0, duration: 0, trending: true });
      setEntCoverFile(null);
      setEntMediaFile(null);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Try a smaller file or check your connection.", variant: "destructive" });
    } finally {
      setEntUploading(false);
      setEntUploadProgress(0);
    }
  };

  const handleDeleteEntertainment = async (id: string) => {
    const { error } = await supabase.from("entertainment").delete().eq("id", id);
    if (!error) { toast({ title: "Deleted" }); fetchAll(); }
  };

  const handleUpdateLogisticsStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("logistics_requests").update({ status }).eq("id", id);
    if (!error) { toast({ title: "Updated" }); fetchAll(); }
  };

  const handleAssignDriver = async (id: string, driver_id: string) => {
    const patch: any = { assigned_driver_id: driver_id || null };
    if (driver_id) patch.status = "assigned";
    const { error } = await (supabase as any).from("logistics_requests").update(patch).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    // Customer and driver are notified by the database (DELIVERY_DRIVER_ASSIGNED / DELIVERY_JOB_ASSIGNED)
    toast({ title: driver_id ? "Driver assigned" : "Driver unassigned" });
    fetchAll();
  };

  const pendingSubscriptionPayments = subscriptions.filter((s) => s.payment_submitted_at);

  const handleActivateSubscription = async (id: string) => {
    // Activates for 30 days and notifies the user
    const { error } = await (supabase as any).rpc("activate_subscription", { p_subscription_id: id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Subscription activated" });
    fetchAll();
  };

  const handleUpdateCommissionStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("commissions").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Commission marked as ${status}` });
    fetchAll();
  };

  const handleUpdatePackagingStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("packaging_requests").update({ status }).eq("id", id);
    if (!error) { toast({ title: "Updated" }); fetchAll(); }
  };

  const updateSoftwareBooking = async (id: string, patch: Record<string, any>, msg?: string) => {
    const { error } = await (supabase as any).from("software_bookings").update(patch).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: msg || "Updated" });
    fetchAll();
  };

  const handleSetAgreedPrice = async (b: any) => {
    const input = window.prompt("Set agreed price (RWF):", b.agreed_price?.toString() || "");
    if (input === null) return;
    const price = parseInt(input, 10);
    if (Number.isNaN(price) || price < 0) { toast({ title: "Invalid price", variant: "destructive" }); return; }
    await updateSoftwareBooking(b.id, { agreed_price: price }, "Agreed price set");
  };

  // Deposit (50%) or the rest, computed on the server from the agreed price
  const handleSoftwareInstallment = async (b: any, part: "deposit" | "final") => {
    const reference = window.prompt("Payment reference (Mobile Money or bank). Leave empty for cash.", "");
    if (reference === null) return;
    const { error } = await (supabase as any).rpc("software_record_installment", {
      p_booking_id: b.id, p_part: part, p_method: reference.trim() ? "other" : "cash", p_reference: reference.trim(),
    });
    if (error) { toast({ title: "Could not record the payment", description: error.message, variant: "destructive" }); return; }
    await updateSoftwareBooking(b.id, { status: part === "deposit" ? "in_progress" : "completed" },
      part === "deposit" ? "50% recorded — project in progress" : "Final payment recorded — completed");
  };

  const handleApproveApplication = async (app: any) => {
    // Application, seller role and the seller's notice change together on the server
    const { error } = await (supabase as any).rpc("approve_seller_application", { p_application_id: app.id });
    if (error) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Seller Approved!" });
    fetchAll();
  };

  const handleRejectApplication = (app: any) => {
    setRejectingApp(app);
    setRejectReason("");
  };

  const confirmRejectApplication = async () => {
    if (!rejectingApp) return;
    const trimmed = rejectReason.trim().slice(0, MAX_REASON);
    setRejectSubmitting(true);
    const { error } = await (supabase as any)
      .from("seller_applications")
      .update({ status: "rejected", rejection_reason: trimmed || null })
      .eq("id", rejectingApp.id);
    setRejectSubmitting(false);
    if (error) {
      toast({ title: "Reject failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Application Rejected", description: trimmed ? "Reason shared with applicant." : "No reason provided." });
    setRejectingApp(null);
    setRejectReason("");
    fetchAll();
  };

  const getSignedIdUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("id-documents")
      .createSignedUrl(path, 60 * 5); // 5 min
    if (error || !data?.signedUrl) {
      toast({ title: "Could not load document", description: error?.message || "Unknown error", variant: "destructive" });
      return null;
    }
    return data.signedUrl;
  };

  const handleViewId = async (path: string | null) => {
    if (!path) { toast({ title: "No document uploaded", variant: "destructive" }); return; }
    const url = await getSignedIdUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadId = async (path: string | null, applicantName: string) => {
    if (!path) { toast({ title: "No document uploaded", variant: "destructive" }); return; }
    const url = await getSignedIdUrl(path);
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = path.split(".").pop() || "bin";
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `id-${applicantName.replace(/[^a-z0-9]+/gi, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-10">
        <div className="container">
          <div className="mb-8">
            <h1 className="text-3xl font-display font-bold">{t("admin.title")}</h1>
            <p className="text-muted-foreground mt-1">Manage users, sellers, orders, products, library, logistics & more</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => (
              <Card key={stat.label} className="hover-lift">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <stat.icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="my" className="space-y-6">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="my">My Dashboard</TabsTrigger>
              <TabsTrigger value="data">Data Analysis</TabsTrigger>
              <TabsTrigger value="analytics">{t("admin.analytics")}</TabsTrigger>
              <TabsTrigger value="users">{t("admin.users")}</TabsTrigger>
              <TabsTrigger value="sellers">Sellers</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="orders">{t("admin.orders")}</TabsTrigger>
              <TabsTrigger value="commissions">{t("admin.commissions")}</TabsTrigger>
              <TabsTrigger value="logistics">Logistics</TabsTrigger>
              <TabsTrigger value="packaging">Packaging</TabsTrigger>
              <TabsTrigger value="couriers">Couriers</TabsTrigger>
              <TabsTrigger value="drivers">Drivers</TabsTrigger>
              <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="entertainment">Entertainment</TabsTrigger>
              <TabsTrigger value="training">Training Center</TabsTrigger>
              <TabsTrigger value="services">Travel · Consultancy · Data</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
              <TabsTrigger value="software">Software</TabsTrigger>
              <TabsTrigger value="audit">Audit log</TabsTrigger>
            </TabsList>

            <TabsContent value="my"><MyOverview /></TabsContent>
            <TabsContent value="data"><InsightsWorkspace /></TabsContent>
            <TabsContent value="couriers"><CouriersAdmin /></TabsContent>
            <TabsContent value="training"><TrainingCenterAdmin /></TabsContent>
            <TabsContent value="services"><ServiceStaffAdmin /></TabsContent>
            <TabsContent value="audit"><AuditLogAdmin /></TabsContent>
            <TabsContent value="deliveries"><DeliveriesAnalytics /></TabsContent>
            <TabsContent value="drivers">
              <Card>
                <CardHeader><CardTitle>Drivers ({drivers.length})</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Promote any registered user to driver to let them access the driver dashboard.</p>
                  <div className="space-y-2">
                    {profiles.map((p) => {
                      const isDriverUser = drivers.some((d) => d.user_id === p.user_id);
                      return (
                        <div key={p.user_id} className="flex items-center justify-between border border-border rounded-lg p-3">
                          <div>
                            <p className="font-medium text-sm">{p.full_name || p.user_id.slice(0, 8)}</p>
                            <p className="text-xs text-muted-foreground">{p.phone || "no phone"}</p>
                          </div>
                          <Button
                            size="sm"
                            variant={isDriverUser ? "outline" : "default"}
                            onClick={async () => {
                              const { error } = await (supabase as any).rpc("admin_set_driver", { p_user_id: p.user_id, p_grant: !isDriverUser });
                              if (error) toast({ title: "Could not change driver access", description: error.message, variant: "destructive" });
                              else toast({ title: isDriverUser ? "Driver removed" : "Promoted to driver" });
                              fetchAll();
                            }}
                          >
                            {isDriverUser ? "Remove driver" : "Make driver"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics */}
            <TabsContent value="analytics">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-lg">{t("admin.revenue")} (RWF)</CardTitle></CardHeader>
                  <CardContent>
                    {revenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={revenueData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
                          <XAxis dataKey="month" /><YAxis /><Tooltip />
                          <Bar dataKey="revenue" fill="hsl(0, 85%, 50%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-muted-foreground text-center py-12">No revenue data yet</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-lg">{t("admin.orders")} Trend</CardTitle></CardHeader>
                  <CardContent>
                    {revenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
                          <XAxis dataKey="month" /><YAxis /><Tooltip />
                          <Line type="monotone" dataKey="orders" stroke="hsl(0, 85%, 50%)" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <p className="text-muted-foreground text-center py-12">No order data yet</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-lg">Products by Category</CardTitle></CardHeader>
                  <CardContent>
                    {categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {categoryData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <p className="text-muted-foreground text-center py-12">No product data yet</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-lg">{t("admin.commission")} Trend</CardTitle></CardHeader>
                  <CardContent>
                    {commissionData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={commissionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
                          <XAxis dataKey="month" /><YAxis /><Tooltip />
                          <Bar dataKey="commission" fill="hsl(0, 0%, 20%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-muted-foreground text-center py-12">No commission data yet</p>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Users */}
            <TabsContent value="users" className="space-y-6">
              {pendingSubscriptionPayments.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Subscription payments to confirm ({pendingSubscriptionPayments.length})</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingSubscriptionPayments.map((s) => {
                          const owner = profiles.find((p) => p.user_id === s.user_id);
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">{owner?.full_name || s.user_id.slice(0, 8)}</TableCell>
                              <TableCell className="font-mono">{s.payment_reference}</TableCell>
                              <TableCell>{new Date(s.payment_submitted_at).toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" onClick={() => handleActivateSubscription(s.id)}>Confirm payment</Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader><CardTitle>{t("admin.users")} Management ({profiles.length})</CardTitle></CardHeader>
                <CardContent>
                  {profiles.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No users registered yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Business</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profiles.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.role === "seller" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                {u.role}
                              </span>
                            </TableCell>
                            <TableCell>{u.business_name || "—"}</TableCell>
                            <TableCell>{u.phone || "—"}</TableCell>
                            <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sellers / Applications */}
            <TabsContent value="sellers">
              <Card>
                <CardHeader><CardTitle>Seller Applications ({sellerApplications.length})</CardTitle></CardHeader>
                <CardContent>
                  {sellerApplications.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No seller applications yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Business</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>ID Number</TableHead>
                          <TableHead>ID Document</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sellerApplications.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.full_name}</TableCell>
                            <TableCell>{a.business_name}</TableCell>
                            <TableCell>{a.email || "—"}</TableCell>
                            <TableCell>{a.phone}</TableCell>
                            <TableCell className="font-mono text-xs">{a.id_number}</TableCell>
                            <TableCell>
                              {a.id_document_url ? (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 h-8 px-2"
                                    onClick={() => handleViewId(a.id_document_url)}
                                    title="View document"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">View</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 h-8 px-2"
                                    onClick={() => handleDownloadId(a.id_document_url, a.full_name)}
                                    title="Download document"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Download</span>
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No document</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                a.status === "approved" ? "bg-green-100 text-green-700" :
                                a.status === "rejected" ? "bg-destructive/10 text-destructive" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>{a.status}</span>
                            </TableCell>
                            <TableCell>
                              {a.status === "pending" ? (
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleApproveApplication(a)}>Approve</Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleRejectApplication(a)}>Reject</Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Products */}
            <TabsContent value="products">
              <Card>
                <CardHeader><CardTitle>Product Management ({products.length})</CardTitle></CardHeader>
                <CardContent>
                  {products.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No products yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Image</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              {p.image_url ? <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded object-cover" /> :
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
                            </TableCell>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>{p.category}</TableCell>
                            <TableCell>{p.price?.toLocaleString()} RWF</TableCell>
                            <TableCell>{p.stock}</TableCell>
                            <TableCell>
                              <select value={p.status} onChange={(e) => handleUpdateProductStatus(p.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="pending">Pending</option>
                              </select>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteProduct(p.id)}>Delete</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Orders */}
            <TabsContent value="orders">
              <Card>
                <CardHeader><CardTitle>{t("admin.orders")} Tracking ({orders.length})</CardTitle></CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No orders yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Ref</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium">{o.id.slice(0, 8)}...</TableCell>
                            <TableCell>{(o.total_amount || 0).toLocaleString()} RWF</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                o.payment_status === "paid" ? "bg-green-500/15 text-green-500" :
                                "bg-yellow-500/15 text-yellow-500"
                              }`}>
                                {o.payment_method || "—"} · {o.payment_status || "unpaid"}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{o.payment_reference || "—"}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                o.status === "delivered" ? "bg-green-500/15 text-green-500" :
                                o.status === "shipped" ? "bg-blue-500/15 text-blue-500" :
                                "bg-yellow-500/15 text-yellow-500"
                              }`}>{o.status}</span>
                            </TableCell>
                            <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="space-y-1">
                              <select value={o.status} onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background block">
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="shipped">Shipped</option>
                                <option value="delivered">Delivered</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                              {o.payment_status === "awaiting_confirmation" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 w-full" onClick={() => handleConfirmPayment(o)}>
                                  <CheckCircle className="h-3 w-3" /> Confirm payment
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-xs w-full"
                                onClick={() => setPaymentsFor({ table: "orders", id: o.id, title: `Order #${o.id.slice(0, 8)}` })}>
                                Payments
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Commissions */}
            <TabsContent value="commissions">
              <Card>
                <CardHeader><CardTitle>{t("admin.commissions")} Report ({commissions.length})</CardTitle></CardHeader>
                <CardContent>
                  {commissions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No commission records yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Sale Amount</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commissions.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{c.order_id.slice(0, 8)}...</TableCell>
                            <TableCell>{c.sale_amount.toLocaleString()} RWF</TableCell>
                            <TableCell>{c.commission_rate}%</TableCell>
                            <TableCell className="text-primary font-medium">{c.commission_amount.toLocaleString()} RWF</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === "paid" ? "bg-green-100 text-green-700" : c.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {c.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <select
                                value={c.status}
                                onChange={(e) => handleUpdateCommissionStatus(c.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background"
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Logistics */}
            <TabsContent value="logistics">
              <Card>
                <CardHeader><CardTitle>Logistics Requests ({logisticsRequests.length})</CardTitle></CardHeader>
                <CardContent>
                  {logisticsRequests.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No logistics requests yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pickup</TableHead>
                          <TableHead>Drop-off</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logisticsRequests.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="max-w-[150px] truncate">{r.pickup}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{r.dropoff}</TableCell>
                            <TableCell>{r.weight || "—"} kg</TableCell>
                            <TableCell>{r.preferred_date || "—"}</TableCell>
                            <TableCell>
                              <select
                                value={r.assigned_driver_id || ""}
                                onChange={(e) => handleAssignDriver(r.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background min-w-[110px]"
                              >
                                <option value="">Unassigned</option>
                                {drivers.map((d) => (
                                  <option key={d.user_id} value={d.user_id}>{d.full_name || d.user_id.slice(0, 6)}</option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                r.status === "delivered" || r.status === "completed" ? "bg-green-100 text-green-700" :
                                r.status === "in_progress" || r.status === "assigned" ? "bg-blue-100 text-blue-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>{r.status}</span>
                            </TableCell>
                            <TableCell>
                              <select value={r.status} onChange={(e) => handleUpdateLogisticsStatus(r.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background">
                                <option value="pending">Pending</option>
                                <option value="assigned">Assigned</option>
                                <option value="in_progress">In Progress</option>
                                <option value="delivered">Delivered</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Packaging */}
            <TabsContent value="packaging">
              <Card>
                <CardHeader><CardTitle>Packaging Requests ({packagingRequests.length})</CardTitle></CardHeader>
                <CardContent>
                  {packagingRequests.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No packaging requests yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Pickup Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {packagingRequests.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.item_description}</TableCell>
                            <TableCell>{r.quantity}</TableCell>
                            <TableCell>{r.packaging_type}</TableCell>
                            <TableCell>{r.pickup_date || "—"}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                r.status === "completed" ? "bg-green-100 text-green-700" :
                                r.status === "processing" ? "bg-blue-100 text-blue-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>{r.status}</span>
                            </TableCell>
                            <TableCell>
                              <select value={r.status} onChange={(e) => handleUpdatePackagingStatus(r.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background">
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Library */}
            <TabsContent value="library">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Library Management ({books.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddBook} className="mb-6 p-4 border border-border rounded-lg space-y-4">
                    <h3 className="font-semibold">Add New Book</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Author</Label>
                        <Input value={bookAuthor} onChange={(e) => setBookAuthor(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <select value={bookCategory} onChange={(e) => setBookCategory(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                          {["Business", "Technology", "History", "Self-Help", "Science", "Literature"].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pages</Label>
                        <Input type="number" value={bookPages} onChange={(e) => setBookPages(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={bookDesc} onChange={(e) => setBookDesc(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Cover image</Label>
                        <Input type="file" accept="image/*" onChange={(e) => setBookCoverFile(e.target.files?.[0] || null)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Book file (PDF / EPUB)</Label>
                        <Input type="file" accept="application/pdf,application/epub+zip,.epub" onChange={(e) => setBookContentFile(e.target.files?.[0] || null)} required />
                      </div>
                    </div>
                    <Button type="submit" disabled={bookUploading}>
                      {bookUploading ? "Uploading..." : "Add Book"}
                    </Button>
                  </form>

                  {books.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No books in library yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Author</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Pages</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {books.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.title}</TableCell>
                            <TableCell>{b.author}</TableCell>
                            <TableCell>{b.category}</TableCell>
                            <TableCell>{b.pages}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteBook(b.id)}>Delete</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Entertainment */}
            <TabsContent value="entertainment">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="h-5 w-5 text-primary" /> Entertainment ({entertainment.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddEntertainment} className="mb-6 p-4 border border-border rounded-lg space-y-4">
                    <h3 className="font-semibold flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> Upload film or podcast</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={entForm.title} onChange={(e) => setEntForm({ ...entForm, title: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Creator</Label>
                        <Input value={entForm.creator} onChange={(e) => setEntForm({ ...entForm, creator: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={entForm.type} onValueChange={(v: "film" | "podcast") => setEntForm({ ...entForm, type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="film">Film</SelectItem>
                            <SelectItem value="podcast">Podcast</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Input value={entForm.category} onChange={(e) => setEntForm({ ...entForm, category: e.target.value })} placeholder="trending, drama, tech..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Price (RWF)</Label>
                        <Input type="number" min={0} value={entForm.price} onChange={(e) => setEntForm({ ...entForm, price: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Duration (minutes)</Label>
                        <Input type="number" min={0} value={entForm.duration} onChange={(e) => setEntForm({ ...entForm, duration: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea rows={3} value={entForm.description} onChange={(e) => setEntForm({ ...entForm, description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Cover image</Label>
                        <Input type="file" accept="image/*" onChange={(e) => setEntCoverFile(e.target.files?.[0] || null)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Media file (any video or audio format)</Label>
                        <Input type="file" accept="video/*,audio/*,.mkv,.mov,.avi,.wmv,.flv,.webm,.mp4,.m4v,.mpg,.mpeg,.3gp,.ogv,.ts,.mts,.m4a,.aac,.wav,.flac,.ogg,.opus,.wma" onChange={(e) => setEntMediaFile(e.target.files?.[0] || null)} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={entForm.trending} onChange={(e) => setEntForm({ ...entForm, trending: e.target.checked })} />
                      Mark as trending
                    </label>
                    <Button type="submit" disabled={entUploading}>
                      {entUploading ? (entUploadProgress > 0 ? `Uploading... ${entUploadProgress}%` : "Uploading...") : "Upload"}
                    </Button>
                  </form>

                  {entertainment.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No films or podcasts uploaded yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Creator</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Trending</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entertainment.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell className="font-medium">{it.title}</TableCell>
                            <TableCell>{it.creator}</TableCell>
                            <TableCell className="capitalize">{it.type}</TableCell>
                            <TableCell>{it.category}</TableCell>
                            <TableCell>{it.price > 0 ? `${it.price} RWF` : "Free"}</TableCell>
                            <TableCell>{it.trending ? "Yes" : "No"}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteEntertainment(it.id)}>Delete</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payouts */}
            <TabsContent value="payouts">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Seller payout requests ({payouts.length})</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Review payouts requested by sellers after buyers confirmed delivery. Pay them outside the platform, then mark as paid here.
                  </p>
                </CardHeader>
                <CardContent>
                  {payouts.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No payout requests yet.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Commission (7%)</TableHead>
                        <TableHead>Net to pay</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {payouts.map((p) => {
                          const sellerProfile = profiles.find((pr) => pr.user_id === p.seller_id);
                          return (
                            <TableRow key={p.id}>
                              <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                              <TableCell className="text-xs">{sellerProfile?.full_name || sellerProfile?.business_name || p.seller_id.slice(0, 8)}…</TableCell>
                              <TableCell className="font-mono text-xs">{p.order_id?.slice(0, 8) || "—"}…</TableCell>
                              <TableCell>{p.gross_amount.toLocaleString()} RWF</TableCell>
                              <TableCell className="text-destructive">-{p.commission_amount.toLocaleString()} RWF</TableCell>
                              <TableCell className="text-primary font-semibold">{p.net_amount.toLocaleString()} RWF</TableCell>
                              <TableCell className="capitalize">{p.payout_method}</TableCell>
                              <TableCell className="font-mono text-xs">{p.payout_destination}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === "paid" ? "bg-green-500/15 text-green-500" : p.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-yellow-500/15 text-yellow-500"}`}>
                                  {p.status}
                                </span>
                              </TableCell>
                              <TableCell>
                                {p.status === "pending" && (
                                  <div className="flex gap-1">
                                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleUpdatePayout(p, "paid")}>
                                      <CheckCircle className="h-3 w-3" /> Mark paid
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleUpdatePayout(p, "rejected", "Please contact support")}>Reject</Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="software">
              <Card>
                <CardHeader><CardTitle>Software Bookings ({softwareBookings.length})</CardTitle></CardHeader>
                <CardContent>
                  {softwareBookings.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No bookings yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Budget</TableHead>
                          <TableHead>Agreed</TableHead>
                          <TableHead>Payments</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {softwareBookings.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell>
                              <div className="font-medium">{b.full_name}</div>
                              <div className="text-xs text-muted-foreground">{b.email} · {b.phone}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2 max-w-xs mt-1">{b.project_description}</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{b.service_type}</TableCell>
                            <TableCell className="text-xs">{b.budget_range || "—"}</TableCell>
                            <TableCell className="text-xs">
                              {b.agreed_price ? `${b.agreed_price.toLocaleString()} RWF` : "—"}
                            </TableCell>
                            <TableCell className="text-xs space-y-1">
                              <div className={b.deposit_paid ? "text-green-600" : "text-muted-foreground"}>
                                50%: {b.deposit_paid ? "Paid" : "Pending"}
                              </div>
                              <div className={b.final_paid ? "text-green-600" : "text-muted-foreground"}>
                                Final: {b.final_paid ? "Paid" : "Pending"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                b.status === "completed" ? "bg-green-100 text-green-700" :
                                b.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                                b.status === "approved" ? "bg-purple-100 text-purple-700" :
                                b.status === "cancelled" ? "bg-red-100 text-red-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>{b.status.replace("_", " ")}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 min-w-[160px]">
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => handleSetAgreedPrice(b)}>Set Price</Button>
                                {b.status === "pending" && (
                                  <Button size="sm" className="h-7 text-xs"
                                    onClick={() => updateSoftwareBooking(b.id, { status: "approved" }, "Project approved")}>
                                    Approve
                                  </Button>
                                )}
                                {b.agreed_price && !b.deposit_paid && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs"
                                    onClick={() => handleSoftwareInstallment(b, "deposit")}>
                                    Mark 50% Paid
                                  </Button>
                                )}
                                {b.deposit_paid && !b.final_paid && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs"
                                    onClick={() => handleSoftwareInstallment(b, "final")}>
                                    Mark Final Paid
                                  </Button>
                                )}
                                {b.agreed_price && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs"
                                    onClick={() => setPaymentsFor({ table: "software_bookings", id: b.id, title: `Software · ${b.full_name}` })}>
                                    Payments
                                  </Button>
                                )}
                                {b.status !== "completed" && b.status !== "cancelled" && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                                    onClick={() => updateSoftwareBooking(b.id, { status: "cancelled" }, "Cancelled")}>
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>
      <Footer />

      {/* Reject application dialog with optional reason */}
      <Dialog open={!!paymentsFor} onOpenChange={(open) => { if (!open) { setPaymentsFor(null); fetchAll(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{paymentsFor?.title}</DialogTitle>
            <DialogDescription>Payments, refunds and adjustments. Every change is kept in the ledger and the audit log.</DialogDescription>
          </DialogHeader>
          {paymentsFor && <PaymentsPanel entityTable={paymentsFor.table} entityId={paymentsFor.id} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectingApp} onOpenChange={(open) => { if (!open) { setRejectingApp(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Seller Application</DialogTitle>
            <DialogDescription>
              {rejectingApp ? (
                <>You are about to reject <span className="font-medium text-foreground">{rejectingApp.full_name}</span>'s application{rejectingApp.business_name ? ` for ${rejectingApp.business_name}` : ""}.</>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. ID document is unclear, name does not match, missing details…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value.slice(0, MAX_REASON))}
              rows={4}
              maxLength={MAX_REASON}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>This reason will be shown to the applicant.</span>
              <span>{rejectReason.length}/{MAX_REASON}</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setRejectingApp(null); setRejectReason(""); }} disabled={rejectSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRejectApplication} disabled={rejectSubmitting}>
              {rejectSubmitting ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
