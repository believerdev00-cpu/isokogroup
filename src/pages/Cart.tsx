import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, ShoppingBag, Minus, Plus, Smartphone, Landmark, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_PAYMENT } from "@/lib/company";

type CartRow = {
  id: string;
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    seller_id: string;
    stock: number;
  };
};

const Cart = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipping, setShipping] = useState("");
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"momo" | "bank" | "auto">("momo");
  const [paymentReference, setPaymentReference] = useState("");
  const [payerName, setPayerName] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("cart_items")
      .select("id, product_id, quantity, product:products(id,name,price,image_url,seller_id,stock)")
      .eq("user_id", user.id);
    if (error) toast({ title: "Error loading cart", description: error.message, variant: "destructive" });
    setItems((data || []).filter((r: any) => r.product));
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const updateQty = async (row: CartRow, qty: number) => {
    if (qty < 1) return;
    const { error } = await (supabase as any).from("cart_items").update({ quantity: qty }).eq("id", row.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  const removeItem = async (id: string) => {
    const { error } = await (supabase as any).from("cart_items").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  const total = items.reduce((s, r) => s + r.product.price * r.quantity, 0);

  const checkout = async () => {
    if (!user) return;
    if (items.length === 0) return;
    if (!shipping.trim()) {
      toast({ title: "Shipping address required", variant: "destructive" });
      return;
    }
    if (paymentMethod === "auto") {
      toast({ title: "Coming soon", description: "Automatic payment is not yet available. Use MoMo or Bank.", variant: "destructive" });
      return;
    }
    if (!payerName.trim()) {
      toast({ title: "Your name is required", description: "Enter the name you used when paying.", variant: "destructive" });
      return;
    }
    if (!paymentReference.trim()) {
      toast({ title: "Payment reference required", description: "Enter the MoMo transaction ID or bank transfer reference.", variant: "destructive" });
      return;
    }
    setPlacing(true);
    try {
      // The server reads prices from the products table, splits the cart into one
      // order per seller, and records the commission and buyer notification.
      const { error } = await (supabase as any).rpc("place_order", {
        p_items: items.map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
        p_shipping_address: shipping,
        p_payment_method: paymentMethod,
        p_payment_reference: `${payerName.trim()} · ${paymentReference.trim()}`,
      });
      if (error) throw error;

      await (supabase as any).from("cart_items").delete().eq("user_id", user.id);
      toast({ title: "Order placed!", description: "We'll confirm your payment and notify the seller to ship it." });
      navigate("/my-orders");
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Shopping Cart</h1>
        <p className="text-muted-foreground mb-8">Review items and place your order.</p>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">Your cart is empty.</p>
            <Button onClick={() => navigate("/marketplace")}>Browse Marketplace</Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {items.map((row) => (
                <div key={row.id} className="flex gap-4 p-4 rounded-xl border border-border bg-card">
                  <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                    {row.product.image_url ? (
                      <img src={row.product.image_url} alt={row.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ShoppingBag className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{row.product.name}</h3>
                    <p className="text-primary font-bold">{row.product.price.toLocaleString()} RWF</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(row, row.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm">{row.quantity}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(row, row.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <Button size="icon" variant="ghost" onClick={() => removeItem(row.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <span className="font-semibold">{(row.product.price * row.quantity).toLocaleString()} RWF</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-6 h-fit space-y-4">
              <h2 className="font-display text-xl font-bold">Order Summary</h2>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Items</span>
                <span>{items.reduce((s, r) => s + r.quantity, 0)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-3">
                <span>Total</span>
                <span className="text-primary">{total.toLocaleString()} RWF</span>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Shipping address</label>
                <Input placeholder="Street, City, Rwanda" value={shipping} onChange={(e) => setShipping(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: "momo", name: "MTN MoMo", type: "Mobile Money", recipient: COMPANY_PAYMENT.momo.name, icon: Smartphone },
                    { k: "bank", name: "Bank of Kigali", type: "Bank Transfer", recipient: COMPANY_PAYMENT.bank.name, icon: Landmark },
                    { k: "auto", name: "SSD", type: "Automatic Payment", recipient: "—", icon: Zap },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = paymentMethod === opt.k;
                    return (
                      <button
                        key={opt.k}
                        type="button"
                        onClick={() => setPaymentMethod(opt.k as any)}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="font-semibold">{opt.name}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.type}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-full">{opt.recipient}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-1">
                {paymentMethod === "momo" && (
                  <>
                    <p className="font-semibold">{COMPANY_PAYMENT.momo.label}</p>
                    <p>Send to: <span className="font-mono text-primary">{COMPANY_PAYMENT.momo.number}</span></p>
                    <p>Name: {COMPANY_PAYMENT.momo.name}</p>
                    <p className="text-muted-foreground">{COMPANY_PAYMENT.momo.note}</p>
                  </>
                )}
                {paymentMethod === "bank" && (
                  <>
                    <p className="font-semibold">{COMPANY_PAYMENT.bank.label}</p>
                    <p>{COMPANY_PAYMENT.bank.bank}</p>
                    <p>Account: <span className="font-mono text-primary">{COMPANY_PAYMENT.bank.account}</span></p>
                    <p>Name: {COMPANY_PAYMENT.bank.name}</p>
                    {COMPANY_PAYMENT.bank.swift && <p className="text-muted-foreground">SWIFT: {COMPANY_PAYMENT.bank.swift}</p>}
                  </>
                )}
                {paymentMethod === "auto" && (
                  <>
                    <p className="font-semibold">{COMPANY_PAYMENT.auto.label}</p>
                    <p className="text-muted-foreground">{COMPANY_PAYMENT.auto.note}</p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Your full name (as paid)</label>
                <Input
                  placeholder="Your full name"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">Enter the name you used when sending the payment.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment reference / transaction ID</label>
                <Input
                  placeholder="e.g. MoMo TXN ID or bank ref"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">After paying, enter the transaction reference so admin can verify.</p>
              </div>

              <Button className="w-full" disabled={placing} onClick={checkout}>
                {placing ? "Placing order…" : "I have paid — Place Order"}
              </Button>
              <Link to="/my-orders" className="block text-center text-xs text-primary hover:underline">View my orders</Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Cart;
