import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { PLACEMENTS, STATUS_LABEL, statusTone, useMyAdvertRequests } from "./api";

/**
 * "Your advertising requests", on the customer dashboard.
 *
 * Submitting gave the advertiser a reference and nothing else: the row policy
 * letting them read their own request was written with the table and then
 * never used by any screen, so the only way to learn what had become of an
 * enquiry was to ask the office. This is that policy's screen.
 *
 * It shows what the office is actually doing with the request -- contacted,
 * quoted, accepted -- because a status nobody can see is the same as no status
 * at all. Staff notes are deliberately not here: they are written for the
 * office, not for the advertiser.
 */

const placementLabel = (key: string) => PLACEMENTS.find((p) => p.key === key)?.label ?? key;

export default function MyAdvertRequests() {
  const { user } = useAuth();
  const mine = useMyAdvertRequests(user?.id);

  // Nothing is said to someone who has never asked: an empty card on every
  // dashboard would be advertising the form, not reporting on a request.
  if (!user || mine.isLoading || mine.isError || (mine.data ?? []).length === 0) return null;

  const requests = mine.data ?? [];

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5" /> Your Advertising Requests
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {requests.length === 1 ? "1 request" : `${requests.length} requests`}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.what_to_advertise}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{r.reference}</span> · {placementLabel(r.placement)} · {r.duration}
              </p>
            </div>
            <Badge className={statusTone(r.status)} variant="outline">
              {STATUS_LABEL[r.status] ?? r.status}
            </Badge>
          </div>
        ))}
        {requests.length > 5 && (
          <p className="text-xs text-muted-foreground">
            Showing the 5 most recent. Quote your reference when you write to us about an older one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
