import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Bookmark, BookOpen, Upload, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";

const categories = ["All", "Business", "Technology", "History", "Self-Help", "Science", "Literature", "Other"];

type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  pages: number;
  cover_url: string | null;
  content_url: string | null;
  description: string | null;
};

const ELibrary = () => {
  const [active, setActive] = useState("All");
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [reading, setReading] = useState<Book | null>(null);
  const [uploading, setUploading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();

  const [form, setForm] = useState({
    title: "",
    author: "",
    category: "Business",
    pages: 0,
    description: "",
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [contentFile, setContentFile] = useState<File | null>(null);

  const fetchBooks = async () => {
    const { data } = await supabase.from("books").select("*").order("created_at", { ascending: false });
    if (data) setBooks(data as Book[]);
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const filtered = books
    .filter((b) => active === "All" || b.category === active)
    .filter(
      (b) =>
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        b.author.toLowerCase().includes(search.toLowerCase())
    );

  // Fade-in book cards on scroll
  useEffect(() => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll(".book-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.animationDelay = `${(i % 8) * 60}ms`;
            el.classList.add("in-view");
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [filtered.length]);

  const uploadToBucket = async (file: File, prefix: string) => {
    const ext = file.name.split(".").pop();
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("books").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("books").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast({ title: "Admins only", description: "Only administrators can upload books.", variant: "destructive" });
      return;
    }
    if (!form.title.trim() || !form.author.trim()) {
      toast({ title: "Missing fields", description: "Title and author are required.", variant: "destructive" });
      return;
    }
    if (!contentFile) {
      toast({ title: "Book file required", description: "Upload a PDF or EPUB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Parallel uploads for faster results
      const [cover_url, content_url] = await Promise.all([
        coverFile ? uploadToBucket(coverFile, "covers") : Promise.resolve(null),
        uploadToBucket(contentFile, "content"),
      ]);
      const { error } = await supabase.from("books").insert({
        title: form.title.trim(),
        author: form.author.trim(),
        category: form.category,
        pages: Number(form.pages) || 0,
        description: form.description.trim() || null,
        cover_url,
        content_url,
      });
      if (error) throw error;
      toast({ title: "Book uploaded", description: form.title });
      setForm({ title: "", author: "", category: "Business", pages: 0, description: "" });
      setCoverFile(null);
      setContentFile(null);
      fetchBooks();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removed" });
      fetchBooks();
    }
  };

  const handleRead = (book: Book) => {
    if (!book.content_url) {
      toast({ title: "Not available", description: "This book has no readable file yet.", variant: "destructive" });
      return;
    }
    setReading(book);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-10 space-y-4">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("nav.elibrary")}</span>
            <h1 className="text-4xl md:text-5xl font-display font-bold">{t("elibrary.title")}</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">{t("elibrary.subtitle")}</p>
          </div>

          <div className="max-w-md mx-auto relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("elibrary.search")} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActive(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {cat}
              </button>
            ))}
          </div>

          {/* Reading modal — embed uploaded PDF (read-only, no download UI) */}
          {reading && (
            <div className="mb-8 rounded-xl border border-border bg-card p-4 md:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3 gap-3">
                <h2 className="text-lg md:text-xl font-bold flex items-center gap-2 min-w-0">
                  <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="truncate">Reading: {reading.title}</span>
                </h2>
                <Button variant="outline" size="sm" onClick={() => setReading(null)}>Close</Button>
              </div>
              <iframe
                src={`${reading.content_url}#toolbar=0&navpanes=0`}
                title={reading.title}
                className="w-full h-[70vh] rounded-lg border border-border bg-muted"
              />
            </div>
          )}

          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground col-span-full py-10">
                No books available yet. {isAdmin ? "Upload your first book above." : "Check back soon."}
              </p>
            )}
            {filtered.map((book) => (
              <div key={book.id} className="book-card group card-interactive rounded-xl border border-border bg-card p-5">
                <div className="book-3d mb-4">
                <div className="book-cover relative aspect-[3/4] rounded-lg overflow-hidden bg-muted">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt={book.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <button className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 text-muted-foreground hover:text-primary transition-colors">
                    <Bookmark className="h-4 w-4" />
                  </button>
                </div>
                </div>
                <span className="text-xs text-primary font-medium">{book.category}</span>
                <h3 className="font-semibold text-sm mt-1">{book.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">by {book.author}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">{book.pages} {t("elibrary.pages")}</span>
                  <div className="flex gap-1">
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(book.id)} aria-label="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => handleRead(book)}>
                      <BookOpen className="h-3 w-3" /> {t("elibrary.readNow")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default ELibrary;
