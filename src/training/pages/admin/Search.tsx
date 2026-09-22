import { useEffect, useState, type FormEvent } from "react";
import { Search as SearchIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, PageHeader, QueryView, Section, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi, withQuery } from "@/training/lib/query";
import type { ApplicationStatus, IntakeStatus } from "@/training/lib/types";

type Results = {
  students: { id: string; student_number: string; full_name: string; phone: string; email: string }[];
  applications: { id: string; reference: string; full_name: string; status: ApplicationStatus; program_name: string; intake_name: string }[];
  programs: { id: string; code: string; name: string }[];
  intakes: { id: string; name: string; status: IntakeStatus }[];
};

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  useEffect(() => {
    setInput(q);
  }, [q]);
  const results = useApi<Results>(q.trim().length >= 2 ? withQuery("/admin/search", { q }) : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };

  return (
    <div>
      <PageHeader title="Search" subtitle="Find a student, application, program or intake." />
      <form onSubmit={submit} role="search" className="mb-6 flex gap-2">
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Name, student number, phone, email or application number"
          aria-label="Search"
        />
        <Button type="submit"><SearchIcon className="mr-1.5 h-4 w-4" />Search</Button>
      </form>

      {q.trim().length < 2 ? (
        <EmptyState icon={SearchIcon} title="Type at least two characters" description="For example a surname, ISK-2027-00125 or ISOKO-APP-2027-00125." />
      ) : (
        <QueryView query={results}>
          {(r) => {
            const total = r.students.length + r.applications.length + r.programs.length + r.intakes.length;
            if (total === 0) return <EmptyState icon={SearchIcon} title={`Nothing found for “${q}”`} description="Check the spelling, or search by phone number or application number." />;
            return (
              <div className="grid gap-4 lg:grid-cols-2">
                {r.students.length > 0 && (
                  <Section title={`Students (${r.students.length})`}>
                    <ul className="divide-y">
                      {r.students.map((s) => (
                        <li key={s.id}>
                          <Link to={`/training-center/admin/students/${s.id}`} className="block py-2.5 hover:text-primary">
                            <p className="font-medium">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground">{s.student_number} · {s.phone} · {s.email}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                {r.applications.length > 0 && (
                  <Section title={`Applications (${r.applications.length})`}>
                    <ul className="divide-y">
                      {r.applications.map((a) => (
                        <li key={a.id}>
                          <Link to={`/training-center/admin/applications/${a.id}`} className="flex items-start justify-between gap-3 py-2.5 hover:text-primary">
                            <span className="min-w-0">
                              <span className="block font-medium">{a.full_name}</span>
                              <span className="block text-xs text-muted-foreground">{a.reference} · {a.program_name} · {a.intake_name}</span>
                            </span>
                            <StatusBadge status={a.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                {r.programs.length > 0 && (
                  <Section title="Programs">
                    <ul className="divide-y">
                      {r.programs.map((p) => (
                        <li key={p.id}>
                          <Link to={`/training-center/admin/programs/${p.id}`} className="block py-2.5 font-medium hover:text-primary">{p.name} <span className="text-xs text-muted-foreground">({p.code})</span></Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                {r.intakes.length > 0 && (
                  <Section title="Intakes">
                    <ul className="divide-y">
                      {r.intakes.map((i) => (
                        <li key={i.id}>
                          <Link to={`/training-center/admin/intakes/${i.id}`} className="flex items-center justify-between py-2.5 font-medium hover:text-primary">
                            {i.name} <StatusBadge status={i.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            );
          }}
        </QueryView>
      )}
    </div>
  );
}
