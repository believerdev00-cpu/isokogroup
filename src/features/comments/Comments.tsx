import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, Reply, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/features/services/api";
import {
  MAX_COMMENT_CHARS, commentProblem, submitComment, threaded, usePublicComments,
  type CommentSubject, type PublicComment,
} from "./api";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Marks a reply that came from the company rather than from a reader. */
function Badge({ badge }: { badge: PublicComment["author_badge"] }) {
  if (!badge) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      <ShieldCheck className="h-3 w-3" />
      {badge === "admin" ? "ISOKO GROUP" : "Owner"}
    </span>
  );
}

function One({ c, onReply }: { c: PublicComment; onReply?: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{c.display_name}</span>
        <Badge badge={c.author_badge} />
        <span className="text-xs text-muted-foreground">{when(c.created_at)}</span>
      </div>
      {/* Rendered as text. Whatever somebody typed is shown as the characters
          they typed, never as markup. */}
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{c.body}</p>
      {onReply && (
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onReply}>
          <Reply className="h-3 w-3" /> Reply
        </Button>
      )}
    </div>
  );
}

/**
 * Comments on one thing.
 *
 * Anyone may write; nothing appears until it is approved, and the form says so
 * rather than letting somebody wonder why their comment vanished. Signing in is
 * not required: the people worth hearing from are often the least likely to
 * register first.
 */
export default function Comments({
  subjectType, subjectId, title = "Comments",
}: { subjectType: CommentSubject; subjectId: string | undefined; title?: string }) {
  const { user } = useAuth();
  const comments = usePublicComments(subjectType, subjectId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!subjectId) return null;
  const list = threaded(comments.data ?? []);

  const draft = {
    subject_type: subjectType, subject_id: subjectId,
    parent_id: replyTo, display_name: name, email, body,
  };
  const problem = commentProblem(draft);

  const send = async () => {
    setError(null);
    const bad = commentProblem(draft);
    if (bad) return setError(bad);
    setSending(true);
    try {
      await submitComment(draft);
      setSent(true);
      setBody("");
      setReplyTo(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-10 border-t border-border pt-8" aria-labelledby="comments-title">
      <h2 id="comments-title" className="flex items-center gap-2 font-display text-xl font-bold">
        <MessageSquare className="h-5 w-5 text-primary" />
        {title}
        {comments.isSuccess && list.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
        )}
      </h2>

      <div className="mt-5 space-y-6">
        {comments.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : comments.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">We couldn&apos;t load the comments.</p>
            <Button variant="outline" size="sm" onClick={() => comments.refetch()}>Try again</Button>
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to write one.</p>
        ) : (
          list.map(({ comment, replies }) => (
            <div key={comment.id} className="space-y-3">
              <One c={comment} onReply={() => { setReplyTo(comment.id); setSent(false); }} />
              {replies.length > 0 && (
                <div className="space-y-3 border-l-2 border-border pl-4">
                  {replies.map((r) => <One key={r.id} c={r} />)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-8 rounded-xl border border-border p-5">
        {sent ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-primary" />
            <p className="text-sm font-semibold">Thank you — your comment has been sent.</p>
            <p className="text-sm text-muted-foreground">
              Our team reads every comment before it appears, so it will not show up straight away.
            </p>
            <Button variant="outline" size="sm" onClick={() => setSent(false)}>Write another</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              {replyTo ? "Write a reply" : "Leave a comment"}
              {replyTo && (
                <Button variant="ghost" size="sm" className="ml-2 h-6 px-2 text-xs" onClick={() => setReplyTo(null)}>
                  Cancel reply
                </Button>
              )}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cm-name">Your name</Label>
                <Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="How it should appear" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cm-email">Email (optional, never shown)</Label>
                <Input id="cm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={user?.email ?? "So we can reply if needed"} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-body">Your comment</Label>
              <Textarea id="cm-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {body.trim().length} of {MAX_COMMENT_CHARS.toLocaleString()} characters ·
                comments are read by our team before they appear
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="button" className="gap-2" disabled={sending || !!problem} onClick={send}>
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Post comment</>}
            </Button>
            {problem && <p className="text-xs text-muted-foreground">{problem}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
