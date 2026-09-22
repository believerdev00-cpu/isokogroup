import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Bump } from "@/components/motion";

const CartBadge = () => {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const load = async () => {
    if (!user) {
      setCount(0);
      return;
    }
    const { data } = await (supabase as any)
      .from("cart_items")
      .select("quantity")
      .eq("user_id", user.id);
    const total = (data ?? []).reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
    setCount(total);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase.channel(`cart-${user.id}-${Math.random().toString(36).slice(2)}`);
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_items", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <Link to="/cart" aria-label="Cart">
      <Button variant="ghost" size="icon" className="relative">
        <ShoppingCart className="h-4 w-4" />
        {count > 0 && (
          <Bump value={count} className="absolute -top-0.5 -right-0.5">
            <span className="h-4 min-w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1">
              {count > 99 ? "99+" : count}
            </span>
          </Bump>
        )}
      </Button>
    </Link>
  );
};

export default CartBadge;
