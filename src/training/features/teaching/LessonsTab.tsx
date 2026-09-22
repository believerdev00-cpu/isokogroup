import { useState, type FormEvent } from "react";
import { NotebookPen, Pencil } from "lucide-react";
import { EmptyState, Field, Section } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatDate } from "@/training/lib/format";
import { useApiMutation } from "@/training/lib/query";
import { localToday, type ClassDetail } from "./types";

export default function LessonsTab({ klass }: { klass: ClassDetail }) {
  const [date, setDate] = useState(localToday());
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");

  const save = useApiMutation(() => api.put(`/classes/${klass.id}/lessons/${date}`, { topic, notes }), {
    invalidate: [`/classes/${klass.id}`, "/trainer/dashboard"],
    success: "Lesson saved",
    onSuccess: () => {
      setTopic("");
      setNotes("");
    },
  });

  const edit = (s: ClassDetail["sessions"][number]) => {
    setDate(s.session_date);
    setTopic(s.topic);
    setNotes(s.notes);
    document.getElementById("lesson-topic")?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <Section title="Plan or note a lesson" description="Add the topic ahead of time, or notes after class.">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Date" htmlFor="lesson-date">
            <Input id="lesson-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Topic" htmlFor="lesson-topic" required>
            <Input id="lesson-topic" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Arrays and loops" required />
          </Field>
          <Field label="Notes" htmlFor="lesson-notes-plan">
            <Textarea id="lesson-notes-plan" value={notes} rows={4} maxLength={4000} onChange={(e) => setNotes(e.target.value)} placeholder="Objectives, materials, homework" />
          </Field>
          <Button type="submit" className="w-full" disabled={!topic.trim() || !date || save.isPending}>
            Save lesson
          </Button>
        </form>
      </Section>
      <Section title="Lessons">
        {klass.sessions.length === 0 ? (
          <EmptyState icon={NotebookPen} title="No lessons recorded yet" description="Lessons appear here when you plan a topic or take attendance." />
        ) : (
          <ul className="divide-y">
            {klass.sessions.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatDate(s.session_date)}</p>
                  <p className="font-medium">{s.topic || <span className="italic text-muted-foreground">No topic</span>}</p>
                  {s.notes && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{s.notes}</p>}
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit lesson of ${formatDate(s.session_date)}`} onClick={() => edit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
