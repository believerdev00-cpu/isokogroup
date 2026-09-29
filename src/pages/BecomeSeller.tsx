import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Upload, FileCheck2, X, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const rules = [
  "10% monthly commission on profits",
  "Products must meet quality standards",
  "ID verification required",
  "Active subscription required (50 RWF the first month, then 200 RWF a month)",
];

const MAX_ID_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_ID_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];

const BecomeSeller = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fullname, setFullname] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [existingApp, setExistingApp] = useState<any>(null);
  const [checkingApp, setCheckingApp] = useState(true);

  const fetchApplication = async () => {
    if (!user) { setCheckingApp(false); return; }
    setCheckingApp(true);
    const { data } = await (supabase as any)
      .from("seller_applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setExistingApp(data);
    setCheckingApp(false);
  };

  useEffect(() => {
    fetchApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_ID_TYPES.includes(f.type)) {
      toast({ title: "Invalid file type", description: "Upload a JPG, PNG, WEBP or PDF file.", variant: "destructive" });
      return;
    }
    if (f.size > MAX_ID_SIZE) {
      toast({ title: "File too large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }
    setIdFile(f);
  };

  const clearFile = () => {
    setIdFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please login first", variant: "destructive" });
      navigate("/login");
      return;
    }

    const trimmedName = fullname.trim();
    const trimmedBusiness = business.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedId = idNumber.trim();

    if (!trimmedName || trimmedName.length < 3) {
      toast({ title: "Invalid full name", description: "Please enter your full legal name (at least 3 characters).", variant: "destructive" });
      return;
    }
    if (!trimmedBusiness || trimmedBusiness.length < 2) {
      toast({ title: "Invalid business name", description: "Please enter a valid business name.", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (!/^\+?[\d\s-]{8,15}$/.test(trimmedPhone)) {
      toast({ title: "Invalid phone", description: "Please enter a valid phone number (8-15 digits).", variant: "destructive" });
      return;
    }
    if (!trimmedId || trimmedId.length < 6) {
      toast({ title: "Invalid ID", description: "Please enter your full national ID number.", variant: "destructive" });
      return;
    }
    if (!idFile) {
      toast({ title: "ID document required", description: "Please upload a clear scan or photo of your national ID.", variant: "destructive" });
      return;
    }

    setLoading(true);

    // Upload ID document to private storage bucket under user's folder
    const ext = idFile.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${user.id}/id-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("id-documents")
      .upload(path, idFile, { upsert: false, contentType: idFile.type });

    if (uploadError) {
      setLoading(false);
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).from("seller_applications").insert({
      user_id: user.id,
      full_name: trimmedName,
      business_name: trimmedBusiness,
      email: trimmedEmail,
      phone: trimmedPhone,
      id_number: trimmedId,
      id_document_url: path,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Application Submitted!", description: "We will review your application and ID document and get back to you soon." });
      setFullname(""); setBusiness(""); setEmail(""); setPhone(""); setIdNumber("");
      clearFile();
      fetchApplication();
    }
  };

  const statusConfig = {
    pending: {
      icon: Clock,
      label: "Pending Review",
      color: "text-yellow-700 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900",
      message: "Your application is under review. We'll notify you once a decision is made.",
    },
    approved: {
      icon: CheckCircle,
      label: "Approved",
      color: "text-green-700 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
      message: "Congratulations! Your seller application has been approved. You can now access the seller dashboard.",
    },
    rejected: {
      icon: XCircle,
      label: "Rejected",
      color: "text-destructive",
      bg: "bg-destructive/5 border-destructive/30",
      message: "Your application was not approved. Please contact support or submit a new application with corrected information.",
    },
  } as const;

  return (
    <div className="min-h-screen">
      <Header />
      <section className="py-20">
        <div className="container max-w-2xl">
          <div className="text-center mb-12 space-y-4">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">{t("seller.title")}</span>
            <h1 className="text-4xl font-display font-bold">{t("seller.title")}</h1>
            <p className="text-muted-foreground">{t("seller.subtitle")}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("seller.rules")}</h2>
            <ul className="space-y-3">
              {rules.map((r) => (
                <li key={r} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" /> {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Application status banner */}
          {!checkingApp && existingApp && statusConfig[existingApp.status as keyof typeof statusConfig] && (() => {
            const cfg = statusConfig[existingApp.status as keyof typeof statusConfig];
            const Icon = cfg.icon;
            return (
              <div className={`rounded-xl border p-6 mb-8 ${cfg.bg}`}>
                <div className="flex items-start gap-4">
                  <Icon className={`h-6 w-6 flex-shrink-0 mt-0.5 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-semibold">Your Application Status:</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${cfg.color} bg-background/60`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{cfg.message}</p>
                    {existingApp.status === "rejected" && existingApp.rejection_reason && (
                      <div className="mt-3 rounded-md border border-destructive/30 bg-background/60 p-3">
                        <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Reason from admin</p>
                        <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">{existingApp.rejection_reason}</p>
                      </div>
                    )}
                    <div className="mt-3 text-xs text-muted-foreground space-y-1">
                      <p><span className="font-medium text-foreground">Submitted:</span> {new Date(existingApp.created_at).toLocaleString()}</p>
                      <p><span className="font-medium text-foreground">Business:</span> {existingApp.business_name}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="rounded-xl border border-border bg-card p-8">
            <h2 className="text-xl font-semibold mb-2">
              {existingApp?.status === "rejected" ? t("seller.reapply") : existingApp ? t("seller.submitNewApplication") : t("seller.form")}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">{t("seller.formInstructions")}</p>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullname">{t("seller.fullName")} *</Label>
                  <Input id="fullname" placeholder="Your full legal name" value={fullname} onChange={(e) => setFullname(e.target.value)} required minLength={3} maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business">{t("seller.businessName")} *</Label>
                  <Input id="business" placeholder="Your business name" value={business} onChange={(e) => setBusiness(e.target.value)} required minLength={2} maxLength={100} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")} *</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("seller.phone")} *</Label>
                  <Input id="phone" type="tel" placeholder="+250 7XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={8} maxLength={20} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="id">{t("seller.idNumber")} *</Label>
                <Input id="id" placeholder="National ID number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required minLength={6} maxLength={30} />
              </div>

              {/* ID document upload */}
              <div className="space-y-2">
                <Label htmlFor="id-doc">National ID document *</Label>
                <p className="text-xs text-muted-foreground">Upload a clear scan or photo of your national ID (JPG, PNG, WEBP or PDF, max 5MB).</p>
                <input
                  ref={fileInputRef}
                  id="id-doc"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {!idFile ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 hover:bg-muted/60 hover:border-primary transition-colors p-6 text-sm text-muted-foreground"
                  >
                    <Upload className="h-6 w-6 text-primary" />
                    <span className="font-medium">Click to upload your ID document</span>
                    <span className="text-xs">JPG, PNG, WEBP or PDF · max 5MB</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{idFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(idFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <Button className="w-full hover-glow" size="lg" disabled={loading}>
                {loading ? "Submitting..." : t("seller.submit")}
              </Button>
            </form>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default BecomeSeller;
