import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Field, Loading } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, HOME_FOR, useAuth } from "@/training/lib/auth";

export default function ChangePassword() {
  const { user, loading, changePassword } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/training-center/login" replace />;
  const forced = user.must_change_password;
  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      toast.success("Password changed");
      navigate(HOME_FOR[user.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container flex justify-center py-12 sm:py-20">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold">{forced ? "Choose your own password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {forced
            ? `Welcome, ${user.full_name}. Replace the temporary password you were given with one only you know.`
            : "Other devices signed in to your account will be signed out."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label={forced ? "Temporary password" : "Current password"} htmlFor="current">
            <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="new" hint="At least 8 characters.">
            <Input id="new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm" error={mismatch ? "The passwords don't match" : null}>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || next.length < 8 || next !== confirm || !current}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save password
          </Button>
        </form>
      </div>
    </div>
  );
}
