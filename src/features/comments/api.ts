import { useQuery } from "@tanstack/react-query";
import { db, rpc, unwrap } from "@/features/services/api";

// Comments on things the public can see. Nothing appears until somebody
// approves it: an unmoderated comment box on a company site becomes a spam
// board within days.
//
// Writing goes through comment_submit() rather than an insert, so the table has
// no insert policy. The function decides the status and the author badge, which
// is why a comment cannot arrive pre-approved or wearing a badge it sent itself.

export type CommentSubject = "research_item" | "initiative_project" | "product";

export const MAX_COMMENT_CHARS = 2000;
export const MAX_NAME_CHARS = 80;

export const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  approved: "Published",
  hidden: "Hidden",
  removed: "Removed",
};

/** A comment as the public sees it: no email, no account id. */
export type PublicComment = {
  id: string;
  subject_type: string;
  subject_id: string;
  parent_id: string | null;
  display_name: string;
  body: string;
  author_badge: "admin" | "owner" | null;
  created_at: string;
};

/** Everything, for moderation. */
export type AdminComment = PublicComment & {
  user_id: string | null;
  email: string | null;
  status: string;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
};

export type CommentInput = {
  subject_type: CommentSubject;
  subject_id: string;
  parent_id?: string | null;
  display_name: string;
  email?: string;
  body: string;
};

/** The problem with a comment, in the words the person needs, or null. */
export function commentProblem(input: CommentInput): string | null {
  const name = input.display_name.trim();
  const body = input.body.trim();
  if (!name) return "Please give a name to show with your comment.";
  if (name.length > MAX_NAME_CHARS) return "That name is too long.";
  if (!body) return "Please write your comment.";
  if (body.length > MAX_COMMENT_CHARS) return `Please keep your comment under ${MAX_COMMENT_CHARS.toLocaleString()} characters.`;
  const email = (input.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please check the email address.";
  return null;
}

export async function submitComment(input: CommentInput): Promise<{ id: string; status: string }> {
  const problem = commentProblem(input);
  if (problem) throw new Error(problem);
  return rpc<{ id: string; status: string }>("comment_submit", {
    p: {
      subject_type: input.subject_type,
      subject_id: input.subject_id,
      parent_id: input.parent_id ?? undefined,
      display_name: input.display_name.trim(),
      email: (input.email ?? "").trim() || undefined,
      body: input.body.trim(),
    },
  });
}

/** Approved comments on one thing, oldest first so a conversation reads forward. */
export function usePublicComments(subjectType: CommentSubject, subjectId: string | undefined) {
  return useQuery({
    queryKey: ["comments", subjectType, subjectId],
    enabled: !!subjectId,
    queryFn: async () =>
      (unwrap(
        await db
          .from("public_comments")
          .select("*")
          .eq("subject_type", subjectType)
          .eq("subject_id", subjectId)
          .order("created_at", { ascending: true }),
      ) ?? []) as PublicComment[],
  });
}

/** Everything waiting, for the moderation desk. */
export function useAllComments() {
  return useQuery({
    queryKey: ["comments", "admin"],
    queryFn: async () =>
      (unwrap(
        await db.from("comments").select("*").order("created_at", { ascending: false }),
      ) ?? []) as AdminComment[],
  });
}

export async function moderateComment(id: string, status: string, note?: string) {
  const patch: Record<string, unknown> = { status };
  if (note !== undefined) patch.moderation_note = note;
  unwrap(await db.from("comments").update(patch).eq("id", id));
}

/** Top-level comments, each with the replies that answer it. */
export function threaded(comments: PublicComment[]) {
  const tops = comments.filter((c) => !c.parent_id);
  const repliesFor = (id: string) => comments.filter((c) => c.parent_id === id);
  return tops.map((c) => ({ comment: c, replies: repliesFor(c.id) }));
}
