import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Channel = "email" | "whatsapp" | "sms";
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "email", label: "Email", hint: "Order, payment and booking updates" },
  { key: "whatsapp", label: "WhatsApp", hint: "Important updates only, e.g. a payment received or a delivery" },
  { key: "sms", label: "SMS", hint: "Only the most important updates" },
];

// Which channels Isoko may use to reach this person (in-app notifications
// always stay on). Everything is on until they switch a channel off.
const NotificationPreferences = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prefs = useQuery({
    queryKey: ["notification_preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // The generated types don't include this table yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("notification_preferences").select("channel, enabled");
      if (error) throw error;
      return new Map<string, boolean>((data ?? []).map((p: { channel: string; enabled: boolean }) => [p.channel, p.enabled]));
    },
  });

  const set = async (channel: Channel, enabled: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("notification_preferences")
      .upsert({ user_id: user!.id, channel, enabled, updated_at: new Date().toISOString() });
    if (error) toast.error("Could not save your choice. Please try again.");
    qc.invalidateQueries({ queryKey: ["notification_preferences", user?.id] });
  };

  if (!user) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">How we contact you</CardTitle>
        <CardDescription>Notifications in the app are always on. Choose where else you'd like to hear from Isoko.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CHANNELS.map((c) => (
          <label key={c.key} className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c.hint}</span>
            </span>
            <Switch
              checked={prefs.data?.get(c.key) ?? true}
              disabled={prefs.isLoading}
              onCheckedChange={(v) => set(c.key, v)}
              aria-label={`${c.label} notifications`}
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
};

export default NotificationPreferences;
