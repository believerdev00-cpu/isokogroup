// Putting one of Isoko's own products on the marketplace, from the admin desk.
//
// Only Isoko's own. A seller lists their goods from their own dashboard,
// where their subscription is checked as they do it -- an admin listing on
// their behalf would skip that check, and the product's orders, commissions
// and payouts would still be theirs. So the two stay separate, and the
// database agrees: the policy admits an admin only for their own account.
import { useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEDIA_ACCEPT, mediaKindOf } from "@/lib/mediaKind";
import { MAX_PRODUCT_IMAGES } from "@/lib/sellerAgreement";
import { tooLargeMessage, uploadLimitMb, withinLimit } from "@/lib/uploadLimits";

const CATEGORIES = ["Electronics", "Fashion", "Food & Drink", "Crafts", "Home", "Accessories"];

export default function AddProductDialog({
  adminUserId,
  onAdded,
}: {
  /** The owner of anything added here: Isoko, through the admin's account. */
  adminUserId: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [files, setFiles] = useState<File[]>([]);

  const reset = () => {
    setName(""); setDescription(""); setPrice(""); setStock("");
    setCategory(CATEGORIES[0]); setFiles([]);
  };

  const addFiles = (chosen: FileList | null) => {
    if (!chosen?.length) return;
    const room = MAX_PRODUCT_IMAGES - files.length;
    if (room <= 0) {
      toast({ title: "That is enough", description: `A product has at most ${MAX_PRODUCT_IMAGES} images.`, variant: "destructive" });
      return;
    }
    const keep: File[] = [];
    for (const file of [...chosen].slice(0, room)) {
      if (!withinLimit(file, "product-images")) {
        toast({ title: "Too large", description: tooLargeMessage(file, uploadLimitMb("product-images")), variant: "destructive" });
        continue;
      }
      keep.push(file);
    }
    setFiles((f) => [...f, ...keep]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const save = async () => {
    const sellerId = adminUserId;
    if (!name.trim()) return toast({ title: "Add a name", variant: "destructive" });
    const priceNumber = parseInt(price, 10);
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return toast({ title: "Add a price", variant: "destructive" });

    setBusy(true);
    try {
      // The pictures go in the owner's own folder, so the seller can replace
      // or remove them later from their own dashboard; an admin may write
      // there because the bucket policy already allows is_admin().
      const urls: string[] = [];
      for (const [i, file] of files.entries()) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${sellerId}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      // image_url is the one the marketplace card shows: the first picture,
      // not the first file, so a video chosen first does not become the
      // thumbnail of a product nobody can see.
      const firstStill = urls.find((u, i) => mediaKindOf(files[i]?.name) === "image") ?? urls[0] ?? null;
      const { error } = await supabase.from("products").insert({
        seller_id: sellerId,
        name: name.trim(),
        description: description.trim() || null,
        price: priceNumber,
        category,
        stock: parseInt(stock, 10) || 0,
        image_url: firstStill,
        image_urls: urls,
      });
      if (error) throw error;
      toast({ title: "Added", description: `"${name.trim()}" is on the marketplace.` });
      reset();
      setOpen(false);
      onAdded();
    } catch (e) {
      toast({ title: "Not added", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add product</Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an Isoko product</DialogTitle>
            <DialogDescription>
              One of the company's own products. Sellers list theirs from their own dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-name">Name</Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What it is" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ap-desc">Description</Label>
              <Textarea id="ap-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ap-price">Price (RWF)</Label>
                <Input id="ap-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ap-stock">Stock</Label>
                <Input id="ap-stock" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Pictures <span className="font-normal text-muted-foreground">({files.length} of {MAX_PRODUCT_IMAGES})</span></Label>
              <Input
                ref={fileInput}
                type="file"
                accept={MEDIA_ACCEPT}
                multiple
                disabled={files.length >= MAX_PRODUCT_IMAGES}
                onChange={(e) => addFiles(e.target.files)}
              />
              <p className="text-xs text-muted-foreground">
                At most {MAX_PRODUCT_IMAGES}, up to {uploadLimitMb("product-images")} MB each. The first picture is the one
                the marketplace shows.
              </p>
              {files.length > 0 && (
                <ul className="divide-y rounded-lg border text-xs">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 p-2">
                      <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((list) => list.filter((_, n) => n !== i))}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${f.name}`}
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Adding…" : "Add product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
