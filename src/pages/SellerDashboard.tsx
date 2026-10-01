import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Package, ShoppingCart, DollarSign, TrendingUp, Plus, Upload, User, Bell, Wallet, Pencil, Lock, FileText, X, Image as ImageIcon } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useSiteSettings } from "@/lib/siteSettings";
import ShipmentDialog from "@/components/ShipmentDialog";
import ProductImagesDialog from "@/components/ProductImagesDialog";
import { productImages as imagesOf } from "@/lib/productImages";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck } from "lucide-react";
import { AGREEMENT_CHECKBOX_LABEL, COUNTRIES, MAX_PRODUCT_IMAGES, PAYMENT_PROVIDERS, SELLER_AGREEMENT_VERSION } from "@/lib/sellerAgreement";

const categories = ["Electronics", "Fashion", "Food & Drink", "Crafts", "Home", "Accessories"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB each
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
// a MoMo provider pays out by MoMo, anything else by bank
const isMobileMoney = (provider: string) => /momo|mobile|airtel|mtn/i.test(provider);

const SellerDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  // the marketplace commission (Admin > Settings); each order keeps the rate it was placed at
  const { commissionPercent } = useSiteSettings();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [shipmentOrder, setShipmentOrder] = useState<{ id: string } | null>(null);
  // the product whose images are being edited (add, remove, replace, reorder; at most four)
  const [imagesProduct, setImagesProduct] = useState<any>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isApprovedSeller, setIsApprovedSeller] = useState(false);
  const [sellerAppStatus, setSellerAppStatus] = useState<string | null>(null);
  // the seller's latest application: their record, their agreement and their private payout details
  const [sellerApp, setSellerApp] = useState<any>(null);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<"momo" | "bank">("momo");
  const [payoutDestination, setPayoutDestination] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");

  // Product form
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState(categories[0]);
  const [productStock, setProductStock] = useState("");
  const [productImages, setProductImages] = useState<File[]>([]);
  // editing one product's price and stock in the table
  const [editingProduct, setEditingProduct] = useState<{ id: string; price: string; stock: string } | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  // Profile form
  const [editFullName, setEditFullName] = useState("");
  const [editBusiness, setEditBusiness] = useState("");
  const [editPhone, setEditPhone] = useState("");
  // Private business and payout details (sections 7 and 9 of the agreement)
  const [editCountry, setEditCountry] = useState("");
  const [editTin, setEditTin] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editProvider, setEditProvider] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editAccountName, setEditAccountName] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [productsRes, ordersRes, commissionsRes, profileRes, payoutsRes, appRes] = await Promise.all([
      supabase.from("products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("commissions").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      (supabase as any).from("payout_requests").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("seller_applications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const approved = appRes.data?.status === "approved";
    setIsApprovedSeller(approved);
    setSellerAppStatus(appRes.data?.status ?? null);
    const app: any = appRes.data;
    setSellerApp(app);
    if (app) {
      setEditCountry(app.country || "");
      setEditTin(app.tin || "");
      setEditAddress(app.business_address || "");
      setEditProvider(app.payment_provider || "");
      setEditAccount(app.payment_account || "");
      setEditAccountName(app.payment_account_name || "");
      // payouts go to the details the seller registered (they can still change them for one request)
      if (app.payment_account) {
        const momo = isMobileMoney(app.payment_provider || "");
        setPayoutMethod(momo ? "momo" : "bank");
        setPayoutDestination(momo ? app.payment_account : `${app.payment_provider} · ${app.payment_account}`);
        setPayoutAccountName(app.payment_account_name || "");
      }
    }
    if (!approved) setShowAddProduct(false);
    setProducts(productsRes.data || []);
    setOrders(ordersRes.data || []);
    setCommissions(commissionsRes.data || []);
    setPayouts(payoutsRes.data || []);
    if (profileRes.data) {
      setProfile(profileRes.data);
      setEditFullName(profileRes.data.full_name || "");
      setEditBusiness(profileRes.data.business_name || "");
      setEditPhone(profileRes.data.phone || "");
    }
    setLoading(false);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!isApprovedSeller) {
      toast({ title: "Not approved yet", description: "Only approved sellers can add products.", variant: "destructive" });
      return;
    }
    if (productImages.length > MAX_PRODUCT_IMAGES) {
      toast({ title: "Too many images", description: `A product has at most ${MAX_PRODUCT_IMAGES} images.`, variant: "destructive" });
      return;
    }
    setUploading(true);
    // Up to four images, in the order chosen; the first is the one the marketplace shows
    const imageUrls: string[] = [];
    for (const [i, file] of productImages.entries()) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${i}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
      if (uploadErr) {
        setUploading(false);
        toast({ title: "Image upload failed", description: `${file.name}: ${uploadErr.message}`, variant: "destructive" });
        return;
      }
      imageUrls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }
    const { error } = await supabase.from("products").insert({
      seller_id: user.id, name: productName, description: productDesc,
      price: parseInt(productPrice), category: productCategory,
      stock: parseInt(productStock) || 0, image_url: imageUrls[0] ?? null, image_urls: imageUrls,
    });
    setUploading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Product added!" });
      setShowAddProduct(false);
      setProductName(""); setProductDesc(""); setProductPrice(""); setProductStock(""); setProductImages([]);
      fetchData();
    }
  };

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const next = [...productImages];
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        toast({ title: "Not an image", description: f.name, variant: "destructive" });
        continue;
      }
      if (f.size > MAX_IMAGE_SIZE) {
        toast({ title: "Image too large", description: `${f.name} is over 5MB.`, variant: "destructive" });
        continue;
      }
      if (next.length >= MAX_PRODUCT_IMAGES) {
        toast({ title: `Maximum ${MAX_PRODUCT_IMAGES} images`, description: "The Seller Agreement allows at most four images per product.", variant: "destructive" });
        break;
      }
      next.push(f);
    }
    setProductImages(next);
    e.target.value = "";
  };

  const handleDeleteProduct = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (!error) { toast({ title: "Deleted" }); fetchData(); }
  };

  // Section 5: the seller keeps price and stock accurate
  const handleSaveProduct = async () => {
    if (!editingProduct) return;
    const price = parseInt(editingProduct.price);
    const stock = parseInt(editingProduct.stock);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) {
      toast({ title: "Enter a price and a stock of 0 or more", variant: "destructive" });
      return;
    }
    setSavingProduct(true);
    const { error } = await supabase.from("products").update({ price, stock }).eq("id", editingProduct.id);
    setSavingProduct(false);
    if (error) {
      toast({ title: "Could not update the product", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product updated", description: stock === 0 ? "Stock is 0: customers see it as unavailable." : undefined });
    setEditingProduct(null);
    fetchData();
  };

  // Sellers approved before the agreement accept it here
  const handleAcceptAgreement = async () => {
    if (!agreeChecked) {
      toast({ title: "Tick the box first", description: "Please read the agreement and confirm you agree.", variant: "destructive" });
      return;
    }
    setAccepting(true);
    const { error } = await (supabase as any).rpc("accept_seller_agreement");
    setAccepting(false);
    if (error) {
      toast({ title: "Could not record your acceptance", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Thank you", description: "Your acceptance of the Seller Agreement is recorded." });
    fetchData();
  };

  // Section 9: the seller keeps country, TIN, address and payout details up to date
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    const { error } = await (supabase as any).rpc("update_seller_details", {
      p_country: editCountry.trim(), p_tin: editTin.trim(), p_business_address: editAddress.trim(),
      p_payment_provider: editProvider.trim(), p_payment_account: editAccount.trim(), p_payment_account_name: editAccountName.trim(),
    });
    setSavingDetails(false);
    if (error) {
      toast({ title: "Could not save your details", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Details updated", description: "ISOKO will use these for verification and approved payouts." });
    fetchData();
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    const { error } = await (supabase as any).rpc("seller_set_order_status", { p_order_id: orderId, p_status: newStatus });
    if (error) toast({ title: "Could not update the order", description: error.message, variant: "destructive" });
    else toast({ title: "Updated" });
    fetchData();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({
      full_name: editFullName, business_name: editBusiness, phone: editPhone,
    }).eq("id", profile.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile Updated!" });
      fetchData();
    }
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const totalSales = deliveredOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalCommission = commissions.reduce((sum, c) => sum + c.commission_amount, 0);
  const netEarnings = totalSales - totalCommission;
  const requestedOrderIds = new Set(payouts.map((p) => p.order_id).filter(Boolean));
  const eligibleOrders = deliveredOrders.filter((o) => o.payment_status === "paid" && !requestedOrderIds.has(o.id));

  const requestPayout = async (order: any) => {
    if (!user) return;
    if (!payoutDestination.trim()) {
      toast({ title: "Payout destination required", description: "Enter your MoMo number or bank account first.", variant: "destructive" });
      return;
    }
    if (!payoutAccountName.trim()) {
      toast({ title: "Account holder name required", description: "Enter the full name on your MoMo or bank account.", variant: "destructive" });
      return;
    }
    // The server works out the amounts from the order and its recorded commission
    const { data, error } = await (supabase as any).rpc("request_payout", {
      p_order_id: order.id,
      p_payout_method: payoutMethod,
      p_payout_destination: `${payoutAccountName.trim()} · ${payoutDestination.trim()}`,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payout requested", description: `${Number(data.net_amount).toLocaleString()} RWF — admin will process it shortly.` });
    fetchData();
  };

  const monthlyData = orders.reduce((acc: any[], order) => {
    const month = new Date(order.created_at).toLocaleString("default", { month: "short" });
    const existing = acc.find(a => a.month === month);
    if (existing) { existing.sales += order.total_amount; existing.orders += 1; }
    else { acc.push({ month, sales: order.total_amount, orders: 1 }); }
    return acc;
  }, []);

  const productPopularity = products.map(p => ({ name: p.name.slice(0, 15), stock: p.stock }));

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-10">
        <div className="container">
          <div className="mb-8">
            <h1 className="text-3xl font-display font-bold">Seller Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your products, orders, earnings, and profile</p>
          </div>

          {/* Sellers from before the Seller Agreement (or an older version of it) accept the current one here */}
          {sellerApp && sellerApp.status !== "rejected" && sellerApp.agreement_version !== SELLER_AGREEMENT_VERSION && (
            <Card className="mb-8 border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Seller Registration and Compliance Agreement</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Every ISOKO seller agrees to the Seller Agreement: accurate products, prices and stock, at most {MAX_PRODUCT_IMAGES} images per
                  product, private payout details, and sales through ISOKO. Please{" "}
                  <Link to="/seller-agreement" target="_blank" rel="noreferrer" className="text-primary underline">read it</Link> and confirm.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <label htmlFor="agree-now" className="flex items-start gap-3 cursor-pointer">
                  <Checkbox id="agree-now" checked={agreeChecked} onCheckedChange={(v) => setAgreeChecked(v === true)} className="mt-0.5" />
                  <span className="text-sm font-medium">{AGREEMENT_CHECKBOX_LABEL}</span>
                </label>
                <Button onClick={handleAcceptAgreement} disabled={accepting || !agreeChecked}>{accepting ? "Saving..." : "I agree"}</Button>
                {!sellerApp.payment_account && (
                  <p className="text-xs text-muted-foreground">
                    Then add your TIN, business address and payout details under <span className="font-medium">Profile</span>.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Products", value: products.length, icon: Package },
              { label: "Orders", value: orders.length, icon: ShoppingCart },
              { label: "Total Sales", value: `${totalSales.toLocaleString()} RWF`, icon: DollarSign },
              { label: "Net Earnings", value: `${netEarnings.toLocaleString()} RWF`, icon: TrendingUp },
            ].map((stat) => (
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

          <Tabs defaultValue="products" className="space-y-6">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="earnings">Earnings</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>

            {/* Products Tab */}
            <TabsContent value="products">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>My Products</CardTitle>
                  {isApprovedSeller && (
                    <Button size="sm" onClick={() => setShowAddProduct(!showAddProduct)} className="gap-2">
                      <Plus className="h-4 w-4" /> Add Product
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {!isApprovedSeller && (
                    <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 text-sm">
                      {sellerAppStatus === "pending" ? (
                        <p>Your seller application is <span className="font-semibold">pending review</span>. You'll be able to add products once an admin approves your account.</p>
                      ) : sellerAppStatus === "rejected" ? (
                        <p>Your seller application was <span className="font-semibold">rejected</span>. Please contact support or re-apply to start selling.</p>
                      ) : (
                        <p>Only approved sellers can add products. <a href="/become-seller" className="text-primary underline">Apply to become a seller</a> to get started.</p>
                      )}
                    </div>
                  )}
                  {isApprovedSeller && showAddProduct && (
                    <form onSubmit={handleAddProduct} className="mb-6 p-4 border border-border rounded-lg space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Product Name</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} required /></div>
                        <div className="space-y-2"><Label>Category</Label>
                          <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2"><Label>Additional information about the product</Label><Input value={productDesc} onChange={(e) => setProductDesc(e.target.value)} placeholder="Size, material, what is included…" maxLength={1000} /></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Price (RWF)</Label><Input type="number" min={0} value={productPrice} onChange={(e) => setProductPrice(e.target.value)} required /></div>
                        <div className="space-y-2"><Label>Available stock</Label><Input type="number" min={0} value={productStock} onChange={(e) => setProductStock(e.target.value)} required /></div>
                      </div>
                      <div className="space-y-2">
                        <Label>Product images (maximum {MAX_PRODUCT_IMAGES})</Label>
                        <p className="text-xs text-muted-foreground">JPG, PNG or WEBP, up to 5MB each. The first image is the one customers see in the marketplace.</p>
                        <Input type="file" accept="image/*" multiple onChange={handleImagesChange} disabled={productImages.length >= MAX_PRODUCT_IMAGES} />
                        {productImages.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {productImages.map((f, i) => (
                              <div key={`${f.name}-${i}`} className="relative">
                                <img src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-16 rounded object-cover border border-border" />
                                <button
                                  type="button"
                                  onClick={() => setProductImages(productImages.filter((_, j) => j !== i))}
                                  className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 text-muted-foreground hover:text-destructive"
                                  aria-label={`Remove ${f.name}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            <p className="w-full text-xs text-muted-foreground">{productImages.length} of {MAX_PRODUCT_IMAGES} images</p>
                          </div>
                        )}
                      </div>
                      <Button type="submit" disabled={uploading} className="gap-2"><Upload className="h-4 w-4" />{uploading ? "Uploading..." : "Add Product"}</Button>
                    </form>
                  )}
                  {products.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No products yet. Add your first product!</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Image</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead>
                        <TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {products.map((p) => {
                          const images = imagesOf(p);
                          const editing = editingProduct?.id === p.id;
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                {images.length === 0 ? (
                                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <img src={images[0]} alt={p.name} className="h-10 w-10 rounded object-cover" />
                                    {images.length > 1 && <span className="text-xs text-muted-foreground">+{images.length - 1}</span>}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell>{p.category}</TableCell>
                              <TableCell>
                                {editing ? (
                                  <Input type="number" min={0} className="h-8 w-28" value={editingProduct.price}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })} />
                                ) : `${p.price.toLocaleString()} RWF`}
                              </TableCell>
                              <TableCell>
                                {editing ? (
                                  <Input type="number" min={0} className="h-8 w-20" value={editingProduct.stock}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} />
                                ) : p.stock === 0 ? <span className="text-destructive font-medium">0 (out of stock)</span> : p.stock}
                              </TableCell>
                              <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{p.status}</span></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {editing ? (
                                    <>
                                      <Button size="sm" onClick={handleSaveProduct} disabled={savingProduct}>{savingProduct ? "Saving..." : "Save"}</Button>
                                      <Button size="sm" variant="outline" onClick={() => setEditingProduct(null)}>Cancel</Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditingProduct({ id: p.id, price: String(p.price), stock: String(p.stock) })}>
                                        <Pencil className="h-3 w-3" /> Price / stock
                                      </Button>
                                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setImagesProduct(p)}>
                                        <ImageIcon className="h-3 w-3" /> Images
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => handleDeleteProduct(p.id)}>Delete</Button>
                                    </>
                                  )}
                                </div>
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

            {/* Orders Tab */}
            <TabsContent value="orders">
              <Card>
                <CardHeader><CardTitle>Order Management</CardTitle></CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No orders yet.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Order ID</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {orders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium">{o.id.slice(0, 8)}...</TableCell>
                            <TableCell>{o.total_amount.toLocaleString()} RWF</TableCell>
                            <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${o.status === "delivered" ? "bg-green-100 text-green-700" : o.status === "shipped" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>{o.status}</span></TableCell>
                            <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <select value={o.status} onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
                                  {/* Only the buyer confirms delivery; "delivered" shows once they do */}
                                  <option value="pending" disabled>Pending</option><option value="processing">Processing</option>
                                  <option value="shipped">Shipped</option>
                                  <option value="delivered" disabled>Delivered (buyer confirms)</option><option value="cancelled">Cancelled</option>
                                </select>
                                <Button size="sm" variant="outline" onClick={() => setShipmentOrder({ id: o.id })}>
                                  <Truck className="h-3 w-3 mr-1" /> Manage
                                </Button>
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

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Sales Trend</CardTitle></CardHeader>
                  <CardContent>
                    {monthlyData.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No sales data yet.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
                          <XAxis dataKey="month" /><YAxis /><Tooltip />
                          <Bar dataKey="sales" fill="hsl(0, 85%, 50%)" radius={[4, 4, 0, 0]} name="Sales (RWF)" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Product Stock Levels</CardTitle></CardHeader>
                  <CardContent>
                    {productPopularity.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No products yet.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={productPopularity}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
                          <XAxis dataKey="name" /><YAxis /><Tooltip />
                          <Bar dataKey="stock" fill="hsl(0, 0%, 20%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Earnings Tab */}
            <TabsContent value="earnings">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="hover-lift"><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Gross Sales</p><p className="text-2xl font-bold text-primary mt-1">{totalSales.toLocaleString()} RWF</p></CardContent></Card>
                <Card className="hover-lift"><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Platform Commission (7%)</p><p className="text-2xl font-bold text-destructive mt-1">-{totalCommission.toLocaleString()} RWF</p></CardContent></Card>
                <Card className="hover-lift"><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Net Earnings</p><p className="text-2xl font-bold mt-1">{netEarnings.toLocaleString()} RWF</p></CardContent></Card>
              </div>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Commission Breakdown (7% per Order)</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">A 7% commission is deducted from each completed sale. Below is the per-order breakdown of your earnings.</p>
                </CardHeader>
                <CardContent>
                  {commissions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No commission records yet. Earnings appear here once orders are placed.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Sale Amount</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>You Receive</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {commissions.map((c) => {
                          const youReceive = c.sale_amount - c.commission_amount;
                          return (
                            <TableRow key={c.id} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="font-mono text-xs">{c.order_id.slice(0, 8)}…</TableCell>
                              <TableCell>{c.sale_amount.toLocaleString()} RWF</TableCell>
                              <TableCell><span className="px-2 py-0.5 rounded-full bg-muted text-xs">{c.commission_rate}%</span></TableCell>
                              <TableCell className="text-destructive font-medium">-{c.commission_amount.toLocaleString()} RWF</TableCell>
                              <TableCell className="text-primary font-semibold">{youReceive.toLocaleString()} RWF</TableCell>
                              <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{c.status}</span></TableCell>
                              <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <tfoot className="border-t-2 border-border">
                        <tr className="font-semibold">
                          <td className="p-3 text-sm">TOTALS</td>
                          <td className="p-3 text-sm">{totalSales.toLocaleString()} RWF</td>
                          <td className="p-3"></td>
                          <td className="p-3 text-sm text-destructive">-{totalCommission.toLocaleString()} RWF</td>
                          <td className="p-3 text-sm text-primary">{netEarnings.toLocaleString()} RWF</td>
                          <td className="p-3"></td>
                          <td className="p-3"></td>
                        </tr>
                      </tfoot>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payouts Tab */}
            <TabsContent value="payouts">
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Request your money</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    After the buyer confirms delivery, you can ask the company to pay you. Company keeps {commissionPercent}%, you receive {100 - commissionPercent}%.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>
                      {sellerApp?.payment_account
                        ? <>Filled in from the payout details you registered ({sellerApp.payment_provider}). Change them for good under <span className="font-medium">Profile</span>.</>
                        : <>Register your bank or Mobile Money details once under <span className="font-medium">Profile</span>; they stay private and are never shown to customers.</>}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payout method</Label>
                      <select
                        value={payoutMethod}
                        onChange={(e) => setPayoutMethod(e.target.value as any)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="momo">Mobile Money (MoMo)</option>
                        <option value="bank">Bank account</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Account holder full name</Label>
                      <Input
                        value={payoutAccountName}
                        onChange={(e) => setPayoutAccountName(e.target.value)}
                        placeholder="Account holder full name"
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>{payoutMethod === "momo" ? "MoMo number" : "Bank · Account number"}</Label>
                      <Input value={payoutDestination} onChange={(e) => setPayoutDestination(e.target.value)} placeholder={payoutMethod === "momo" ? "07xx xxx xxx" : "Bank of Kigali · 00040-12345678-90"} maxLength={150} />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">Eligible delivered orders</h4>
                    {eligibleOrders.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-4">
                        No eligible orders. An order becomes eligible once the buyer confirms delivery.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Sale</TableHead>
                          <TableHead>Company keeps ({commissionPercent}%)</TableHead>
                          <TableHead>You get ({100 - commissionPercent}%)</TableHead>
                          <TableHead></TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {eligibleOrders.map((o) => {
                            const commission = Math.round((o.total_amount * commissionPercent) / 100);
                            const net = o.total_amount - commission;
                            return (
                              <TableRow key={o.id}>
                                <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}…</TableCell>
                                <TableCell>{o.total_amount.toLocaleString()} RWF</TableCell>
                                <TableCell className="text-destructive">-{commission.toLocaleString()} RWF</TableCell>
                                <TableCell className="text-primary font-semibold">{net.toLocaleString()} RWF</TableCell>
                                <TableCell>
                                  <Button size="sm" onClick={() => requestPayout(o)}>Request payout</Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2 mt-6">My payout requests</h4>
                    {payouts.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-4">No payout requests yet.</p>
                    ) : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead>Net</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {payouts.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                              <TableCell className="font-mono text-xs">{p.order_id?.slice(0, 8) || "—"}…</TableCell>
                              <TableCell className="text-primary font-semibold">{p.net_amount.toLocaleString()} RWF</TableCell>
                              <TableCell className="capitalize">{p.payout_method}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === "paid" ? "bg-green-500/15 text-green-500" : p.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-yellow-500/15 text-yellow-500"}`}>
                                  {p.status}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="profile">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Account Settings</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-lg">
                    <div className="space-y-2"><Label>Full Name</Label><Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Business Name</Label><Input value={editBusiness} onChange={(e) => setEditBusiness(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Email</Label><Input value={user?.email || ""} disabled /></div>
                    <Button type="submit">Save Changes</Button>
                  </form>
                </CardContent>
              </Card>

              {/* Sections 7 and 9 of the Seller Agreement: private details, kept up to date */}
              {sellerApp && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> Business &amp; payout details (private)</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Not visible to customers. ISOKO uses them to verify you and to pay approved payouts. Keep them up to date.
                      {sellerApp.agreement_accepted_at && (
                        <> Seller Agreement accepted {new Date(sellerApp.agreement_accepted_at).toLocaleString()} (version {sellerApp.agreement_version}).</>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSaveDetails} className="space-y-4 max-w-lg">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Country</Label>
                          <Input list="seller-countries" value={editCountry} onChange={(e) => setEditCountry(e.target.value)} required maxLength={60} />
                          <datalist id="seller-countries">{COUNTRIES.filter((c) => c !== "Other").map((c) => <option key={c} value={c} />)}</datalist>
                        </div>
                        <div className="space-y-2"><Label>TIN</Label><Input value={editTin} onChange={(e) => setEditTin(e.target.value)} required minLength={5} maxLength={30} /></div>
                      </div>
                      <div className="space-y-2"><Label>Business Address / Location</Label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} required minLength={3} maxLength={300} /></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Bank / Mobile Money Provider</Label>
                          <Input list="seller-providers" value={editProvider} onChange={(e) => setEditProvider(e.target.value)} required maxLength={60} placeholder="MTN Mobile Money, Bank of Kigali…" />
                          <datalist id="seller-providers">{PAYMENT_PROVIDERS.filter((p) => p !== "Other bank").map((p) => <option key={p} value={p} />)}</datalist>
                        </div>
                        <div className="space-y-2"><Label>Account / Mobile Money Number</Label><Input value={editAccount} onChange={(e) => setEditAccount(e.target.value)} required minLength={6} maxLength={60} /></div>
                      </div>
                      <div className="space-y-2"><Label>Account Holder Name</Label><Input value={editAccountName} onChange={(e) => setEditAccountName(e.target.value)} required minLength={3} maxLength={100} /></div>
                      <Button type="submit" disabled={savingDetails}>{savingDetails ? "Saving..." : "Save details"}</Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>
      {imagesProduct && user && (
        <ProductImagesDialog
          product={imagesProduct}
          sellerId={user.id}
          open={!!imagesProduct}
          onOpenChange={(o) => { if (!o) setImagesProduct(null); }}
          onSaved={fetchData}
        />
      )}
      {shipmentOrder && (
        <ShipmentDialog
          orderId={shipmentOrder.id}
          open={!!shipmentOrder}
          onOpenChange={(o) => { if (!o) setShipmentOrder(null); }}
          onSaved={fetchData}
        />
      )}
      <Footer />
    </div>
  );
};

export default SellerDashboard;
