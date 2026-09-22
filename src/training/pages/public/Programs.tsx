import { BookOpen } from "lucide-react";
import { EmptyState, QueryView } from "@/training/components/common";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { ProgramCard, PublicHero } from "@/training/features/public/shared";
import { useApi } from "@/training/lib/query";
import type { Program } from "@/training/lib/types";

export default function Programs() {
  const currency = useCenter().data?.currency ?? "RWF";
  const programs = useApi<Program[]>("/public/programs");
  return (
    <>
      <PublicHero eyebrow="What you can learn" title="Programs">
        Practical courses taught by trainers who work in the field. Pick a program to see what you'll learn and when you can start.
      </PublicHero>
      <div className="container py-10">
        <QueryView query={programs}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState icon={BookOpen} title="No programs listed yet" description="Please check back soon." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => (
                  <ProgramCard key={p.id} program={p} currency={currency} />
                ))}
              </div>
            )
          }
        </QueryView>
      </div>
    </>
  );
}
