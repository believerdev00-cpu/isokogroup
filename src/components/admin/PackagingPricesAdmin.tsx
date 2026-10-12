// The packaging price list, where the prices can be changed.
//
// Every figure on the Packaging page is here, grouped as it appears there,
// and each one is a box an administrator can type into. Nothing saves until
// Save is pressed, and only the figures that actually moved are written --
// so an accidental click in a field costs nothing, and the audit log holds
// price changes rather than forty-three no-ops.
//
// Codes, names and units are shown but not editable. They are the names the
// page, the order form and every past packaging request agree on; renaming
// one here would orphan the requests that quote it. Taking a line off the
// list is what `On the list` is for, and it leaves those requests intact.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Row = { code: string; category_id: string; name: string; price: number; unit: string; sort: number; is_active: boolean };
type Category = { id: string; title: string; note: string | null; sort: number };
type Draft = { price: string; is_active: boolean };

export default function PackagingPricesAdmin() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("packaging_categories").select("id, title, note, sort").order("sort"),
      supabase.from("packaging_products").select("code, category_id, name, price, unit, sort, is_active").order("sort"),
    ]);
    if (c.error || p.error) {
      toast({ title: "Could not load the price list", description: (c.error ?? p.error)?.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setCategories((c.data ?? []) as Category[]);
    setRows((p.data ?? []) as Row[]);
    setDraft(Object.fromEntries(((p.data ?? []) as Row[]).map((r) => [r.code, { price: String(r.price), is_active: r.is_active }])));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /** What actually moved, so a save writes only those rows. */
  const changed = useMemo(
    () => rows.filter((r) => {
      const d = draft[r.code];
      if (!d) return false;
      const price = parseInt(d.price, 10);
      return (Number.isFinite(price) && price !== r.price) || d.is_active !== r.is_active;
    }),
    [rows, draft],
  );

  const invalid = useMemo(
    () => rows.filter((r) => {
      const raw = draft[r.code]?.price ?? "";
      const n = parseInt(raw, 10);
      return raw.trim() === "" || !Number.isFinite(n) || n < 0;
    }),
    [rows, draft],
  );

  const save = async () => {
    if (invalid.length) {
      return toast({ title: "Check the prices", description: `${invalid.length} ${invalid.length === 1 ? "line has" : "lines have"} no valid price.`, variant: "destructive" });
    }
    setSaving(true);
    let done = 0;
    for (const r of changed) {
      const d = draft[r.code];
      const { error } = await supabase
        .from("packaging_products")
        .update({ price: parseInt(d.price, 10), is_active: d.is_active })
        .eq("code", r.code);
      if (error) {
        setSaving(false);
        toast({ title: `Stopped at ${r.code}`, description: error.message, variant: "destructive" });
        await load();
        return;
      }
      done += 1;
    }
    setSaving(false);
    toast({ title: "Saved", description: `${done} ${done === 1 ? "price" : "prices"} updated. The Packaging page shows them now.` });
    await load();
  };

  const q = search.trim().toLowerCase();
  const shown = categories
    .map((c) => ({ ...c, items: rows.filter((r) => r.category_id === c.id && (!q || `${r.code} ${r.name} ${c.title}`.toLowerCase().includes(q))) }))
    .filter((c) => c.items.length > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Packaging prices ({rows.length})</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a line" className="h-9 w-48 pl-8" />
          </div>
          <Button size="sm" onClick={save} disabled={saving || loading || changed.length === 0} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {changed.length === 0 ? "No changes" : `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}`}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Loading the price list…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No packaging lines yet.</p>
        ) : (
          shown.map((c) => (
            <div key={c.id}>
              <p className="text-sm font-semibold">
                {c.title} {c.note && <span className="font-normal text-muted-foreground">· {c.note}</span>}
              </p>
              <ul className="mt-2 divide-y rounded-lg border">
                {c.items.map((r) => {
                  const d = draft[r.code] ?? { price: String(r.price), is_active: r.is_active };
                  const n = parseInt(d.price, 10);
                  const bad = d.price.trim() === "" || !Number.isFinite(n) || n < 0;
                  const moved = (Number.isFinite(n) && n !== r.price) || d.is_active !== r.is_active;
                  return (
                    <li key={r.code} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.code}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={d.price}
                          onChange={(e) => setDraft((s) => ({ ...s, [r.code]: { ...d, price: e.target.value } }))}
                          className={`h-8 w-28 text-right ${bad ? "border-destructive" : moved ? "border-primary" : ""}`}
                          aria-label={`Price for ${r.code}`}
                        />
                        <span className="w-16 text-xs text-muted-foreground">RWF / {r.unit}</span>
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Switch
                          checked={d.is_active}
                          onCheckedChange={(v) => setDraft((s) => ({ ...s, [r.code]: { ...d, is_active: v } }))}
                          aria-label={`Show ${r.code} on the website`}
                        />
                        On the list
                      </label>
                      {moved && <span className="text-xs font-medium text-primary">was {r.price.toLocaleString()}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
        {!loading && rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Only the price and whether a line is on the list can change here. Codes, names and units are fixed, because past
            packaging requests quote them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
