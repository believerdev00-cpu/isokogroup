import { pool, query, type Queryable } from "../db.js";
import { getSetting, gradeFor, today } from "./settings.js";

export type AttendanceSummary = {
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** (present + late) / (sessions - excused), in percent; null before any session. */
  rate: number | null;
};

export type ResultSummary = {
  assessments_total: number;
  assessments_completed: number;
  /** Weighted percentage over the assessments marked so far. */
  percentage: number | null;
  /** Weighted percentage over all assessments, unmarked ones counting as 0. */
  final_percentage: number | null;
  grade: string | null;
  /** Known only once every assessment is marked. */
  passed: boolean | null;
};

export type FinanceSummary = {
  total_fees: number;
  total_paid: number;
  balance: number;
  payment_status: "paid" | "partially_paid" | "outstanding";
};

export type EnrollmentSummary = {
  attendance: AttendanceSummary;
  results: ResultSummary;
  finance: FinanceSummary;
  /** Share of the training period elapsed (100 once completed). */
  progress: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function attendanceFor(ids: string[], client: Queryable = pool) {
  const rows = await query(
    `SELECT e.id,
            count(a.id)::int AS sessions,
            count(a.id) FILTER (WHERE a.status = 'present')::int AS present,
            count(a.id) FILTER (WHERE a.status = 'late')::int AS late,
            count(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
            count(a.id) FILTER (WHERE a.status = 'excused')::int AS excused
     FROM unnest($1::uuid[]) AS e(id)
     LEFT JOIN attendance a ON a.enrollment_id = e.id
     GROUP BY e.id`,
    [ids],
    client,
  );
  const out = new Map<string, AttendanceSummary>();
  for (const r of rows) {
    const counted = r.sessions - r.excused;
    out.set(r.id, {
      sessions: r.sessions,
      present: r.present,
      late: r.late,
      absent: r.absent,
      excused: r.excused,
      rate: counted > 0 ? round1(((r.present + r.late) / counted) * 100) : null,
    });
  }
  return out;
}

export async function resultsFor(ids: string[], client: Queryable = pool) {
  const grading = await getSetting("grading", client);
  // Assessments of the class each enrollment is in, with the mark if recorded
  const rows = await query(
    `SELECT cs.enrollment_id, a.id AS assessment_id, a.max_marks, a.weight, r.marks
     FROM class_students cs
     JOIN assessments a ON a.class_id = cs.class_id
     LEFT JOIN assessment_results r ON r.assessment_id = a.id AND r.enrollment_id = cs.enrollment_id
     WHERE cs.enrollment_id = ANY($1::uuid[])`,
    [ids],
    client,
  );
  const acc = new Map<string, { total: number; done: number; weightAll: number; weightDone: number; score: number }>();
  for (const id of ids) acc.set(id, { total: 0, done: 0, weightAll: 0, weightDone: 0, score: 0 });
  for (const r of rows) {
    const a = acc.get(r.enrollment_id)!;
    a.total++;
    a.weightAll += r.weight;
    if (r.marks !== null) {
      a.done++;
      a.weightDone += r.weight;
      a.score += (Math.min(r.marks, r.max_marks) / r.max_marks) * r.weight;
    }
  }
  const out = new Map<string, ResultSummary>();
  for (const [id, a] of acc) {
    const percentage = a.weightDone > 0 ? round1((a.score / a.weightDone) * 100) : null;
    const finalPct = a.weightAll > 0 ? round1((a.score / a.weightAll) * 100) : null;
    const complete = a.total > 0 && a.done === a.total;
    out.set(id, {
      assessments_total: a.total,
      assessments_completed: a.done,
      percentage,
      final_percentage: finalPct,
      grade: percentage === null ? null : gradeFor(complete ? finalPct! : percentage, grading),
      passed: complete ? finalPct! >= grading.pass_mark : null,
    });
  }
  return out;
}

export async function financeFor(ids: string[], client: Queryable = pool) {
  const rows = await query(
    "SELECT enrollment_id, total_fees, total_paid FROM enrollment_balances WHERE enrollment_id = ANY($1::uuid[])",
    [ids],
    client,
  );
  const out = new Map<string, FinanceSummary>();
  for (const r of rows) out.set(r.enrollment_id, financeSummary(r.total_fees, r.total_paid));
  return out;
}

export function financeSummary(totalFees: number, totalPaid: number): FinanceSummary {
  const balance = Math.round((totalFees - totalPaid) * 100) / 100;
  return {
    total_fees: totalFees,
    total_paid: totalPaid,
    balance,
    payment_status: balance <= 0 ? "paid" : totalPaid > 0 ? "partially_paid" : "outstanding",
  };
}

export async function progressFor(ids: string[], client: Queryable = pool) {
  const d = await today(client);
  const rows = await query(
    `SELECT e.id, e.status, i.training_starts_on, i.training_ends_on
     FROM enrollments e JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN intakes i ON i.id = ip.intake_id
     WHERE e.id = ANY($1::uuid[])`,
    [ids],
    client,
  );
  const now = new Date(d).getTime();
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "completed") {
      out.set(r.id, 100);
      continue;
    }
    const start = new Date(r.training_starts_on).getTime();
    const end = new Date(r.training_ends_on).getTime();
    const pct = end > start ? ((now - start) / (end - start)) * 100 : now >= end ? 100 : 0;
    out.set(r.id, Math.round(Math.min(100, Math.max(0, pct))));
  }
  return out;
}

/** Attendance, results, fees and progress for many enrollments at once. */
export async function summariesFor(ids: string[], client: Queryable = pool) {
  if (ids.length === 0) return new Map<string, EnrollmentSummary>();
  const [att, res, fin, prog] = await Promise.all([
    attendanceFor(ids, client),
    resultsFor(ids, client),
    financeFor(ids, client),
    progressFor(ids, client),
  ]);
  const out = new Map<string, EnrollmentSummary>();
  for (const id of ids) {
    out.set(id, {
      attendance: att.get(id)!,
      results: res.get(id)!,
      finance: fin.get(id) ?? financeSummary(0, 0),
      progress: prog.get(id) ?? 0,
    });
  }
  return out;
}

export async function summaryFor(id: string, client: Queryable = pool) {
  return (await summariesFor([id], client)).get(id)!;
}
