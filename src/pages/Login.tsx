import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/subscription";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/isoko-logo.jpeg";

// A confirmation link is on its way (just registered), or is still needed (tried to log in unconfirmed)
type Notice = { kind: "sent" | "unconfirmed"; email: string };

const Login = () => {
  const { user, loading: authLoading, signIn, signUp, resendConfirmation } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { isActive, loading: subLoading } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState("login");
  const [notice, setNotice] = useState<Notice | null>(null);

  // Signed in (just now, or already when they opened this page): once this account's
  // subscription is known, go where they were heading, or to Subscription if they
  // have no access yet.
  useEffect(() => {
    if (authLoading || subLoading || !user) return;
    const id = window.setTimeout(
      () => navigate(isActive ? from ?? "/" : "/subscription", { replace: true }),
      success ? 1200 : 0,
    );
    return () => window.clearTimeout(id);
  }, [authLoading, subLoading, user, isActive, from, success, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = (form.get("email") as string).trim();
    const { error } = await signIn(email, form.get("password") as string);
    setLoading(false);
    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        setNotice({ kind: "unconfirmed", email });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      setNotice(null);
      toast({ title: "Success", description: "Logged in successfully!" });
      setSuccess(true);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    setLoading(true);
    const form = new FormData(formEl);
    const email = (form.get("email") as string).trim();
    const { error, alreadyRegistered } = await signUp(
      email,
      form.get("password") as string,
      (form.get("fullname") as string).trim(),
    );
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (alreadyRegistered) {
      toast({
        title: "You already have an account",
        description: "Log in with this email, or use “Forgot your password?” to set a new password.",
      });
      setTab("login");
    } else {
      formEl.reset();
      setNotice({ kind: "sent", email });
      setTab("login");
    }
  };

  const handleResend = async () => {
    if (!notice) return;
    setLoading(true);
    const { error } = await resendConfirmation(notice.email);
    setLoading(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Sent", description: `We sent a new confirmation link to ${notice.email}.` });
  };

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container max-w-md">
          <div className="text-center mb-8 space-y-2">
            <motion.img
              src={logo}
              alt="ISOKO GROUP"
              className="mx-auto h-16 w-16 rounded-full object-cover shadow-lg"
              initial={{ scale: 0.4, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
            <h1 className="text-3xl font-display font-bold">{t("auth.welcomeBack")}</h1>
            <p className="text-muted-foreground">{t("auth.subtitle")}</p>
          </div>

          <AnimatePresence>
            {success && (
              <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.img
                  src={logo}
                  alt="ISOKO GROUP"
                  className="h-32 w-32 rounded-full object-cover shadow-2xl"
                  initial={{ scale: 0.2, opacity: 0, rotate: -20 }}
                  animate={{ scale: [0.2, 1.3, 0.95, 1.1, 1], opacity: 1, rotate: [-20, 10, -5, 0] }}
                  transition={{ duration: 3, ease: [0.22, 1, 0.36, 1], times: [0, 0.3, 0.6, 0.85, 1] }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {notice && (
            <div className="mb-4 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" role="status">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-2">
                <p>
                  {notice.kind === "sent" ? "Account created. We sent a confirmation link to " : "Please confirm your email first. We sent a link to "}
                  <strong className="break-all">{notice.email}</strong>. Open it, then log in here.
                </p>
                <button type="button" onClick={handleResend} disabled={loading} className="font-semibold text-primary hover:underline disabled:opacity-50">
                  Didn't get it? Send the link again
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
                <TabsTrigger value="register">{t("auth.register")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input id="email" name="email" type="email" placeholder="you@example.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    <Input id="password" name="password" type="password" placeholder="••••••••" required />
                    <Link to="/forgot-password" className="block text-right text-sm text-primary hover:underline">
                      {t("auth.forgot")}
                    </Link>
                  </div>
                  <Button className="w-full" size="lg" disabled={loading}>
                    {loading ? "..." : t("auth.login")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div className="space-y-2">
                    <Label htmlFor="fullname">{t("auth.fullName")}</Label>
                    <Input id="fullname" name="fullname" placeholder="Your full name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">{t("auth.email")}</Label>
                    <Input id="reg-email" name="email" type="email" placeholder="you@example.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">{t("auth.password")}</Label>
                    <Input id="reg-password" name="password" type="password" placeholder="••••••••" required />
                  </div>
                  <Button className="w-full" size="lg" disabled={loading}>
                    {loading ? "..." : t("auth.createAccount")}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">{t("auth.subscription")}</p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Login;
