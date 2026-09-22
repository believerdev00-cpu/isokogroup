import { jsPDF } from "jspdf";
import { config } from "../config.js";
import { queryOne } from "../db.js";
import { notFound } from "../lib/http.js";
import { financeFor } from "./metrics.js";
import { getSetting } from "./settings.js";

const GREEN: [number, number, number] = [15, 81, 50];
const GOLD: [number, number, number] = [196, 138, 30];
const INK: [number, number, number] = [30, 41, 36];

const money = (amount: number, currency: string) =>
  `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const longDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function receiptPdf(paymentId: string): Promise<{ pdf: Buffer; filename: string }> {
  const p = await queryOne(
    `SELECT pay.*, r.receipt_number, r.issued_at, s.full_name, s.student_number, pr.name AS program_name,
            i.name AS intake_name, u.full_name AS recorded_by_name
     FROM payments pay JOIN receipts r ON r.payment_id = pay.id
     JOIN enrollments e ON e.id = pay.enrollment_id JOIN students s ON s.id = e.student_id
     JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN programs pr ON pr.id = ip.program_id
     JOIN intakes i ON i.id = ip.intake_id LEFT JOIN users u ON u.id = pay.recorded_by
     WHERE pay.id = $1`,
    [paymentId],
  );
  if (!p) throw notFound("Receipt not found");
  const center = await getSetting("center");
  const fin = (await financeFor([p.enrollment_id])).get(p.enrollment_id)!;

  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(center.name.toUpperCase(), 30, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${center.address} · ${center.phone} · ${center.email}`, 30, 50);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(p.voided_at ? "PAYMENT RECEIPT — VOID" : "PAYMENT RECEIPT", 30, 100);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Receipt no. ${p.receipt_number}`, W - 30, 100, { align: "right" });

  const rows: [string, string][] = [
    ["Student", `${p.full_name} (${p.student_number})`],
    ["Program", p.program_name],
    ["Intake", p.intake_name],
    ["Payment date", longDate(p.paid_on)],
    ["Method", String(p.method).toUpperCase() + (p.reference ? ` · Ref ${p.reference}` : "")],
    ["Recorded by", p.recorded_by_name ?? "—"],
  ];
  let y = 128;
  for (const [k, v] of rows) {
    doc.setTextColor(110, 120, 115);
    doc.text(k, 30, y);
    doc.setTextColor(...INK);
    doc.text(String(v).slice(0, 60), 120, y);
    y += 18;
  }
  y += 8;
  doc.setDrawColor(220, 225, 222);
  doc.line(30, y, W - 30, y);
  y += 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Amount paid", 30, y);
  doc.text(money(p.amount, center.currency), W - 30, y, { align: "right" });
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Total fees ${money(fin.total_fees, center.currency)} · Paid to date ${money(fin.total_paid, center.currency)} · Balance ${money(Math.max(fin.balance, 0), center.currency)}`, 30, y);
  if (p.voided_at) {
    y += 20;
    doc.setTextColor(180, 40, 40);
    doc.text(`Voided: ${p.void_reason ?? ""}`, 30, y);
  }
  doc.setTextColor(140, 150, 145);
  doc.setFontSize(8);
  doc.text(`Issued ${longDate(p.issued_at)} · Computer-generated receipt`, 30, doc.internal.pageSize.getHeight() - 24);
  return { pdf: Buffer.from(doc.output("arraybuffer")), filename: `${p.receipt_number}.pdf` };
}

export async function certificatePdf(certificateId: string): Promise<{ pdf: Buffer; filename: string }> {
  const c = await queryOne("SELECT * FROM certificates WHERE id = $1", [certificateId]);
  if (!c) throw notFound("Certificate not found");
  const center = await getSetting("center");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(6);
  doc.rect(24, 24, W - 48, H - 48);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.rect(38, 38, W - 76, H - 76);

  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(center.name.toUpperCase(), W / 2, 120, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...GOLD);
  doc.text(center.tagline, W / 2, 144, { align: "center" });

  doc.setTextColor(...INK);
  doc.setFontSize(15);
  doc.text("This certifies that", W / 2, 205, { align: "center" });
  doc.setFont("times", "bolditalic");
  doc.setFontSize(38);
  doc.text(c.student_name, W / 2, 255, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.text("has successfully completed", W / 2, 298, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...GREEN);
  doc.text(c.program_name, W / 2, 338, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(c.intake_name + (c.final_grade ? ` · Grade ${c.final_grade}` : ""), W / 2, 364, { align: "center" });

  doc.setFontSize(10);
  doc.text(`Certificate Number: ${c.certificate_number}`, 70, H - 110);
  doc.text(`Issued on: ${longDate(c.issued_on)}`, 70, H - 94);
  doc.text(`Verification: ${c.verification_code}`, 70, H - 78);
  doc.setTextColor(110, 120, 115);
  doc.text(`Verify at ${config.publicUrl}${config.basePath}/verify`, 70, H - 62);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(W - 290, H - 100, W - 70, H - 100);
  doc.setTextColor(...INK);
  doc.text("Director, " + center.name, W - 180, H - 84, { align: "center" });
  if (c.revoked_at) {
    doc.setTextColor(200, 40, 40);
    doc.setFontSize(48);
    doc.text("REVOKED", W / 2, H / 2 + 20, { align: "center", angle: 20 });
  }
  return { pdf: Buffer.from(doc.output("arraybuffer")), filename: `${c.certificate_number}.pdf` };
}
