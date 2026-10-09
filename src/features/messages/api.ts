import { useQuery } from "@tanstack/react-query";
import { db, rpc, unwrap } from "@/features/services/api";

// Private messages between signed-in people.
//
// Everything turns on one question -- is this person in this conversation --
// and the database answers it with in_conversation(), which reads auth.uid()
// rather than anything sent from here. Passing a conversation id proves
// nothing: an outsider asking for one simply gets no rows.

export const MAX_MESSAGE_CHARS = 5000;

export type Conversation = {
  id: string;
  subject: string;
  about_product_id: string | null;
  last_message_at: string;
  unread: number;
  last_body: string | null;
  last_sender_id: string | null;
  other_names: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
};

export function messageProblem(body: string): string | null {
  const t = body.trim();
  if (!t) return "Write something first.";
  if (t.length > MAX_MESSAGE_CHARS) return `Please keep it under ${MAX_MESSAGE_CHARS.toLocaleString()} characters.`;
  return null;
}

/** The inbox: only conversations this person is in, newest first. */
export function useConversations(enabled = true) {
  return useQuery({
    queryKey: ["messages", "inbox"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => (await rpc<Conversation[]>("my_conversations")) ?? [],
  });
}

/** One thread. An outsider asking for it gets nothing, not an error. */
export function useThread(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", "thread", conversationId],
    enabled: !!conversationId,
    refetchInterval: 20_000,
    queryFn: async () =>
      (unwrap(
        await db
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
      ) ?? []) as Message[],
  });
}

/** Writing into a conversation. The database pins the sender to whoever is signed in. */
export async function sendMessage(conversationId: string, body: string) {
  const problem = messageProblem(body);
  if (problem) throw new Error(problem);
  unwrap(await db.from("messages").insert({ conversation_id: conversationId, body: body.trim() }));
}

export async function markRead(conversationId: string) {
  await rpc("message_mark_read", { _conversation: conversationId });
}

/**
 * Starting one. Who may be written to is a rule, not a preference: a seller
 * only about a product they actually sell, and the office always.
 */
export async function startConversation(input:
  | { with: "admin"; subject: string; body: string }
  | { with: "seller"; product_id: string; subject: string; body: string },
): Promise<{ conversation_id: string }> {
  return rpc<{ conversation_id: string }>("message_start", { p: input });
}

/** How many unread messages in total, for a badge. */
export const totalUnread = (list: Conversation[] | undefined) =>
  (list ?? []).reduce((n, c) => n + (c.unread || 0), 0);
