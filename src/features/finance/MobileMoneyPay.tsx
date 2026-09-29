// "Pay from your phone": MTN Mobile Money, Airtel Money or SPENN through ItecPay.
//
// 1. mobile_money_start (database) checks the customer may pay for this record,
//    checks the amount and records a pending payment.
// 2. The payments-itecpay Edge Function sends it to ItecPay: the customer gets a
//    prompt on their phone and approves it with their PIN.
// 3. This screen follows the payment until ItecPay confirms it (or it fails or
//    times out). Only ItecPay's own status check, made by our server, marks it paid.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, errorText, formatMoney } from "@/features/services/api";
import { cn } from "@/lib/utils";

type Network = "mtn" | "airtel" | "spenn";
const NETWORKS: { id: Network; label: string; hint: string }[] = [
  { id: "mtn", label: "MTN MoMo", hint: "078 / 079" },
  { id: "airtel", label: "Airtel Money", hint: "072 / 073" },
  { id: "spenn", label: "SPENN", hint: "Your SPENN number" },
];

/** A private link's token (travel, consultancy, data, a Training Center application), or the signed-in customer's own record. */
export type MobileMoneyTarget =
  | { entityTable: "travel_trips" | "consult_requests" | "data_requests" | "training.applications"; token: string }
  | { entityTable: string; entityId: string };

type Status = { status: string; amount: number; message?: string | null };

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payments-itecpay`;
const POLL_MS = 4000;
const CHECK_EVERY_MS = 20_000;
const GIVE_UP_MS = 16 * 60_000; // the server stops waiting at 15 minutes

async function callFunction(route: "send" | "check", paymentId: string): Promise<Status | null> {
  const res = await fetch(`${FUNCTION_URL}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ payment_id: paymentId }),
  });
  return res.json().catch(() => null);
}

async function readStatus(paymentId: string): Promise<Status> {
  const { data, error } = await db.rpc("mobile_money_status", { p_payment_id: paymentId });
  if (error) throw new Error(error.message);
  return data as Status;
}

/** Whether to offer paying from the phone (switched on by Isoko; RWF only). */
export function useMobileMoneyAvailable(currency: string) {
  const q = useQuery({
    queryKey: ["mobile_money_available"],
    queryFn: async () => {
      const { data, error } = await db.rpc("mobile_money_available");
      return !error && data === true;
    },
    staleTime: 5 * 60_000,
  });
  return currency === "RWF" && q.data === true;
}

export function MobileMoneyPay({
  target, amountDue, currency, onPaid, onCancel, accentClass,
}: {
  target: MobileMoneyTarget;
  amountDue: number;
  currency: string;
  onPaid: () => void;
  onCancel?: () => void;
  /** Classes for the selected network and the main button, to match the page */
  accentClass?: string;
}) {
  const [network, setNetwork] = useState<Network>("mtn");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(String(Math.max(Math.floor(amountDue), 0) || ""));
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "starting" | "waiting" | "paid" | "failed">("form");
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // Follow the payment until it is settled
  useEffect(() => {
    if (state !== "waiting" || !paymentId) return;
    let stopped = false;
    let lastCheck = Date.now();
    const tick = async () => {
      if (stopped) return;
      try {
        let s = await readStatus(paymentId);
        if (["pending", "processing"].includes(s.status) && Date.now() - lastCheck > CHECK_EVERY_MS) {
          lastCheck = Date.now();
          s = (await callFunction("check", paymentId)) ?? s;
        }
        if (stopped) return;
        if (s.status === "successful") {
          setState("paid");
          onPaidRef.current();
          return;
        }
        if (["failed", "cancelled"].includes(s.status)) {
          setMessage(s.message || "The payment didn't go through.");
          setState("failed");
          return;
        }
        if (Date.now() - startedAt.current > GIVE_UP_MS) {
          setMessage("We didn't get your approval. If money left your account, it will still be recorded; contact Isoko if it doesn't show.");
          setState("failed");
          return;
        }
      } catch {
        // a network blip: try again on the next tick
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    let timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [state, paymentId]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("starting");
    setMessage(null);
    const args = {
      p_entity_table: target.entityTable,
      p_entity_id: "entityId" in target ? target.entityId : null,
      p_token: "token" in target ? target.token : null,
      p_network: network,
      p_phone: phone,
      p_amount: Number(amount),
    };
    const { data, error } = await db.rpc("mobile_money_start", args);
    if (error) {
      // one payment waits at a time: follow the one already on its way
      if (/already waiting/i.test(error.message) && /^[0-9a-f-]{36}$/i.test(error.hint ?? "")) {
        setPaymentId(error.hint);
        startedAt.current = Date.now();
        setState("waiting");
        return;
      }
      setMessage(errorText(new Error(error.message)));
      setState("form");
      return;
    }
    const id = (data as { payment_id: string }).payment_id;
    setPaymentId(id);
    startedAt.current = Date.now();
    try {
      const sent = await callFunction("send", id);
      if (sent?.status === "failed" || sent?.status === "cancelled") {
        setMessage(sent.message || "The payment request was refused.");
        setState("failed");
        return;
      }
    } catch {
      // the status checks decide
    }
    setState("waiting");
  };

  if (state === "waiting" || state === "starting") {
    return (
      <div className="space-y-3 rounded-xl border p-4 text-sm" role="status" aria-live="polite">
        <p className="flex items-center gap-2 font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {state === "starting" ? "Sending the request to your phone…" : "Approve the payment on your phone"}
        </p>
        {state === "waiting" && (
          <p className="text-muted-foreground">
            You'll get a prompt for {formatMoney(Number(amount), currency)}. Enter your PIN to approve it. This page updates by itself.
          </p>
        )}
      </div>
    );
  }
  if (state === "paid") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status">
        <CheckCircle2 className="h-5 w-5" aria-hidden /> Payment received. Thank you!
      </p>
    );
  }

  return (
    <form onSubmit={start} className="space-y-4">
      {state === "failed" && message && (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {message}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Your mobile money">
        {NETWORKS.map((n) => (
          <button
            key={n.id}
            type="button"
            role="radio"
            aria-checked={network === n.id}
            onClick={() => setNetwork(n.id)}
            className={cn("rounded-xl border p-2.5 text-left text-sm", network === n.id && (accentClass ?? "border-primary ring-2 ring-primary"))}
          >
            <span className="block font-semibold">{n.label}</span>
            <span className="block text-xs text-muted-foreground">{n.hint}</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mm-phone">Phone number</Label>
        <Input id="mm-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="078 123 4567" value={phone}
          onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mm-amount">Amount ({currency})</Label>
        <Input id="mm-amount" type="number" inputMode="numeric" min="1" step="1" max={Math.floor(amountDue)} value={amount}
          onChange={(e) => setAmount(e.target.value)} required />
      </div>
      {state === "form" && message && <p className="text-sm text-destructive" role="alert">{message}</p>}
      <Button type="submit" className="w-full" disabled={!phone.trim() || !(Number(amount) > 0)}>
        <Smartphone className="mr-2 h-4 w-4" aria-hidden /> Pay {Number(amount) > 0 ? formatMoney(Number(amount), currency) : ""} now
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  );
}
