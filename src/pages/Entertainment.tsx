import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Film, Mic, Search, Play, Trash2, Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLibraryLinks } from "@/lib/libraryFiles";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/use-is-admin";

type EntItem = {
  id: string;
  title: string;
  creator: string;
  type: "film" | "podcast";
  category: string;
  description: string | null;
  price: number;
  cover_url: string | null;
  media_url: string | null;
  duration_minutes: number;
  trending: boolean;
};

const Entertainment = () => {
  const [items, setItems] = useState<EntItem[]>([]);
  const [tab, setTab] = useState<"all" | "film" | "podcast">("all");
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<EntItem | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();

  const fetchItems = async () => {
    const { data } = await supabase
      .from("entertainment")
      .select("*")
      .order("trending", { ascending: false })
      .order("created_at", { ascending: false });
    // Files are for subscribers: swap stored paths for short-lived links
    if (data) setItems(await withLibraryLinks("entertainment", data as EntItem[], ["cover_url", "media_url"]));
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filtered = items
    .filter((i) => tab === "all" || i.type === tab)
    .filter(
      (i) =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.creator.toLowerCase().includes(search.toLowerCase())
    );

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("entertainment").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removed" });
      fetchItems();
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-10 space-y-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">Isoko Entertainment</span>
            <h1 className="text-4xl md:text-5xl font-display font-bold">Creative Media & Digital Storytelling</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Isoko Entertainment is a dynamic creative platform under Isoko Groups Company Ltd, dedicated to producing impactful media content that informs, inspires, and connects audiences. We specialize in storytelling through film, audio, and digital platforms — helping brands, creators, and communities share their voice with the world.
            </p>
          </div>

          {/* What We Create */}
          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">What We Create</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: Film, title: "Film Production", desc: "High-quality films, documentaries, and visual content that tell powerful stories and promote brands with creativity and professionalism." },
                { icon: Mic, title: "Podcast Production", desc: "Engaging podcasts that educate, entertain, and spark meaningful conversations across diverse audiences." },
                { icon: Flame, title: "Digital Content", desc: "From social media content to branded campaigns — creative materials that capture attention and drive engagement." },
                { icon: Play, title: "E-Library Content", desc: "Educational and inspirational digital resources that support learning and knowledge sharing." },
              ].map((c) => (
                <div key={c.title} className="rounded-xl border border-border bg-card p-5 hover-lift">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <c.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Purpose / Vision / Mission */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
            {[
              { title: "Our Purpose", desc: "We believe in the power of content to shape ideas and influence communities. Our goal is to deliver creative solutions that entertain, educate, and inspire positive change." },
              { title: "Our Vision", desc: "To become a leading creative media hub in Africa, recognized for innovative storytelling and impactful digital content." },
              { title: "Our Mission", desc: "To produce high-quality, meaningful content that connects brands and audiences through creativity, technology, and storytelling." },
            ].map((b) => (
              <div key={b.title} className="rounded-xl border border-primary/20 bg-gradient-to-br from-card to-primary/5 p-6">
                <h3 className="text-lg font-display font-bold text-primary mb-2">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-display font-bold">Trending Films & Podcasts</h2>
            <p className="text-muted-foreground mt-2">Stream curated films and podcasts from creators across the region.</p>
          </div>

          {/* Admin uploads happen in the Admin Dashboard → Entertainment tab. */}

          <div className="max-w-md mx-auto relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search films or podcasts..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex justify-center gap-2 mb-10">
            {(["all", "film", "podcast"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {t === "all" ? "All" : t + "s"}
              </button>
            ))}
          </div>

          {playing && (
            <div className="mb-8 rounded-xl border border-border bg-card p-4 md:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3 gap-3">
                <h2 className="text-lg font-bold flex items-center gap-2 min-w-0">
                  {playing.type === "film" ? <Film className="h-5 w-5 text-primary" /> : <Mic className="h-5 w-5 text-primary" />}
                  <span className="truncate">{playing.title}</span>
                </h2>
                <Button variant="outline" size="sm" onClick={() => setPlaying(null)}>Close</Button>
              </div>
              {playing.media_url && (
                playing.type === "film" ? (
                  <video src={playing.media_url} controls className="w-full rounded-lg bg-black aspect-video" />
                ) : (
                  <audio src={playing.media_url} controls className="w-full" />
                )
              )}
            </div>
          )}

          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground col-span-full py-10">No items yet.</p>
            )}
            {filtered.map((item) => (
              <div key={item.id} className="group rounded-xl border border-border bg-card p-5 hover-lift">
                <div className="relative aspect-video rounded-lg overflow-hidden mb-4 bg-muted">
                  {item.cover_url ? (
                    <img src={item.cover_url} alt={item.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.type === "film" ? <Film className="h-12 w-12 text-muted-foreground" /> : <Mic className="h-12 w-12 text-muted-foreground" />}
                    </div>
                  )}
                  {item.trending && (
                    <Badge className="absolute top-2 left-2 gap-1 bg-primary text-primary-foreground">
                      <Flame className="h-3 w-3" /> Trending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary font-medium capitalize">{item.type} · {item.category}</span>
                  <span className="text-xs text-muted-foreground">{item.duration_minutes}m</span>
                </div>
                <h3 className="font-semibold text-sm mt-1 truncate">{item.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">by {item.creator}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-bold text-primary">{item.price > 0 ? `${item.price} RWF` : "Free"}</span>
                  <div className="flex gap-1">
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} aria-label="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setPlaying(item)} disabled={!item.media_url}>
                      <Play className="h-3 w-3" /> Play
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

export default Entertainment;
