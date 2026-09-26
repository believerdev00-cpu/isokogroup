import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const Login = () => {
  const { signIn, signUp } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isActive } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get("email") as string, form.get("password") as string);
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Logged in successfully!" });
      setSuccess(true);
      setTimeout(() => {
        if (!isActive) navigate("/subscription");
        else navigate("/");
      }, 3000);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signUp(
      form.get("email") as string,
      form.get("password") as string,
      form.get("fullname") as string,
    );
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Account created! Check your email to verify." });
    }
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

          <div className="rounded-xl border border-border bg-card p-6">
            <Tabs defaultValue="login">
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
