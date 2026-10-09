import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock, HeartHandshake, Loader2, Lock, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import PayToCompany from "@/components/PayToCompany";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/features/services/api";
import {
  DONATION_STATUS_LABEL, MIN_DONATION_RWF, PAYMENT_METHODS, SUGGESTED_DONATIONS_RWF,
  donationAmountProblem, donationProblem, rwf, type PaymentMethod,
} from "@/lib/initiative";
import {
  INITIATIVE, submitDonation, useMyDonations, useSupportableProjects,
} from "./api";

// Giving and asking are the same conversation, so they are the same dialog: the
// first tab records a contribution, the second is for somebody whose own
// project needs support. Nothing here takes a payment. The donor pays ISOKO
// GROUP with the Mobile Money code or bank account the site already publishes,
// then tells us the transaction reference, and an admin matches it against the
// statement before it counts. That is why the second step asks for a reference
// rather than card details: there is no card to take.

const GENERAL = "general";

/** Where a contribution goes, and how much of it. */
function ChooseStep({
  amount, setAmount, project, setProject, anonymous, setAnonymous, name, setName, onNext,
}: {
  amount: string; setAmount: (v: string) => void;
  project: string; setProject: (v: string) => void;
  anonymous: boolean; setAnonymous: (v: boolean) => void;
  name: string; setName: (v: string) => void;
  onNext: () => void;
}) {
  const open = useSupportableProjects();
  const amountProblem = amount === "" ? null : donationAmountProblem(Number(amount));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>How much would you like to give?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SUGGESTED_DONATIONS_RWF.map((v) => (
            <Button
              key={v}
              type="button"
              variant={Number(amount) === v ? "default" : "outline"}
              onClick={() => setAmount(String(v))}
              className="h-11"
            >
              {v.toLocaleString()}
            </Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="donate-amount" className="text-xs font-normal text-muted-foreground">
            Or another amount, in whole Rwandan francs
          </Label>
          <Input
            id="donate-amount"
            type="number"
            inputMode="numeric"
            min={MIN_DONATION_RWF}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(MIN_DONATION_RWF)}
          />
          {amountProblem && <p className="text-xs text-destructive">{amountProblem}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Where should it go?</Label>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={GENERAL}>Wherever it is needed most</SelectItem>
            {(open.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {open.isLoading
            ? "Loading the projects currently seeking support…"
            : open.isError
              ? "We could not load the list of projects just now; a general contribution still works."
              : (open.data ?? []).length === 0
                ? "No project is seeking support at the moment, so contributions are pooled until one is."
                : "A general contribution is pooled and given to a project by our team, with a record of where it went."}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="donate-anon"
            checked={anonymous}
            onCheckedChange={(v) => setAnonymous(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="donate-anon" className="font-normal">Give without being named publicly</Label>
            <p className="text-xs text-muted-foreground">
              Your name will not appear publicly. Our team still sees it, so your payment can be matched.
            </p>
          </div>
        </div>
        {!anonymous && (
          <div className="space-y-1.5">
            <Label htmlFor="donate-name" className="text-xs font-normal text-muted-foreground">
              The name to thank, if you would like one shown (optional)
            </Label>
            <Input
              id="donate-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Your name or your organisation"
            />
          </div>
        )}
      </div>

      <Button type="button" size="lg" className="w-full gap-2" disabled={!!amountProblem || amount === ""} onClick={onNext}>
        Continue <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Pay the company, then tell us the reference so an admin can find it. */
function PayStep({
  amount, method, setMethod, reference, setReference, saving, onBack, onSubmit,
}: {
  amount: number;
  method: PaymentMethod; setMethod: (m: PaymentMethod) => void;
  reference: string; setReference: (v: string) => void;
  saving: boolean; onBack: () => void; onSubmit: () => void;
}) {
  const problem = reference === "" ? null : donationProblem(amount, reference);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm font-semibold">Step 1: Choose your contribution method</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Your contribution helps ISOKO Groups support real community projects. You can contribute
          using Mobile Money or bank transfer. After making your payment, enter your transaction
          reference below so our team can verify it.
        </p>
      </div>

      <PayToCompany amount={rwf(amount)} />

      <div className="space-y-4 rounded-lg border border-border p-4">
        <p className="text-sm">
          <span className="font-semibold">Step 2.</span> Enter the transaction reference from your
          confirmation message, so we can match your payment to your contribution.
        </p>

        <div className="space-y-2">
          <Label>How did you pay?</Label>
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} className="gap-2">
            {PAYMENT_METHODS.map((m) => (
              <div key={m.key} className="flex items-center gap-2">
                <RadioGroupItem value={m.key} id={`method-${m.key}`} />
                <Label htmlFor={`method-${m.key}`} className="font-normal">{m.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="donate-reference">Transaction reference</Label>
          <Input
            id="donate-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. the transaction ID in your confirmation message"
            maxLength={120}
            autoComplete="off"
          />
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          <p className="text-xs text-muted-foreground">
            Your contribution counts once we have matched it against our Mobile Money and bank records.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={onBack} disabled={saving}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          type="button"
          className="flex-1 gap-2"
          disabled={saving || !!problem || reference.trim().length < 4}
          onClick={onSubmit}
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</> : <>Record my contribution of {rwf(amount)}</>}
        </Button>
      </div>
    </div>
  );
}

/** What the donor has given before, and where each one got to. */
function MyDonations({ userId }: { userId: string }) {
  const mine = useMyDonations(userId);
  const rows = mine.data ?? [];
  if (mine.isLoading || rows.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-semibold">Your contributions</p>
      {rows.slice(0, 4).map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{rwf(d.amount)} · {new Date(d.submitted_at).toLocaleDateString()}</span>
          <span className="inline-flex items-center gap-1.5">
            {d.status === "pending" && <Clock className="h-3.5 w-3.5 text-primary" />}
            {d.status === "confirmed" && <Check className="h-3.5 w-3.5 text-primary" />}
            {d.status === "rejected" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
            {DONATION_STATUS_LABEL[d.status] ?? d.status}
          </span>
        </div>
      ))}
      {rows.some((d) => d.status === "rejected" && d.review_note) && (
        <p className="text-xs text-muted-foreground">
          {rows.find((d) => d.status === "rejected" && d.review_note)?.review_note}
        </p>
      )}
    </div>
  );
}

export default function DonateDialog({
  open, onOpenChange, initialProjectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Opened from a project's own card, so that project is already chosen. */
  initialProjectId?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"choose" | "pay" | "done">("choose");
  const [amount, setAmount] = useState("");
  const [project, setProject] = useState(initialProjectId ?? GENERAL);
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("momo");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  // A fresh dialog each time it is opened, so a finished contribution is not
  // still on screen the next time somebody wants to give.
  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setAmount("");
    setProject(initialProjectId ?? GENERAL);
    setAnonymous(false);
    setName("");
    setMethod("momo");
    setReference("");
    setSaving(false);
  }, [open, initialProjectId]);

  const chosen = useMemo(() => Number(amount), [amount]);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await submitDonation({
        amount: chosen,
        payment_method: method,
        reference: reference.trim(),
        project_id: project === GENERAL ? null : project,
        donor_name: anonymous ? null : (name.trim() || null),
        donor_email: user.email ?? null,
        anonymous,
      });
      await queryClient.invalidateQueries({ queryKey: ["initiative"] });
      setStep("done");
    } catch (err) {
      toast({ title: "Could not record your contribution", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <HeartHandshake className="h-5 w-5 text-primary" />
            ISOKO Groups Global Initiative
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-primary">$1</span> — One Project. Small contributions,
            pooled together, fund one real project at a time.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="give">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="give">Give</TabsTrigger>
            <TabsTrigger value="apply">Ask for support</TabsTrigger>
          </TabsList>

          <TabsContent value="give" className="mt-5 space-y-5">
            {authLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !user ? (
              <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-6 text-center">
                <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="font-semibold">Sign in to give</p>
                  <p className="text-sm text-muted-foreground">
                    Each contribution is recorded against an account, so you can follow yours from here
                    and see when it has been confirmed. You can still choose not to be named publicly.
                  </p>
                </div>
                <Link to="/login" onClick={() => onOpenChange(false)}>
                  <Button size="lg" className="gap-2">Sign in or register <ArrowRight className="h-4 w-4" /></Button>
                </Link>
              </div>
            ) : step === "choose" ? (
              <>
                <ChooseStep
                  amount={amount} setAmount={setAmount}
                  project={project} setProject={setProject}
                  anonymous={anonymous} setAnonymous={setAnonymous}
                  name={name} setName={setName}
                  onNext={() => setStep("pay")}
                />
                <MyDonations userId={user.id} />
              </>
            ) : step === "pay" ? (
              <PayStep
                amount={chosen}
                method={method} setMethod={setMethod}
                reference={reference} setReference={setReference}
                saving={saving}
                onBack={() => setStep("choose")}
                onSubmit={submit}
              />
            ) : (
              <div className="space-y-4 py-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-display text-lg font-bold">Thank you — we have your reference</p>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    Thank you. Your contribution of {rwf(chosen)} is recorded and waiting to be confirmed.
                    We match it against our Mobile Money and bank records before it counts towards a
                    project, and you can follow it here or on the Global Initiative page.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button variant="outline" onClick={() => setStep("choose")}>Give again</Button>
                  <Link to={INITIATIVE} onClick={() => onOpenChange(false)}>
                    <Button className="w-full gap-2 sm:w-auto">
                      See the projects <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="apply" className="mt-5 space-y-4">
            <div className="space-y-2">
              <p className="font-semibold">Does your own project need support?</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                ISOKO GROUP funds projects in entrepreneurship, arts, agriculture, unemployment reduction
                and research. Tell us what you want to do, who it helps, and what the support would pay
                for. Our team reviews every application and tells you the outcome either way.
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {["You keep one application open at a time", "You can attach a plan, quote or proposal", "Nothing is published until you are approved"].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {line}
                </li>
              ))}
            </ul>
            <Link to={`${INITIATIVE}/apply`} onClick={() => onOpenChange(false)}>
              <Button size="lg" className="w-full gap-2">
                Apply for project support <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="text-center text-xs text-muted-foreground">
              Applying is free and is never treated as a contribution.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
