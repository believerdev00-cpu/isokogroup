import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { Loading, Section } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { PublicHero } from "@/training/features/public/shared";

export default function Contact() {
  const center = useCenter();
  const c = center.data;
  return (
    <>
      <PublicHero eyebrow="Get in touch" title="Contact us">
        Questions about programs, fees or your application? Call, email or visit our office.
      </PublicHero>
      <div className="container grid gap-6 py-10 lg:grid-cols-3">
        {center.isLoading || !c ? (
          <Loading />
        ) : (
          <>
            <Section title="Reach us" className="lg:col-span-2">
              <ul className="space-y-5">
                <li className="flex gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="font-semibold text-primary hover:underline">{c.phone}</a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                    <a href={`mailto:${c.email}`} className="font-semibold text-primary hover:underline">{c.email}</a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</p>
                    <p className="font-semibold">{c.address}</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Office hours</p>
                    <p className="font-semibold">Monday – Friday, 8:00 AM – 5:00 PM</p>
                    <p className="text-sm text-muted-foreground">Saturday, 9:00 AM – 12:00 PM</p>
                  </div>
                </li>
              </ul>
            </Section>
            <Section title="Already applied?">
              <p className="text-sm text-muted-foreground">Check your application with your application number and the email you used.</p>
              <Link to="/training-center/application-status" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                Check your status →
              </Link>
              <p className="mt-6 text-sm text-muted-foreground">Checking a certificate?</p>
              <Link to="/training-center/verify" className="mt-1 inline-block text-sm font-semibold text-primary hover:underline">
                Verify a certificate →
              </Link>
            </Section>
          </>
        )}
      </div>
    </>
  );
}
