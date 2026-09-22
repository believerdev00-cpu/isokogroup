import { createContext, useContext, useState, type ReactNode } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/training/lib/api";
import { useApiMutation } from "@/training/lib/query";
import type { ApplicationStatus, ApprovalResult } from "@/training/lib/types";

/** Every list that changes when an application is decided. */
export const APPLICATION_CACHES = ["/admin/applications", "/admin/dashboard", "/admin/intakes", "/admin/students", "/admin/search"];

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Couldn't copy; select the text instead");
        }
      }}
    >
      {done ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** Login details shown exactly once after an account is created or reset. */
export function TempPassword({ email, password }: { email: string; password: string }) {
  return (
    <div className="rounded-lg border border-gold/40 bg-gold-soft p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
        <KeyRound className="h-4 w-4" /> Portal login
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Email:</dt>
          <dd className="font-medium break-all">{email}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">Temporary password:</dt>
          <dd className="rounded bg-card px-2 py-0.5 font-mono text-base font-bold">{password}</dd>
          <CopyButton text={password} />
        </div>
      </dl>
      <p className="mt-3 text-xs text-accent-foreground">
        Share this with the student now. It won't be shown again; they'll choose their own password when they first sign in.
      </p>
    </div>
  );
}

export function ApprovalResultDialog({ result, onClose, title = "Application approved" }: { result: ApprovalResult | null; onClose: () => void; title?: string }) {
  const navigate = useNavigate();
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The student record, enrollment and fees have been created.</DialogDescription>
        </DialogHeader>
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Student number</p>
                <p className="font-mono font-bold">{result.student_number}</p>
              </div>
              <div className="rounded-lg border bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Class</p>
                {result.class_code ? (
                  <p className="font-mono font-bold">{result.class_code}</p>
                ) : (
                  <p className="text-sm">
                    Not in a class yet — <Link to="/training-center/admin/classes/new" className="font-semibold text-primary hover:underline">create one</Link>
                  </p>
                )}
              </div>
            </div>
            {result.login?.temporary_password ? (
              <TempPassword email={result.login.email} password={result.login.temporary_password} />
            ) : (
              <p className="text-sm text-muted-foreground">This student signs in to the student portal with their existing Isoko account{result.login ? ` (${result.login.email})` : ""}.</p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {result && (
            <Button
              onClick={() => {
                const id = result.student_id;
                onClose();
                navigate(`/training-center/admin/students/${id}`);
              }}
            >
              Open student profile
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AppLike = { id: string; full_name: string; status: ApplicationStatus; program_name: string; available_seats: number };

// The approval result (with the one-time temporary password) must outlive the
// application card: once approved, the card leaves the "To review" list and unmounts.
const ApprovalResultContext = createContext<((r: ApprovalResult) => void) | null>(null);

/** Wrap a page that shows ApplicationActions; it owns the approval result dialog. */
export function ApprovalResultHost({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<ApprovalResult | null>(null);
  return (
    <ApprovalResultContext.Provider value={setResult}>
      {children}
      <ApprovalResultDialog result={result} onClose={() => setResult(null)} />
    </ApprovalResultContext.Provider>
  );
}

/** Approve / Reject / Waitlist (and optionally Under review) with the right confirmations. */
export function ApplicationActions({ app, showReview = false, size = "sm" }: { app: AppLike; showReview?: boolean; size?: "sm" | "default" }) {
  const [dialog, setDialog] = useState<null | "approve" | "reject" | "waitlist">(null);
  const [localResult, setLocalResult] = useState<ApprovalResult | null>(null);
  const showResult = useContext(ApprovalResultContext) ?? setLocalResult;
  const opts = { invalidate: [...APPLICATION_CACHES, `/admin/applications/${app.id}`] };
  const approve = useApiMutation((note: string) => api.post<ApprovalResult>(`/admin/applications/${app.id}/approve`, { note: note || null }), {
    ...opts,
    onSuccess: (r) => {
      setDialog(null);
      showResult(r);
    },
  });
  const decide = useApiMutation(
    ({ action, note }: { action: "reject" | "waitlist" | "review" | "reset"; note?: string }) =>
      api.post(`/admin/applications/${app.id}/${action}`, { note: note || null }),
    { ...opts, success: "Application updated", onSuccess: () => setDialog(null) },
  );

  const decidable = !["approved", "withdrawn"].includes(app.status);
  const full = app.available_seats <= 0;

  return (
    <>
      {decidable && (
        <div className="flex flex-wrap gap-2">
          <Button size={size} onClick={() => setDialog("approve")} disabled={full} title={full ? "No seats left in this program" : undefined}>
            Approve
          </Button>
          {app.status !== "waitlisted" && (
            <Button size={size} variant="outline" onClick={() => setDialog("waitlist")}>Waitlist</Button>
          )}
          {app.status !== "rejected" && (
            <Button size={size} variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDialog("reject")}>
              Reject
            </Button>
          )}
          {showReview && app.status === "pending" && (
            <Button size={size} variant="ghost" onClick={() => decide.mutate({ action: "review" })} disabled={decide.isPending}>
              Mark under review
            </Button>
          )}
          {showReview && ["rejected", "waitlisted", "under_review"].includes(app.status) && (
            <Button size={size} variant="ghost" onClick={() => decide.mutate({ action: "reset" })} disabled={decide.isPending}>
              Back to pending
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Approve ${app.full_name}?`}
        description={`This enrolls them in ${app.program_name}, creates their student number and fees, places them in a class if one exists, and takes one of the ${app.available_seats} remaining seats.`}
        confirmLabel="Approve and enroll"
        noteLabel="Note (optional)"
        pending={approve.isPending}
        onConfirm={(note) => approve.mutate(note)}
      />
      <ConfirmDialog
        open={dialog === "waitlist"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Waitlist ${app.full_name}?`}
        description="They'll be told the program is full and that you'll contact them if a seat opens. You can approve them later."
        confirmLabel="Add to waitlist"
        noteLabel="Note (optional)"
        pending={decide.isPending}
        onConfirm={(note) => decide.mutate({ action: "waitlist", note })}
      />
      <ConfirmDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reject ${app.full_name}'s application?`}
        description="The applicant will be told they weren't offered a place. The note, if any, is included in their message."
        confirmLabel="Reject application"
        destructive
        noteLabel="Reason (optional, shared with the applicant)"
        pending={decide.isPending}
        onConfirm={(note) => decide.mutate({ action: "reject", note })}
      />
      <ApprovalResultDialog result={localResult} onClose={() => setLocalResult(null)} />
    </>
  );
}

/** Label for an application window relative to today: Upcoming / Open / Closed. */
export function applicationWindow(opens: string, closes: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < opens) return "upcoming";
  if (today > closes) return "closed";
  return "open";
}
