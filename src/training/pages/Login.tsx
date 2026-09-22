import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Field, Loading } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, HOME_FOR, useAuth } from "@/training/lib/auth";

// One sign-in page for students, trainers and staff; the account decides the portal.
export default function Login() {
  const { user, loading, accountEmail, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (user) {
    const next = params.get("next");
    const to = user.must_change_password ? "/training-center/change-password" : next?.startsWith(HOME_FOR[user.role]) ? next : HOME_FOR[user.role];
    return <Navigate to={to} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await signIn(email, password);
      const next = params.get("next");
      if (me.must_change_password) navigate("/training-center/change-password", { replace: true });
      else navigate(next && next.startsWith(HOME_FOR[me.role]) ? next : HOME_FOR[me.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container flex justify-center py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For students, trainers and staff of Isoko Training Center. Use your Isoko account.
          </p>
          {accountEmail && (
            <div className="mt-4 rounded-md bg-info-soft px-3 py-2 text-sm text-info" role="status">
              You're signed in to Isoko as <span className="font-semibold">{accountEmail}</span>, which has no Training Center access.{" "}
              <button type="button" className="font-semibold underline" onClick={() => signOut()}>
                Use another account
              </button>
            </div>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && (
              <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy || !email || !password}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-sm text-muted-foreground">
            New students receive their login details when their application is approved; if you already have an Isoko account, you keep using it. Forgot your password? Ask the training center office to reset it.
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Not a student yet? <Link to="/training-center/intakes" className="font-semibold text-primary hover:underline">See available intakes</Link>
        </p>
      </div>
    </div>
  );
}
