import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bump } from "@/components/motion";
import { useConversations, totalUnread } from "@/features/messages/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/**
 * The way into the inbox, with a count of what is waiting.
 *
 * The count comes from my_conversations(), which only ever returns this
 * person's own conversations -- so there is nothing to filter here and no id
 * to pass. Signed-out visitors get no icon at all: there is no inbox to show
 * them, and the contact form is the route in.
 */
const MessagesBadge = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data } = useConversations(!!user);
  const unread = totalUnread(data);

  if (!user) return null;

  return (
    <Link to="/messages" aria-label={unread > 0 ? `${t("nav.messages")} (${unread} unread)` : t("nav.messages")}>
      <Button variant="ghost" size="icon" className="relative">
        <MessageSquare className="h-4 w-4" />
        {unread > 0 && (
          <Bump value={unread} className="absolute -top-0.5 -right-0.5">
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          </Bump>
        )}
      </Button>
    </Link>
  );
};

export default MessagesBadge;
