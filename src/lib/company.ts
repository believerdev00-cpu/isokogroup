// Company payment accounts shown to buyers at checkout.
// Update these values to match the real company accounts.
export const COMPANY_PAYMENT = {
  momo: {
    label: "Mobile Money (MTN MoMo)",
    name: "ISOKO GROUP LTD",
    number: "*182*8*1*123456#",
    note: "Use your Order ID as the reference.",
  },
  bank: {
    label: "Bank Transfer",
    bank: "Bank of Kigali",
    name: "ISOKO GROUP LTD",
    account: "00040-12345678-90",
    swift: "BKIGRWRW",
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
