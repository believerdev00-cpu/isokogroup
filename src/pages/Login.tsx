import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MailCheck, ShoppingBag, Store } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authErrorMessage, isEmailRateLimit, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/subscription";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/subscription";
import { useSiteSettings } from "@/lib/siteSettings";
import { MomoCodeLink } from "@/components/PayToCompany";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import logo from "@/assets/isoko-logo.jpeg";

// A confirmation link is on its way (just registered), or is still needed (tried to log in unconfirmed)
type Notice = { kind: "sent" | "unconfirmed"; email: string };

// Supabase Auth sends one email per address per minute at most; the button waits as long
const RESEND_COOLDOWN_S = 60;

const Login = () => {
  const { user, loading: authLoading, signIn, signUp, resendConfirmation } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  // /login?tab=register opens on the Register tab (the Register buttons in the header link here)
  const [params] = useSearchParams();
  const { isActive, loading: subLoading } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState(params.get("tab") === "register" ? "register" : "login");
  const [notice, setNotice] = useState<Notice | null>(null);
  // Register as a normal user / buyer (as before), or as a seller (pays the seller registration fee)
  const [registerAs, setRegisterAs] = useState<"buyer" | "seller">("buyer");
  const { sellerMonthlyPrice, momo } = useSiteSettings();
  // One request at a time: a second click or Enter while one is running does nothing
  const inFlight = useRef(false);
  // Seconds until the confirmation link can be sent again
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  // Signed in (just now, or already when they opened this page): once this account's
  // subscription is known, go where they were heading, or to Subscription if they
  // have no access yet.
  // Someone who registered as a seller continues with the seller application and its fee.
  useEffect(() => {
    if (authLoading || subLoading || !user) return;
    const sellerRegistrant = user.user_metadata?.register_as === "seller";
    const id = window.setTimeout(
      // Back to the page they came from (a member page shows its own subscription
      // wall if access has ended); otherwise home, or Subscription when access ended.
      () => navigate(sellerRegistrant ? from ?? "/become-seller" : from ?? (isActive ? "/" : "/subscription"), { replace: true }),
      success ? 1200 : 0,
    );
    return () => window.clearTimeout(id);
  }, [authLoading, subLoading, user, isActive, from, success, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = (form.get("email") as string).trim();
    const { error } = await signIn(email, form.get("password") as string);
    inFlight.current = false;
    setLoading(false);
    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        setNotice({ kind: "unconfirmed", email });
      } else {
        toast({ title: "Error", description: authErrorMessage(error), variant: "destructive" });
      }
    } else {
      setNotice(null);
      toast({ title: "Success", description: "Logged in successfully!" });
      setSuccess(true);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const formEl = e.currentTarget;
    setLoading(true);
    const form = new FormData(formEl);
    const email = (form.get("email") as string).trim();
    const { error, alreadyRegistered } = await signUp(
      email,
      form.get("password") as string,
      (form.get("fullname") as string).trim(),
      registerAs,
    );
    inFlight.current = false;
    setLoading(false);
    if (error) {
      // Auth's email limit: the account may exist already, so offer the "send again" link, with a wait
      toast({ title: isEmailRateLimit(error) ? "Please wait a moment" : "Error", description: authErrorMessage(error), variant: "destructive" });
      if (isEmailRateLimit(error)) {
        setNotice({ kind: "unconfirmed", email });
        setResendIn(RESEND_COOLDOWN_S);
      }
    } else if (alreadyRegistered) {
      toast({
        title: "You already have an account",
        description: "Log in with this email, or use “Forgot your password?” to set a new password.",
      });
      setTab("login");
    } else {
      formEl.reset();
      // a conversion for Google Ads (the event name only; nothing about the person)
      trackEvent("sign_up");
      setNotice({ kind: "sent", email });
      setResendIn(RESEND_COOLDOWN_S);
      setTab("login");
    }
  };

  const handleResend = async () => {
    if (!notice || inFlight.current || resendIn > 0) return;
    inFlight.current = true;
    setLoading(true);
    const { error } = await resendConfirmation(notice.email);
    inFlight.current = false;
    setLoading(false);
    // Either way, wait before the next one: Auth sends at most one email a minute per address
    setResendIn(RESEND_COOLDOWN_S);
    if (error) toast({ title: isEmailRateLimit(error) ? "Please wait a moment" : "Error", description: authErrorMessage(error), variant: "destructive" });
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
                <button type="button" onClick={handleResend} disabled={loading || resendIn > 0} className="font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline">
                  {resendIn > 0 ? t("auth.resendIn").replace("{s}", String(resendIn)) : "Didn't get it? Send the link again"}
                </button>
                <p className="text-xs text-muted-foreground">Check your spam folder too. The email comes from Isoko Groups.</p>
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
                    <Label>Register as</Label>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Register as">
                      {([
                        { key: "buyer", icon: ShoppingBag, title: "Normal user / Buyer", text: "Shop and use every Isoko service" },
                        { key: "seller", icon: Store, title: "Seller", text: `Sell your products or property · ${formatPrice(sellerMonthlyPrice)} a month` },
                      ] as const).map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          role="radio"
                          aria-checked={registerAs === o.key}
                          onClick={() => setRegisterAs(o.key)}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors",
                            registerAs === o.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                          )}
                        >
                          <o.icon className="h-5 w-5 text-primary" aria-hidden />
                          <span className="text-sm font-semibold">{o.title}</span>
                          <span className="text-xs text-muted-foreground">{o.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
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
                  {registerAs === "seller" ? (
                    <p className="text-xs text-muted-foreground text-center">
                      After confirming your email you fill in the seller application and pay the seller subscription, {formatPrice(sellerMonthlyPrice)} a month, to our Mobile Money
                      code <MomoCodeLink code={momo.code} /> (or by bank transfer). Your seller account opens once an Isoko admin confirms the payment; it
                      includes everything a normal user gets, so you don't pay the 50 or 200 RWF subscription.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">{t("auth.subscription")}</p>
                  )}
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
