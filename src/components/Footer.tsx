import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Youtube, Instagram } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import logo from "@/assets/isoko-logo.jpeg";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const socials = [
  {
    name: "YouTube",
    Icon: Youtube,
    links: [
      { label: "ISOKO ENTERTAINMENT", url: "https://youtu.be/KjN65T1qA7c?si=8RPTzXJNhZI1b3Bs" },
      { label: "Isoko Group ", url: "https://youtube.com/shorts/2zXVi01BI9s?si=ly0LXTSTdbTkWYJk" },
      { label: "Isoko Studioz", url: "https://youtube.com/shorts/SRKsJk6D8aY?si=uhQ0Xgu3dqUvsZ6h" },
    ],
  },
  {
    name: "Instagram",
    Icon: Instagram,
    links: [
      { label: "Star Wax", url: "https://www.instagram.com/p/DXv9vurjI45/?igsh=dTg1OTk0ODlpZGNp" },
      { label: "Isoko Studioz", url: "https://www.instagram.com/p/DU0vkdpDete/?igsh=MWp2cHVkYzVxdTZlaw==" },
      { label: "Isoko Group Logistics", url: "https://www.instagram.com/reel/DWvjvOkCE8p/?igsh=MTQwNmd5eWZ2c2FkZA==" },
      { label: "Isoko Group Ltd", url: "https://www.instagram.com/isokogrou?igsh=bXM1OHpndno0Y3Bv" },
    ],
  },
  {
    name: "TikTok",
    // Lucide has no TikTok icon — use inline SVG
    Icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.69a8.16 8.16 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1.84-.07Z" />
      </svg>
    ),
    links: [
      { label: "Isoko Group Ltd", url: "https://vt.tiktok.com/ZS9a6kw2e/" },
      { label: "Isoko Studioz", url: "https://vt.tiktok.com/ZS9aMNuVe/" },
      { label: "Isoko Movie", url: "https://vt.tiktok.com/ZS9aMx5rj/" },
    ],
  },
];

const Footer = () => {
  const { t } = useI18n();
  return (
    <footer className="bg-card text-foreground border-t border-border">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <img src={logo} alt="ISOKO GROUP" className="h-10 w-10 rounded-full object-cover" />
              <span className="text-xl font-bold font-display">ISOKO GROUP</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("footer.tagline")}</p>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">{t("footer.services")}</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link to="/logistics" className="hover:text-primary transition-colors">{t("nav.logistics")}</Link></li>
              <li><Link to="/marketplace" className="hover:text-primary transition-colors">{t("nav.marketplace")}</Link></li>
              <li><Link to="/e-library" className="hover:text-primary transition-colors">{t("nav.elibrary")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">{t("footer.company")}</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link to="/about" className="hover:text-primary transition-colors">{t("footer.aboutUs")}</Link></li>
              <li><Link to="/become-seller" className="hover:text-primary transition-colors">{t("nav.becomeSeller")}</Link></li>
              <li><Link to="/login" className="hover:text-primary transition-colors">{t("nav.login")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">{t("footer.contact")}</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <a href="mailto:isokogrou93@gmail.com" className="hover:text-primary transition-colors break-all">isokogrou93@gmail.com</a>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <a href="tel:+250788481648" className="hover:text-primary transition-colors">0788 481 648</a>
                  <a href="tel:+250793736574" className="hover:text-primary transition-colors">0793 736 574</a>
                  <a href="tel:+250790176547" className="hover:text-primary transition-colors">0790 176 547</a>
                </div>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" /> Kimironko, KG 15 Ave (around the market), Kigali
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12">
          <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Find us
          </h4>
          <div className="rounded-xl overflow-hidden border border-border">
            <iframe
              title="ISOKO GROUP location"
              src="https://www.google.com/maps?q=Kimironko+Market,+KG+15+Ave,+Kigali&output=embed"
              width="100%"
              height="280"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="block w-full border-0"
            />
          </div>
          <a
            href="https://www.google.com/maps/search/?api=1&query=Kimironko+Market+KG+15+Ave+Kigali"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sm text-primary hover:underline"
          >
            Open in Google Maps →
          </a>
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ISOKO GROUP. {t("footer.rights")}</p>
          <div className="flex items-center gap-2">
            {socials.map(({ name, Icon, links }) => (
              <Popover key={name}>
                <PopoverTrigger
                  aria-label={name}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-border bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <div className="flex flex-col">
                    {links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
