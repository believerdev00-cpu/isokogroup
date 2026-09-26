// Company payment accounts shown to buyers at checkout.
// Update these values to match the real company accounts.
export const COMPANY_PAYMENT = {
  momo: {
    label: "Mobile Money (MTN MoMo)",
    name: "ISOKO GROUPS COMPANY LTD",
    number: "*182*8*1*871951#",
    note: "Use your Order ID as the reference.",
  },
  bank: {
    label: "Bank Transfer",
    bank: "BANQUE POPULAIRE DU RWANDA(KCB)",
    name: "ISOKO GROUPS COMPANY LTD",
    account: "4491099561",
    // BPR's SWIFT/BIC code for international transfers: not known yet (it isn't in
    // the ItecPay contract or anywhere else we have). Fill it in once BPR confirms
    // it; until then the payment screens don't show a SWIFT line.
    swift: null as string | null,
  },
  auto: {
    label: "Automatic Payment (SSD)",
    note: "Coming soon — use MoMo or Bank for now.",
  },
} as const;

export const COMMISSION_RATE = 0.07; // 7% to company

// Where customers reach Isoko staff (Travel, Consultancy, Data Analysis)
export const ISOKO_CONTACT = {
  whatsapp: "250788481648", // international format, no "+"
  phone: "+250 788 481 648",
  email: "isokogrou93@gmail.com",
} as const;

// ICT & software services (software, websites, apps, systems, IT consulting,
// ICT training) are handled by the ICT team on WhatsApp.
export const ICT_CONTACT = {
  whatsapp: "250790176547", // international format, no "+"
  display: "0790176547",
} as const;

/** Consultancy services that belong to the ICT team. */
export const ICT_CONSULTANCY_KEYS = ["technology", "digital"] as const;
