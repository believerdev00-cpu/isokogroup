import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const ForgotPassword = () => {
  const { requestPasswordReset } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await requestPasswordReset(new FormData(e.currentTarget).get("email") as string);
    setLoading(false);
    // Supabase answers the same whether or not the account exists, and so does this page.
    if (error?.status === 429) {
      toast({ title: "Error", description: t("auth.tooMany"), variant: "destructive" });
    } else if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container max-w-md">
          <div className="text-center mb-8 space-y-2">
            <h1 className="text-3xl font-display font-bold">{t("auth.forgotTitle")}</h1>
            <p className="text-muted-foreground">{t("auth.forgotSubtitle")}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            {sent ? (
              <p role="status">{t("auth.linkSent")}</p>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                </div>
                <Button className="w-full" size="lg" disabled={loading}>
                  {loading ? "..." : t("auth.sendLink")}
                </Button>
              </form>
            )}
            <Link to="/login" className="block text-center text-sm text-primary hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default ForgotPassword;
