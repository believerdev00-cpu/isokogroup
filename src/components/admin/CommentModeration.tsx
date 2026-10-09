import { useState } from "react";
import { AlertCircle, Check, EyeOff, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import { STATUS_LABEL, moderateComment, useAllComments, type AdminComment } from "@/features/comments/api";

const SUBJECT_LABEL: Record<string, string> = {
  research_item: "Information Hub article",
  initiative_project: "Global Initiative project",
  product: "Marketplace product",
};
const when = (iso: string) => new Date(iso).toLocaleString();

const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-wrap items-center gap-3">
    <AlertCircle className="h-4 w-4 text-destructive" />
    <p className="text-sm text-muted-foreground">We couldn&apos;t load the comments. Please try again.</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);

/**
 * The moderation queue.
 *
 * Nothing a reader wrote is public until it is approved here, so this is the
 * only thing standing between the site and a spam board. Approving is one
 * click; so is taking something back down.
 */
export default function CommentModeration() {
  const comments = useAllComments();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const rows = comments.data ?? [];
  const waiting = rows.filter((c) => c.status === "pending");
  const published = rows.filter((c) => c.status === "approved");
  const takenDown = rows.filter((c) => c.status === "hidden" || c.status === "removed");
  const counted = (n: number) => (comments.isSuccess ? ` (${n})` : "");

  const act = async (c: AdminComment, status: string, said: string) => {
    setBusy(c.id);
    try {
      await moderateComment(c.id, status);
      toast({ title: said });
      await comments.refetch();
    } catch (e) {
      toast({ title: "Could not do that", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const card = (c: AdminComment) => (
    <div key={c.id} className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{c.display_name}</span>
        {c.author_badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold uppercase text-primary">
            {c.author_badge === "admin" ? "ISOKO GROUP" : "Owner"}
          </span>
        )}
        {c.email && <span>· {c.email}</span>}
        <span>· {SUBJECT_LABEL[c.subject_type] ?? c.subject_type}</span>
        {c.parent_id && <span>· a reply</span>}
        <span>· {when(c.created_at)}</span>
        <span>· {STATUS_LABEL[c.status] ?? c.status}</span>
      </div>

      {/* Shown as text, never as markup */}
      <p className="whitespace-pre-line text-sm leading-relaxed">{c.body}</p>

      <div className="flex flex-wrap gap-2">
        {c.status !== "approved" && (
          <Button size="sm" className="gap-1" disabled={busy === c.id}
            onClick={() => act(c, "approved", "Comment published")}>
            <Check className="h-3.5 w-3.5" /> Publish
          </Button>
        )}
        {c.status !== "hidden" && (
          <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
            onClick={() => act(c, "hidden", "Comment hidden")}>
            <EyeOff className="h-3.5 w-3.5" /> Hide
          </Button>
        )}
        {c.status !== "removed" && (
          <Button size="sm" variant="outline" className="gap-1 text-destructive" disabled={busy === c.id}
            onClick={() => act(c, "removed", "Comment removed")}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>
    </div>
  );

  const section = (title: string, list: AdminComment[], empty: string) => (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}{counted(list.length)}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {comments.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : comments.isError ? <LoadFailed onRetry={() => comments.refetch()} />
          : list.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p>
          : list.map(card)}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <MessageSquare className="h-5 w-5 text-primary" /> Comments
        </h2>
        <p className="text-sm text-muted-foreground">
          Nothing a reader writes appears on the site until it is published here.
          Anything published can be taken down again at any time.
        </p>
      </div>

      {section("Waiting to be read", waiting, "Nothing is waiting.")}
      {section("Published", published, "Nothing has been published yet.")}
      {section("Hidden and removed", takenDown, "Nothing has been taken down.")}
    </div>
  );
}
