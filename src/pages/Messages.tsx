import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Loader2, Send } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/features/services/api";
import {
  MAX_MESSAGE_CHARS, markRead, messageProblem, sendMessage, useConversations, useThread,
} from "@/features/messages/api";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
};

/**
 * The inbox.
 *
 * Signed-in only, because a private conversation needs two people who can be
 * identified. Anyone else has the contact form, which is what it is for.
 *
 * Nothing here decides who may read what: the database does, by membership.
 * Asking for a conversation you are not in returns nothing at all.
 */
export default function Messages() {
  const { user, loading } = useAuth();
  const conversations = useConversations(!!user);
  const [openId, setOpenId] = useState<string | null>(null);
  const thread = useThread(openId);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const foot = useRef<HTMLDivElement>(null);

  const list = conversations.data ?? [];
  const current = list.find((c) => c.id === openId) ?? null;

  // opening a thread marks it read, so the badge means what it says
  useEffect(() => {
    if (!openId) return;
    markRead(openId).then(() => conversations.refetch()).catch(() => {});
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [thread.data?.length, openId]);

  const send = async () => {
    if (!openId) return;
    const bad = messageProblem(body);
    if (bad) return setError(bad);
    setSending(true);
    setError(null);
    try {
      await sendMessage(openId, body);
      setBody("");
      await Promise.all([thread.refetch(), conversations.refetch()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="min-h-screen"><Header /><main className="container py-16" /><Footer /></div>;

  if (!user) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-16">
          <div className="mx-auto max-w-md space-y-4 rounded-xl border border-border p-8 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold">Your messages</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to read and send private messages. If you just want to reach us, the
              contact form does not need an account.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/login"><Button>Sign in</Button></Link>
              <Link to="/contact"><Button variant="outline">Contact us instead</Button></Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-10">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold md:text-3xl">
          <Inbox className="h-6 w-6 text-primary" /> Messages
        </h1>

        <div className="mt-6 grid gap-4 md:grid-cols-[320px_1fr]">
          {/* the inbox */}
          <aside className="rounded-xl border border-border">
            {conversations.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : conversations.isError ? (
              <div className="space-y-2 p-4">
                <p className="text-sm text-muted-foreground">We couldn&apos;t load your messages.</p>
                <Button variant="outline" size="sm" onClick={() => conversations.refetch()}>Try again</Button>
              </div>
            ) : list.length === 0 ? (
              <div className="space-y-2 p-4">
                <p className="text-sm text-muted-foreground">No messages yet.</p>
                <Link to="/contact" className="text-sm text-primary hover:underline">Write to ISOKO Groups</Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(c.id)}
                      className={cn("w-full px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        openId === c.id && "bg-muted")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.subject}</span>
                        {c.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.other_names || "ISOKO GROUP"}</p>
                      {c.last_body && <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_body}</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{when(c.last_message_at)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* the conversation */}
          <section className="flex min-h-[26rem] flex-col rounded-xl border border-border">
            {!current ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Choose a conversation to read it.
              </div>
            ) : (
              <>
                <div className="border-b border-border px-4 py-3">
                  <p className="font-semibold">{current.subject}</p>
                  <p className="text-xs text-muted-foreground">{current.other_names || "ISOKO GROUP"}</p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {thread.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : (thread.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing here yet.</p>
                  ) : (
                    (thread.data ?? []).map((m) => {
                      const mine = m.sender_id === user.id;
                      return (
                        <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2",
                            mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                            {/* text, never markup */}
                            <p className="whitespace-pre-line text-sm leading-relaxed">{m.body}</p>
                            <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                              {when(m.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={foot} />
                </div>

                <div className="space-y-2 border-t border-border p-3">
                  <Textarea
                    rows={2}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a reply…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
                    }}
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {body.trim().length} of {MAX_MESSAGE_CHARS.toLocaleString()} · Ctrl+Enter sends
                    </span>
                    <Button size="sm" className="gap-2" disabled={sending || !!messageProblem(body)} onClick={send}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
