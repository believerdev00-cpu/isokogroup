import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGES_BUCKET,
  imageFileProblem,
  imagesLeft,
  imagesPatch,
  newImagePath,
  ownStoragePath,
  productImages,
} from "@/lib/productImages";

// One image in the editor: already saved (a url) or newly chosen (a file)
type Item = { url?: string; file?: File; preview: string };

type Props = {
  product: { id: string; name: string; seller_id: string; image_url?: string | null; image_urls?: string[] | null };
  sellerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/**
 * A seller edits a listed product's images: add, remove, replace and reorder,
 * at most four (Seller Agreement, section 2). The first image is the one the
 * marketplace shows. Saving uploads the new files to the seller's own folder
 * of the product-images bucket and stores the final list; the database checks
 * the limit and that every new image is such an upload.
 */
const ProductImagesDialog = ({ product, sellerId, open, onOpenChange, onSaved }: Props) => {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<number | null>(null);

  // Start from what is saved each time the dialog opens
  useEffect(() => {
    if (open) setItems(productImages(product).map((url) => ({ url, preview: url })));
  }, [open, product]);

  // Previews of chosen files are browser-side objects; free them when they go
  useEffect(() => () => items.forEach((i) => i.file && URL.revokeObjectURL(i.preview)), [items]);

  const fileItem = (file: File): Item => ({ file, preview: URL.createObjectURL(file) });

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const next = [...items];
    for (const f of picked) {
      const problem = imageFileProblem(f);
      if (problem) {
        toast({ title: "Image not added", description: problem, variant: "destructive" });
        continue;
      }
      if (imagesLeft(next.length) === 0) {
        toast({ title: `Maximum ${MAX_PRODUCT_IMAGES} images`, description: "Remove an image before adding another.", variant: "destructive" });
        break;
      }
      next.push(fileItem(f));
    }
    setItems(next);
  };

  const handleReplace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const at = replacing;
    setReplacing(null);
    if (!f || at === null) return;
    const problem = imageFileProblem(f);
    if (problem) {
      toast({ title: "Image not replaced", description: problem, variant: "destructive" });
      return;
    }
    setItems(items.map((it, i) => (i === at ? fileItem(f) : it)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setItems(next);
  };

  const handleSave = async () => {
    if (items.length > MAX_PRODUCT_IMAGES) {
      toast({ title: `Maximum ${MAX_PRODUCT_IMAGES} images`, variant: "destructive" });
      return;
    }
    setSaving(true);
    const urls: string[] = [];
    for (const [i, it] of items.entries()) {
      if (it.url) {
        urls.push(it.url);
        continue;
      }
      const path = newImagePath(sellerId, it.file!, i);
      const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, it.file!, { contentType: it.file!.type });
      if (error) {
        setSaving(false);
        toast({ title: "Upload failed", description: `${it.file!.name}: ${error.message}`, variant: "destructive" });
        return;
      }
      urls.push(supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl);
    }
    // Only the owner's row matches; the database keeps image_url in step and checks the images
    const { error, data } = await supabase
      .from("products")
      .update(imagesPatch(urls))
      .eq("id", product.id)
      .eq("seller_id", sellerId)
      .select("id");
    if (error || !data?.length) {
      setSaving(false);
      toast({ title: "Could not save the images", description: error?.message ?? "This product is not yours to edit.", variant: "destructive" });
      return;
    }
    // Files no longer used, in this seller's own folder: tidy them up (not essential)
    const dropped = productImages(product)
      .filter((u) => !urls.includes(u))
      .map((u) => ownStoragePath(u, sellerId))
      .filter((p): p is string => !!p);
    if (dropped.length) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(dropped);
    setSaving(false);
    toast({ title: "Images saved", description: urls.length ? `${urls.length} image${urls.length > 1 ? "s" : ""} on ${product.name}.` : `${product.name} has no images now.` });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Images of {product.name}</DialogTitle>
          <DialogDescription>
            Up to {MAX_PRODUCT_IMAGES} images, JPG, PNG or WEBP, 5MB each. The first one is what customers see in the marketplace.
          </DialogDescription>
        </DialogHeader>

        <input ref={addRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAdd} />
        <input ref={replaceRef} type="file" accept="image/*" className="hidden" onChange={handleReplace} />

        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No images yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {items.map((it, i) => (
              <li key={it.preview} className="rounded-lg border border-border p-2 space-y-2">
                <div className="relative">
                  <img src={it.preview} alt={`${product.name} image ${i + 1}`} className="h-32 w-full rounded object-cover" />
                  <span className="absolute top-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium">
                    {i === 0 ? "Main image" : `Image ${i + 1}`}{it.file ? " · new" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move earlier">
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Move later">
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => { setReplacing(i); replaceRef.current?.click(); }}>
                    <RefreshCw className="h-3 w-3" /> Replace
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 gap-1 text-destructive" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{items.length} of {MAX_PRODUCT_IMAGES} images</p>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => addRef.current?.click()} disabled={imagesLeft(items.length) === 0}>
            <ImagePlus className="h-4 w-4" /> Add images
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save images"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductImagesDialog;
