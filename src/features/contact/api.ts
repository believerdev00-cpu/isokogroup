import { useQuery } from "@tanstack/react-query";
import { db, rpc, unwrap } from "@/features/services/api";

// Writing to ISOKO Groups. No account needed: a complaint that requires one is
// a complaint you never hear.
//
// Submitting goes through contact_submit_message() rather than an insert, so
// the table has no insert policy at all. The function sets the account and the
// status, which is why a message cannot arrive already marked answered.

export const TOPICS = [
  { key: "enquiry", label: "General enquiry" },
  { key: "business", label: "Business or partnership" },
  { key: "suggestion", label: "Suggestion" },
  { key: "complaint", label: "Complaint" },
  { key: "other", label: "Something else" },
];

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  read: "Read",
  replied: "Replied",
  closed: "Closed",
};

export type ContactMessage = {
  id: string;
  reference: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  topic: string;
  subject: string;
  message: string;
  status: string;
  staff_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ContactInput = {
  full_name: string;
  email: string;
  phone?: string;
  topic: string;
  subject: string;
  message: string;
};

/** The problem with the form, in the words the person needs, or null. */
export function contactProblem(input: ContactInput): string | null {
  if (!input.full_name.trim()) return "Please give your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Please check the email address.";
  if (!input.subject.trim()) return "Please give your message a subject.";
  if (!input.message.trim()) return "Please write your message.";
  if (input.message.trim().length > 5000) return "That message is too long. Please keep it under 5,000 characters.";
  if (input.subject.trim().length > 160) return "That subject is too long.";
  if ((input.phone ?? "").trim().length > 40) return "That phone number is too long.";
  if (!TOPICS.some((t) => t.key === input.topic)) return "Please choose what your message is about.";
  return null;
}

export async function sendContactMessage(input: ContactInput): Promise<{ reference: string }> {
  const problem = contactProblem(input);
  if (problem) throw new Error(problem);
  return rpc<{ reference: string }>("contact_submit_message", {
    p: {
      full_name: input.full_name.trim(),
      email: input.email.trim(),
      phone: (input.phone ?? "").trim() || undefined,
      topic: input.topic,
      subject: input.subject.trim(),
      message: input.message.trim(),
    },
  });
}

/** Every message, for the office. */
export function useContactMessages() {
  return useQuery({
    queryKey: ["contact", "admin"],
    queryFn: async () =>
      (unwrap(
        await db.from("contact_messages").select("*").order("created_at", { ascending: false }),
      ) ?? []) as ContactMessage[],
  });
}

export async function setContactStatus(id: string, status: string, staffNotes?: string) {
  const patch: Record<string, unknown> = { status };
  if (staffNotes !== undefined) patch.staff_notes = staffNotes;
  unwrap(await db.from("contact_messages").update(patch).eq("id", id));
}
