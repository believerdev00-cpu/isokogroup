import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type N = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

// The colour of a notification's type (set by the notification engine)
const TONE: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
  info: "bg-primary",
};

const NotificationsBell = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<N[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data as N[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase.channel(`notif-${user.id}-${Math.random().toString(36).slice(2)}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
      () => load()
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const unread = items.filter((i) => !i.read).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await (supabase as any).from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    load();
  };

  if (!user) return null;

  return (
    <Popover onOpenChange={(o) => o && markAllRead()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="font-semibold text-sm">Notifications</p>
        </div>
        <div className="max-h-96 overflow-auto">
          {items.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No notifications yet.</p>
          ) : (
            items.map((n) => {
              const Inner = (
                <div className={`flex gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50 ${!n.read ? "bg-primary/5" : ""}`}>
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[n.type] ?? TONE.info} ${n.read ? "opacity-40" : ""}`} />
                  <div className="min-w-0">
                  <p className="text-sm font-medium">{!n.read && <span className="sr-only">Unread: </span>}{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </div>
              );
              return n.link ? (
                <Link key={n.id} to={n.link}>{Inner}</Link>
              ) : (
                <div key={n.id}>{Inner}</div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsBell;
