import { MessageCircle } from "lucide-react";
import { ICT_CONTACT } from "@/lib/company";
import { cn } from "@/lib/utils";

// ICT and software requests go to the ICT team on WhatsApp for faster help and
// project discussions. Other departments keep their own contact numbers.

export const ICT_MESSAGE =
  "Thank you for your interest in our ICT services. To ensure faster assistance and detailed project discussions, please contact our ICT team directly on WhatsApp: 0790176547.";

export function ictWhatsappLink(topic?: string) {
  const text = `Hello Isoko ICT team, I'm interested in ${topic ?? "your ICT services"}.`;
  return `https://wa.me/${ICT_CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** The notice with a prominent WhatsApp button, for ICT service pages, request forms and checkouts. */
export function IctWhatsAppNotice({ topic, className }: { topic?: string; className?: string }) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-[#1f9d55]/40 bg-[#1f9d55]/10 p-5 text-left sm:flex-row sm:items-center",
        className,
      )}
      aria-label="Contact the ICT team on WhatsApp"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1f9d55] text-white">
        <MessageCircle className="h-6 w-6" aria-hidden />
      </span>
      <p className="flex-1 text-sm leading-relaxed">{ICT_MESSAGE}</p>
      <a
        href={ictWhatsappLink(topic)}
        target="_blank"
        rel="noopener noreferrer"
        className="press inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1f9d55] px-6 text-base font-semibold text-white hover:bg-[#188047]"
      >
        <MessageCircle className="h-5 w-5" aria-hidden /> WhatsApp {ICT_CONTACT.display}
      </a>
    </aside>
  );
}

/** A floating WhatsApp button that stays visible on ICT service pages. */
export function IctWhatsAppFloat({ topic, compact = false }: { topic?: string; compact?: boolean }) {
  return (
    <a
      href={ictWhatsappLink(topic)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with the ICT team on WhatsApp, ${ICT_CONTACT.display}`}
      title={`WhatsApp ${ICT_CONTACT.display}`}
      className={cn(
        "press fixed bottom-5 right-5 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-[#1f9d55] font-semibold text-white shadow-xl hover:bg-[#188047]",
        compact ? "w-14 justify-center" : "px-4 sm:px-5",
      )}
    >
      <MessageCircle className="h-6 w-6" aria-hidden />
      {!compact && <span className="hidden sm:inline">ICT team on WhatsApp</span>}
    </a>
  );
}
