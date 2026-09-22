import { useState, type FormEvent } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { useParams } from "react-router-dom";
import { Field, PageHeader, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ClassWorkspace from "@/training/features/teaching/ClassWorkspace";
import type { ClassDetail } from "@/training/features/teaching/types";
import { api } from "@/training/lib/api";
import { formatDays, formatPeriod, formatTime, plural } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";

export default function TrainerClassPage() {
  const { id = "" } = useParams();
  const q = useApi<ClassDetail>(`/classes/${id}`);
  const [announcing, setAnnouncing] = useState(false);

  return (
    <QueryView query={q}>
      {(c) => (
        <div>
          <PageHeader
            back={{ to: "/training-center/trainer/classes", label: "My Classes" }}
            title={c.program_name}
            subtitle={
              <>
                <strong className="text-foreground">{c.code}</strong> · {c.intake_name} · {formatDays(c.meeting_days)} {formatTime(c.start_time)}–{formatTime(c.end_time)}
                {c.room && ` · ${c.room}`} · {plural(c.students.length, "student")} · Training {formatPeriod(c.training_starts_on, c.training_ends_on)}
              </>
            }
            actions={
              <Button variant="outline" onClick={() => setAnnouncing(true)}>
                <Megaphone className="mr-2 h-4 w-4" /> Post announcement
              </Button>
            }
          />
          <ClassWorkspace classId={c.id} initialTab="attendance" />
          {announcing && <AnnouncementDialog classId={c.id} code={c.code} onClose={() => setAnnouncing(false)} />}
        </div>
      )}
    </QueryView>
  );
}

function AnnouncementDialog({ classId, code, onClose }: { classId: string; code: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const post = useApiMutation(() => api.post(`/classes/${classId}/announcements`, { title, body }), {
    invalidate: ["/trainer/announcements"],
    success: "Announcement sent to the class",
    onSuccess: onClose,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    post.mutate();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Announcement to {code}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="ann-title" required>
            <Input id="ann-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. No class on Friday" required />
          </Field>
          <Field label="Message" htmlFor="ann-body" required>
            <Textarea id="ann-body" value={body} rows={5} maxLength={4000} onChange={(e) => setBody(e.target.value)} required />
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={title.trim().length < 2 || body.trim().length < 2 || post.isPending}>
              {post.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send to students
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
