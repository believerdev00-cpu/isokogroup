// Adding and editing marketplace products from the admin desk.
//
// Adding is for Isoko's own goods only. A seller lists theirs from their own
// dashboard, where require_seller_access() checks their subscription as they
// do it -- an admin listing on their behalf would walk past that check while
// the orders, commissions and payouts stayed the seller's. The database
// agrees: the insert policy admits an admin only for their own account.
//
// Editing is for every product on the marketplace, whoever owns it, because
// that is what an administrator is for: a wrong price, a sold-out line, a
// photograph that never loaded. The owner is never changed by an edit, so
// the money keeps going where it was always going.
import { useEffect, useRef, useState } from "react";
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
const STATUSES = ["active", "inactive", "pending"] as const;

export type EditableProduct = {
  id: string; seller_id: string; name: string; description: string | null;
  price: number; category: string; stock: number; status: string;
  image_url: string | null; image_urls: string[] | null;
};

export default function ProductDialog({
  adminUserId,
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  /** The owner of anything added here: Isoko, through the admin's account. */
  adminUserId: string;
  /** Present when editing an existing product; absent when adding one. */
  product?: EditableProduct | null;
  /** Controlled when editing; left out when the component owns its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const editing = !!product;
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOwnOpen(v));

  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [status, setStatus] = useState<string>("active");
  /** Pictures already on the product, which an edit may drop. */
  const [kept, setKept] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  // Fill the form from whichever product is being opened, and clear it again
  // for an add, so the last edit does not leak into the next one.
  useEffect(() => {
    if (!isOpen) return;
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setPrice(product ? String(product.price) : "");
    setStock(product ? String(product.stock) : "");
    setCategory(product?.category && CATEGORIES.includes(product.category) ? product.category : CATEGORIES[0]);
    setStatus(product?.status ?? "active");
    setKept(product?.image_urls ?? (product?.image_url ? [product.image_url] : []));
    setFiles([]);
  }, [isOpen, product]);

  const total = kept.length + files.length;

  const addFiles = (chosen: FileList | null) => {
    if (!chosen?.length) return;
    const room = MAX_PRODUCT_IMAGES - total;
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
    // An edit never moves a product to another seller: the orders and payouts
    // already attached to it belong to whoever owns it now.
    const sellerId = product ? product.seller_id : adminUserId;
    if (!name.trim()) return toast({ title: "Add a name", variant: "destructive" });
    const priceNumber = parseInt(price, 10);
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return toast({ title: "Add a price", variant: "destructive" });

    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const [i, file] of files.entries()) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        // The owner's folder, so that seller can still manage the picture
        // from their own dashboard; an admin may write there because the
        // bucket policy already allows is_admin().
        const path = `${sellerId}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        uploaded.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      const urls = [...kept, ...uploaded];
      // The card on the marketplace shows a still, not whichever file came
      // first -- a video chosen first should not become the thumbnail.
      const firstStill = urls.find((u) => mediaKindOf(u) === "image") ?? urls[0] ?? null;
      const fields = {
        name: name.trim(),
        description: description.trim() || null,
        price: priceNumber,
        category,
        stock: parseInt(stock, 10) || 0,
        image_url: firstStill,
        image_urls: urls,
      };

      if (product) {
        const { error } = await supabase.from("products").update({ ...fields, status }).eq("id", product.id);
        if (error) throw error;
        toast({ title: "Saved", description: `"${fields.name}" updated.` });
      } else {
        const { error } = await supabase.from("products").insert({ ...fields, seller_id: sellerId, status });
        if (error) throw error;
        toast({ title: "Added", description: `"${fields.name}" is on the marketplace.` });
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      toast({ title: editing ? "Not saved" : "Not added", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open === undefined && (
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add product</Button>
      )}

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "Add an Isoko product"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Anything here can be corrected. The seller who owns it does not change."
                : "One of the company's own products. Sellers list theirs from their own dashboard."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="pd-name">Name</Label>
              <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What it is" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pd-desc">Description</Label>
              <Textarea id="pd-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pd-price">Price (RWF)</Label>
                <Input id="pd-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pd-stock">Stock</Label>
                <Input id="pd-stock" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
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
              <Label>On the marketplace</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active — visible to shoppers</SelectItem>
                  <SelectItem value="inactive">Inactive — hidden</SelectItem>
                  <SelectItem value="pending">Pending — awaiting review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Pictures <span className="font-normal text-muted-foreground">({total} of {MAX_PRODUCT_IMAGES})</span></Label>

              {kept.length > 0 && (
                <ul className="grid grid-cols-4 gap-2">
                  {kept.map((url, i) => (
                    <li key={url} className="relative">
                      {mediaKindOf(url) === "image" ? (
                        <img src={url} alt="" className="h-16 w-full rounded border object-cover" />
                      ) : (
                        <div className="flex h-16 w-full items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">file</div>
                      )}
                      <button
                        type="button"
                        onClick={() => setKept((k) => k.filter((_, n) => n !== i))}
                        className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground hover:text-destructive"
                        aria-label="Remove this picture"
                      ><Trash2 className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}

              <Input
                ref={fileInput}
                type="file"
                accept={MEDIA_ACCEPT}
                multiple
                disabled={total >= MAX_PRODUCT_IMAGES}
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
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
