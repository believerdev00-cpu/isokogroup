import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const MIN_LENGTH = 8;

/** Where the emailed reset link lands: Supabase has already signed the person in from the link. */
const ResetPassword = () => {
  const { session, loading: sessionLoading, updatePassword } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    if (password !== form.get("confirm")) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setSaving(true);
    const { error } = await updatePassword(password);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: t("auth.passwordSaved") });
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-display font-bold">{t("auth.forgotTitle")}</h1>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            {sessionLoading ? (
              <p className="text-center text-muted-foreground">...</p>
            ) : !session ? (
              <>
                <p role="alert">{t("auth.linkInvalid")}</p>
                <Button asChild className="w-full" size="lg">
                  <Link to="/forgot-password">{t("auth.newLink")}</Link>
                </Button>
              </>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.newPassword")}</Label>
                  <Input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required />
                  <p className="text-xs text-muted-foreground">{t("auth.passwordRule")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
                  <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required aria-invalid={mismatch} />
                  {mismatch && <p className="text-sm text-destructive">{t("auth.passwordMismatch")}</p>}
                </div>
                <Button className="w-full" size="lg" disabled={saving}>
                  {saving ? "..." : t("auth.savePassword")}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default ResetPassword;
