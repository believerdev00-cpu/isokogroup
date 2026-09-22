// Demo data for local development and staff training. Refuses to run in production
// or on a database that already has programs.
//
// Dates are relative to today, so the demo always has: an intake in training (with
// classes meeting today), one open for applications, a closed one, and a draft.
import { config } from "../config.js";
import { pool, query, queryOne, withTransaction } from "../db.js";
import { createUserAccount, updateAuthUser } from "../services/auth.js";
import { approveApplication } from "../services/enrollment.js";
import { refreshIntakeStatuses } from "../services/intakes.js";
import { nextNumber } from "../services/numbers.js";
import { today } from "../services/settings.js";

const PASSWORD = "Password123!";

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const monthName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const PROGRAMS = [
  { code: "WD", name: "Full-Stack Web Development", category: "Technology", months: 6, tuition: 400000, reg: 20000,
    description: "Learn HTML, CSS, JavaScript, React, backend development, databases, APIs and deployment.",
    content: "HTML & CSS\nJavaScript fundamentals\nReact\nNode.js & Express\nPostgreSQL\nAPIs and deployment",
    requirements: "Secondary school certificate. Basic computer skills." },
  { code: "GD", name: "Graphic Design", category: "Creative", months: 4, tuition: 250000, reg: 15000,
    description: "Design for print and screen with Adobe tools, typography, branding and layout.",
    content: "Design principles\nTypography\nAdobe Photoshop & Illustrator\nBranding\nPortfolio project",
    requirements: "Secondary school certificate." },
  { code: "DM", name: "Digital Marketing", category: "Business", months: 3, tuition: 180000, reg: 10000,
    description: "Plan and run campaigns on social media, search and email, and measure the results.",
    content: "Marketing strategy\nSocial media\nSEO & search ads\nEmail marketing\nAnalytics",
    requirements: "Secondary school certificate." },
  { code: "CA", name: "Computer Applications", category: "Technology", months: 2, tuition: 80000, reg: 5000,
    description: "Confident everyday computing: Windows, Word, Excel, PowerPoint, email and the internet.",
    content: "Windows basics\nMicrosoft Word\nMicrosoft Excel\nPowerPoint\nEmail and internet",
    requirements: "None." },
];

const PEOPLE = [
  "Aline Uwase", "Jean Bosco Habimana", "Grace Mukamana", "Eric Niyonzima", "Diane Ingabire", "Patrick Mugisha",
  "Claudine Umutoni", "Samuel Nkurunziza", "Josiane Iradukunda", "Emmanuel Hakizimana", "Chantal Uwimana", "David Ndayisaba",
];

