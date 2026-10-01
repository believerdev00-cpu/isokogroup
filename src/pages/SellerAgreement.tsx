import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText } from "lucide-react";
import {
  SELLER_AGREEMENT_SECTIONS,
  SELLER_AGREEMENT_VERSION,
  SELLER_DECLARATION,
} from "@/lib/sellerAgreement";

// The ISOKO Seller Registration and Compliance Agreement, as a page sellers
// read before they apply (linked from the application form and the footer)
const SellerAgreement = () => (
  <div className="min-h-screen">
    <Header />
    <section className="py-16">
      <div className="container max-w-3xl">
        <div className="text-center mb-10 space-y-3">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">ISOKO GROUPS COMPANY LTD</span>
          <h1 className="text-3xl md:text-4xl font-display font-bold">Seller Registration and Compliance Agreement</h1>
          <p className="text-muted-foreground">
            Before becoming a Seller on the ISOKO platform, you are required to provide correct information and agree to the
            following terms.
          </p>
          <p className="text-xs text-muted-foreground">Version {SELLER_AGREEMENT_VERSION}</p>
        </div>

        <article className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-8">
          {SELLER_AGREEMENT_SECTIONS.map((s) => (
            <section key={s.title} className="space-y-3">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
              ))}
              {s.bullets && (
                <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                  {s.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              {s.after?.map((p) => (
                <p key={p} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
              ))}
            </section>
          ))}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">11. Seller Declaration</h2>
            <p className="text-sm text-muted-foreground">By completing this registration, I confirm that:</p>
            <ul className="space-y-2">
              {SELLER_DECLARATION.map((d) => (
                <li key={d} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /> {d}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2 font-medium text-foreground"><FileText className="h-4 w-4 text-primary" /> How you sign it</p>
            <p>
              The seller registration form asks for your name, business, telephone, email, country, TIN, business address and your
              private bank or Mobile Money payout details, then the agreement checkbox. Sending the form records your acceptance
              of this version of the agreement, with the date and time.
            </p>
          </section>
        </article>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" className="hover-glow"><Link to="/become-seller">Register as a seller</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/seller">Seller dashboard</Link></Button>
        </div>
      </div>
    </section>
    <Footer />
  </div>
);

export default SellerAgreement;
