import { Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

import wirelessEarbuds from "@/assets/products/wireless-earbuds.jpg";
import coffeeBeans from "@/assets/products/coffee-beans.jpg";
import handwovenBasket from "@/assets/products/handwoven-basket.jpg";
import smartWatch from "@/assets/products/smart-watch.jpg";

import artOfBusiness from "@/assets/books/art-of-business.jpg";
import rwandaRising from "@/assets/books/rwanda-rising.jpg";
import digitalInnovation from "@/assets/books/digital-innovation.jpg";
import leadershipEssentials from "@/assets/books/leadership-essentials.jpg";

const products = [
  { name: "Wireless Earbuds Pro", price: "12,500 RWF", rating: 4.8, category: "Electronics", image: wirelessEarbuds },
  { name: "Organic Coffee Beans", price: "8,000 RWF", rating: 4.9, category: "Beverages", image: coffeeBeans },
  { name: "Handwoven Basket", price: "15,000 RWF", rating: 4.7, category: "Home", image: handwovenBasket },
  { name: "Smart Watch Band", price: "22,000 RWF", rating: 4.6, category: "Accessories", image: smartWatch },
];

const books = [
  { title: "The Art of Business", author: "Jean Paul M.", category: "Business", image: artOfBusiness },
  { title: "Rwanda Rising", author: "Marie Claire N.", category: "History", image: rwandaRising },
  { title: "Digital Innovation", author: "Patrick K.", category: "Technology", image: digitalInnovation },
  { title: "Leadership Essentials", author: "Grace U.", category: "Self-Help", image: leadershipEssentials },
];

const FeaturedSection = () => {
  const { t } = useI18n();
  return (
    <>
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="flex items-end justify-between mb-12">
            <div className="space-y-2">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("nav.marketplace")}</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">{t("featured.products")}</h2>
            </div>
            <Link to="/marketplace" className="hidden md:flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all">
              {t("featured.viewAll")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product, i) => (
              <div key={i} className="group rounded-xl border border-border bg-card overflow-hidden hover-lift">
                <div className="aspect-square overflow-hidden">
                  <img src={product.image} alt={product.name} loading="lazy" width={512} height={512} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-4 space-y-2">
                  <span className="text-xs text-primary font-medium">{product.category}</span>
                  <h3 className="font-semibold text-sm">{product.name}</h3>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary">{product.price}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-primary text-primary" />
                      {product.rating}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <div className="flex items-end justify-between mb-12">
            <div className="space-y-2">
              <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("nav.elibrary")}</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold">{t("featured.books")}</h2>
            </div>
            <Link to="/e-library" className="hidden md:flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all">
              {t("featured.browseLibrary")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {books.map((book, i) => (
              <div key={i} className="group rounded-xl border border-border bg-card p-5 hover-lift">
                <div className="aspect-[3/4] rounded-lg overflow-hidden mb-4">
                  <img src={book.image} alt={book.title} loading="lazy" width={512} height={680} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <span className="text-xs text-primary font-medium">{book.category}</span>
                <h3 className="font-semibold text-sm mt-1">{book.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">by {book.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default FeaturedSection;