async function main() {
  if (config.isProduction) throw new Error("Refusing to load demo data in production");
  if (await queryOne("SELECT 1 FROM programs LIMIT 1")) throw new Error("The database already has programs; demo data is only for an empty database");
  const d = await today();

  await createUserAccount({ email: "admin@isoko.test", password: PASSWORD, role: "admin", full_name: "Isoko Admin" });
  const admin = (await queryOne<{ id: string }>("SELECT id FROM users WHERE email = 'admin@isoko.test'"))!;

  const trainers: string[] = [];
  for (const [i, t] of [["Innocent Kamali", "Web development"], ["Sandrine Mutesi", "Design & marketing"]].entries()) {
    const email = `trainer${i + 1}@isoko.test`;
    const user = await createUserAccount({ email, password: PASSWORD, role: "trainer", full_name: t[0], phone: `+250 788 10${i}0 00${i}` });
    trainers.push((await queryOne<{ id: string }>("INSERT INTO trainers (user_id, specialization) VALUES ($1, $2) RETURNING id", [user.id, t[1]]))!.id);
  }

  const programIds: Record<string, string> = {};
  for (const p of PROGRAMS) {
    programIds[p.code] = (await queryOne<{ id: string }>(
      `INSERT INTO programs (code, name, slug, category, description, duration_value, duration_unit, tuition_fee, registration_fee,
         course_content, requirements, max_students)
       VALUES ($1, $2, $3, $4, $5, $6, 'months', $7, $8, $9, $10, 30) RETURNING id`,
      [p.code, p.name, p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), p.category, p.description, p.months, p.tuition, p.reg, p.content, p.requirements],
    ))!.id;
  }

  // Intakes around today: in training, open, closed, draft
  const running = { opens: addDays(d, -120), closes: addDays(d, -80), starts: addDays(d, -70), ends: addDays(d, 110) };
  const open = { opens: addDays(d, -21), closes: addDays(d, 89), starts: addDays(d, 105), ends: addDays(d, 285) };
  const closed = { opens: addDays(d, -70), closes: addDays(d, -7), starts: addDays(d, 13), ends: addDays(d, 100) };
  const draft = { opens: addDays(d, 120), closes: addDays(d, 180), starts: addDays(d, 195), ends: addDays(d, 375) };
  const intakes: Record<string, string> = {};
  for (const [key, dates, status] of [["running", running, "closed"], ["open", open, "upcoming"], ["closed", closed, "closed"], ["draft", draft, "draft"]] as const) {
    const name = `${monthName(dates.starts)} Intake`;
    intakes[key] = (await queryOne<{ id: string }>(
      `INSERT INTO intakes (name, slug, description, application_opens_on, application_closes_on, training_starts_on, training_ends_on,
         location, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Isoko Training Center, Kigali', $8, CASE WHEN $8 <> 'draft' THEN now() END) RETURNING id`,
      [name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${key}`, `Programs starting ${monthName(dates.starts)}.`,
        dates.opens, dates.closes, dates.starts, dates.ends, status],
    ))!.id;
  }
  const offer = async (intake: string, code: string, capacity: number, schedule: string) =>
    (await queryOne<{ id: string }>(
      "INSERT INTO intake_programs (intake_id, program_id, capacity, schedule) VALUES ($1, $2, $3, $4) RETURNING id",
      [intakes[intake], programIds[code], capacity, schedule],
    ))!.id;

  const runWD = await offer("running", "WD", 30, "Mon–Fri, 8:00–10:00");
  const runGD = await offer("running", "GD", 20, "Mon, Wed, Fri, 14:00–16:00");
  const openWD = await offer("open", "WD", 30, "Mon–Fri, 8:00–10:00");
  await offer("open", "GD", 20, "Mon, Wed, Fri, 14:00–16:00");
  const openDM = await offer("open", "DM", 3, "Tue & Thu, 10:00–12:00");
  await offer("closed", "CA", 25, "Mon–Fri, 16:00–18:00");
  await offer("draft", "WD", 30, "Mon–Fri, 8:00–10:00");

  // Classes for the running intake, meeting today
  const classWD = (await queryOne<{ id: string }>(
    `INSERT INTO classes (code, intake_program_id, trainer_id, room, meeting_days, start_time, end_time)
     VALUES ('WD-' || to_char($2::date, 'MON-YYYY') || '-A', $1, $3, 'Computer Lab 1', '{1,2,3,4,5}', '08:00', '10:00') RETURNING id`,
    [runWD, running.starts, trainers[0]],
  ))!.id;
  const classGD = (await queryOne<{ id: string }>(
    `INSERT INTO classes (code, intake_program_id, trainer_id, room, meeting_days, start_time, end_time)
     VALUES ('GD-' || to_char($2::date, 'MON-YYYY') || '-A', $1, $3, 'Design Studio', '{1,2,3,4,5}', '14:00', '16:00') RETURNING id`,
    [runGD, running.starts, trainers[1]],
  ))!.id;

  const apply = async (ip: string, name: string, i: number, startYear: number) =>
    (await withTransaction(async (c) =>
      queryOne<{ id: string }>(
        `INSERT INTO applications (reference, intake_program_id, full_name, date_of_birth, gender, phone, email, address,
           emergency_contact_name, emergency_contact_phone, previous_education, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Kigali', 'Parent', '+250 788 999 000', 'Secondary school (A-level)', now() - ($8 || ' days')::interval)
         RETURNING id`,
        [await nextNumber("application", startYear, c), ip, name, `${2000 + (i % 6)}-0${1 + (i % 9)}-15`, i % 2 ? "male" : "female",
          `+250 78${i} 123 45${i % 10}`, `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, 10 + i],
        c,
      ),
    ))!.id;

  // Running intake: 8 web students and 4 design students, approved through the real flow
  const runYear = Number(running.starts.slice(0, 4));
  const enrolled: { enrollment: string; klass: string }[] = [];
  for (const [i, name] of PEOPLE.entries()) {
    const ip = i < 8 ? runWD : runGD;
    const app = await apply(ip, name, i, runYear);
    const r = await approveApplication(app, admin.id);
    enrolled.push({ enrollment: r.enrollment_id, klass: i < 8 ? classWD : classGD });
  }
  // The first student can sign in as student@isoko.test with the demo password
  const firstStudent = (await queryOne<{ user_id: string }>(
    "SELECT s.user_id FROM students s JOIN enrollments e ON e.student_id = s.id WHERE e.id = $1",
    [enrolled[0].enrollment],
  ))!;
  await updateAuthUser(firstStudent.user_id, { email: "student@isoko.test", password: PASSWORD });
  await query("UPDATE users SET email = 'student@isoko.test', must_change_password = false WHERE id = $1", [firstStudent.user_id]);
  await query("UPDATE students SET email = 'student@isoko.test' WHERE id = (SELECT student_id FROM enrollments WHERE id = $1)", [enrolled[0].enrollment]);

  // Six weeks of lessons and attendance on weekdays, up to yesterday
  const topics = ["HTML structure", "CSS layout", "Flexbox", "JavaScript variables", "Functions", "Arrays", "DOM events", "Fetch & APIs", "React components", "State", "Forms", "Routing"];
  let day = addDays(d, -42);
  let t = 0;
  while (day < d) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) {
      for (const klass of [classWD, classGD]) {
        const s = (await queryOne<{ id: string }>(
          "INSERT INTO class_sessions (class_id, session_date, topic, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
          [klass, day, topics[t % topics.length], admin.id],
        ))!.id;
        for (const [i, e] of enrolled.filter((x) => x.klass === klass).entries()) {
          const roll = (i * 7 + t * 3) % 20;
          const status = roll === 0 ? "absent" : roll === 1 ? "late" : roll === 2 && i > 3 ? "excused" : "present";
          await query("INSERT INTO attendance (session_id, enrollment_id, status, recorded_by) VALUES ($1, $2, $3, $4)", [s, e.enrollment, status, admin.id]);
        }
      }
      t++;
    }
    day = addDays(day, 1);
  }
  await query("INSERT INTO class_sessions (class_id, session_date, topic, created_by) VALUES ($1, $2, 'JavaScript Functions', $3)", [classWD, d, admin.id]);

  // Assessments with marks
  for (const [klass, items] of [
    [classWD, [["assignment", "HTML & CSS portfolio page", 20, 20], ["test", "JavaScript basics test", 50, 30], ["project", "Final web app project", 100, 50]]],
    [classGD, [["assignment", "Logo concepts", 20, 30], ["project", "Brand identity project", 100, 70]]],
  ] as const) {
    for (const [idx, [type, title, max, weight]] of items.entries()) {
      const a = (await queryOne<{ id: string }>(
        "INSERT INTO assessments (class_id, type, title, max_marks, weight, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [klass, type, title, max, weight, addDays(d, -28 + idx * 14), admin.id],
      ))!.id;
      if (idx < items.length - 1) {
        for (const [i, e] of enrolled.filter((x) => x.klass === klass).entries()) {
          await query("INSERT INTO assessment_results (assessment_id, enrollment_id, marks, recorded_by) VALUES ($1, $2, $3, $4)", [a, e.enrollment, Math.round(max * (0.55 + ((i * 13) % 40) / 100)), admin.id]);
        }
      }
    }
  }

  // Payments: some fully paid, most partly, a few nothing yet
  for (const [i, e] of enrolled.entries()) {
    const fees = (await queryOne<{ total: number }>("SELECT total_fees AS total FROM enrollment_balances WHERE enrollment_id = $1", [e.enrollment]))!.total;
    const share = i % 4 === 0 ? 1 : i % 4 === 3 ? 0 : 0.6;
    if (share === 0) continue;
    await withTransaction(async (c) => {
      const p = await queryOne<{ id: string }>(
        "INSERT INTO payments (enrollment_id, amount, method, reference, paid_on, recorded_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [e.enrollment, Math.round(fees * share), i % 2 ? "momo" : "bank", `TX${100200 + i}`, addDays(d, -30 + i), admin.id],
        c,
      );
      await c.query("INSERT INTO receipts (payment_id, receipt_number) VALUES ($1, $2)", [p!.id, await nextNumber("receipt", Number(d.slice(0, 4)), c)]);
    });
  }

  // Open intake: pending applications, and one program that becomes full
  const openYear = Number(open.starts.slice(0, 4));
  for (const [i, name] of ["Olivier Rukundo", "Nadine Umuhoza", "Fabrice Gatete", "Solange Nyiraneza"].entries()) {
    await apply(openWD, name, i + 20, openYear);
  }
  for (const [i, name] of ["Yvonne Kayitesi", "Kevin Munyaneza", "Esther Mukeshimana"].entries()) {
    await approveApplication(await apply(openDM, name, i + 30, openYear), admin.id);
  }
  await query("INSERT INTO announcements (title, body, audience, created_by) VALUES ($1, $2, 'students', $3)", [
    "Welcome to the new term",
    "Classes run Monday to Friday. Please arrive 10 minutes early and bring your student card.",
    admin.id,
  ]);

  // Demo emails aren't real addresses; don't try to send them
  await query("UPDATE notifications SET email_status = 'not_configured' WHERE email_status = 'pending'");
  await refreshIntakeStatuses();

  console.log(`Demo data loaded. Password for every demo account: ${PASSWORD}
  admin     admin@isoko.test
  trainer   trainer1@isoko.test  (Web Development class meets today)
  trainer   trainer2@isoko.test
  student   student@isoko.test`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
