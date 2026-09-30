import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { mapLinkUrl, SITE_SETTINGS_KEY, SOCIAL_NETWORKS, type SocialLink, type SocialNetwork } from "@/lib/siteSettings";
import { useSubscription } from "@/lib/subscription";

// Everything the site shows about the company that isn't a product, a service
// or a page of its own: contacts, payment accounts, social links, the
// marketplace commission and the subscription prices. Stored in
// platform_settings; the database checks each value and logs who changed it.

const TEXT_FIELDS: { key: string; label: string; hint?: string; group: string; type?: string }[] = [
  { group: "Company", key: "company_name", label: "Company name" },
  { group: "Company", key: "company_email", label: "Email", type: "email" },
  { group: "Company", key: "company_address", label: "Office address" },
  { group: "Company", key: "company_map_query", label: "Map location", hint: "What Google Maps should find, e.g. \"Kimironko Market, KG 15 Ave, Kigali\"" },
  { group: "WhatsApp", key: "whatsapp_office", label: "Office WhatsApp", hint: "With the country code, e.g. 250788481648. Travel, Consultancy, Data and Entertainment \"Book\" buttons use it." },
  { group: "WhatsApp", key: "whatsapp_ict", label: "ICT team WhatsApp", hint: "Software, websites and ICT training requests go here." },
  { group: "Mobile Money", key: "company_momo_code", label: "MoMo code or number", hint: "Shown at checkout, on service payments and for subscriptions." },
  { group: "Mobile Money", key: "momo_label", label: "MoMo name shown", hint: "e.g. Mobile Money (MTN MoMo)" },
  { group: "Mobile Money", key: "momo_account_name", label: "MoMo account name" },
  { group: "Bank", key: "bank_name", label: "Bank" },
  { group: "Bank", key: "bank_account_number", label: "Account number" },
  { group: "Bank", key: "bank_account_name", label: "Account name" },
  { group: "Bank", key: "bank_swift", label: "SWIFT / BIC (optional)", hint: "Leave empty to hide it." },
  { group: "Subscriptions", key: "seller_monthly_price", label: "Seller subscription, per month (RWF)", hint: "Replaces the 50/200 RWF subscription for sellers: normal access plus the seller dashboard.", type: "number" },
  { group: "Marketplace", key: "marketplace_commission_percent", label: "Commission (%)", hint: "Charged on every new order (0–50). Orders already placed keep their rate.", type: "number" },
  { group: "Subscriptions", key: "subscription_trial_minutes", label: "Free trial (minutes)", type: "number" },
  { group: "Subscriptions", key: "subscription_first_week_price", label: "First paid period price (RWF)", type: "number" },
  { group: "Subscriptions", key: "subscription_first_period_days", label: "First paid period (days)", type: "number" },
  { group: "Subscriptions", key: "subscription_monthly_price", label: "Monthly price (RWF)", type: "number" },
];
const GROUPS = ["Company", "WhatsApp", "Mobile Money", "Bank", "Marketplace", "Subscriptions"];
const LIST_KEYS = ["company_phones", "social_links"];

type Values = Record<string, string>;

const SiteSettingsAdmin = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { refresh: refreshSubscription } = useSubscription();
  const [saved, setSaved] = useState<Values | null>(null);
  const [values, setValues] = useState<Values>({});
  const [phones, setPhones] = useState<string[]>([]);
  const [social, setSocial] = useState<SocialLink[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const keys = [...TEXT_FIELDS.map((f) => f.key), ...LIST_KEYS];
    const { data, error } = await (supabase as any).from("platform_settings").select("key, value").in("key", keys);
    if (error) {
      toast({ title: "Could not load settings", description: error.message, variant: "destructive" });
      return;
    }
    const v: Values = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value ?? ""]));
    setSaved(v);
    setValues(v);
    try { setPhones(JSON.parse(v.company_phones || "[]")); } catch { setPhones([]); }
    try { setSocial(JSON.parse(v.social_links || "[]")); } catch { setSocial([]); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // what would be written: every value, lists as JSON
  const next = useMemo<Values>(() => ({
    ...values,
    company_phones: JSON.stringify(phones.map((p) => p.trim()).filter(Boolean)),
    social_links: JSON.stringify(social.map((l) => ({ network: l.network, label: l.label.trim(), url: l.url.trim() }))),
  }), [values, phones, social]);
  const changed = saved ? Object.keys(next).filter((k) => (next[k] ?? "") !== (saved[k] ?? "") && !(LIST_KEYS.includes(k) && sameJson(next[k], saved[k]))) : [];

  const save = async () => {
    setSaving(true);
    // one at a time, so the first refused value is named
    for (const key of changed) {
      const { error } = await (supabase as any).from("platform_settings").upsert({ key, value: next[key] }, { onConflict: "key" });
      if (error) {
        setSaving(false);
        const label = TEXT_FIELDS.find((f) => f.key === key)?.label ?? (key === "company_phones" ? "Phones" : "Social links");
        toast({ title: `${label}: not saved`, description: error.message, variant: "destructive" });
        await load();
        return;
      }
    }
    setSaving(false);
    toast({ title: "Settings saved", description: "The whole site shows the new values now." });
    qc.invalidateQueries({ queryKey: SITE_SETTINGS_KEY });
    refreshSubscription();
    await load();
  };

  if (!saved) return <p className="text-muted-foreground text-center py-8">Loading settings…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          These details appear across the website. Changes are checked, saved with your name in the audit log, and shown to
          visitors straight away.
        </p>
        <Button onClick={save} disabled={saving || changed.length === 0} className="shrink-0">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "No changes"}
        </Button>
      </div>

      {GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader><CardTitle className="text-lg">{group}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.filter((f) => f.group === group).map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
                <Input
                  id={`s-${f.key}`}
                  type={f.type ?? "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                {f.key === "company_map_query" && values.company_map_query && (
                  <a href={mapLinkUrl(values.company_map_query)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Check it on Google Maps <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
            {group === "Company" && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Phone numbers</Label>
                {phones.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={p} placeholder="0788 000 000" onChange={(e) => setPhones(phones.map((x, j) => (j === i ? e.target.value : x)))} />
                    <Button variant="outline" size="icon" aria-label="Remove this number" onClick={() => setPhones(phones.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {phones.length < 10 && (
                  <Button variant="outline" size="sm" onClick={() => setPhones([...phones, ""])}><Plus className="mr-1 h-4 w-4" />Add a number</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle className="text-lg">Social media</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Shown as icons at the bottom of every page, grouped by network.</p>
          {social.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_2fr_auto]">
              <select
                aria-label="Network"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={l.network}
                onChange={(e) => setSocial(social.map((x, j) => (j === i ? { ...x, network: e.target.value as SocialNetwork } : x)))}
              >
                {SOCIAL_NETWORKS.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
              </select>
              <Input aria-label="Name shown" placeholder="Name shown" value={l.label}
                onChange={(e) => setSocial(social.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input aria-label="Address" placeholder="https://…" value={l.url}
                onChange={(e) => setSocial(social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <Button variant="outline" size="icon" aria-label="Remove this link" onClick={() => setSocial(social.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {social.length < 30 && (
            <Button variant="outline" size="sm" onClick={() => setSocial([...social, { network: "instagram", label: "", url: "https://" }])}>
              <Plus className="mr-1 h-4 w-4" />Add a link
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const sameJson = (a?: string, b?: string) => {
  try {
    return JSON.stringify(JSON.parse(a || "null")) === JSON.stringify(JSON.parse(b || "null"));
  } catch {
    return a === b;
  }
};

export default SiteSettingsAdmin;
