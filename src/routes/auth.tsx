import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarChart3, Boxes, CheckCircle2, Eye, EyeOff, ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — SmartPOS" },
      { name: "description", content: "سجّل الدخول إلى SmartPOS لإدارة المبيعات والمخزون." },
      { property: "og:title", content: "تسجيل الدخول — SmartPOS" },
      { property: "og:description", content: "الدخول إلى نظام نقاط البيع وإدارة المتجر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [inEmail, setInEmail] = useState("");
  const [inPass, setInPass] = useState("");

  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [upEmail, setUpEmail] = useState("");
  const [upPass, setUpPass] = useState("");

  async function afterAuth() {
    await refresh();
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await supabase
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", uid);
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("id", uid)
      .maybeSingle();
    if (!prof?.org_id) {
      navigate({ to: "/onboarding" });
      return;
    }
    navigate({ to: prof.role === "CASHIER" ? "/pos" : "/dashboard" });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: inEmail, password: inPass });
    setBusy(false);
    if (error) {
      toast.error("تعذر تسجيل الدخول: تحقق من البريد وكلمة المرور");
      return;
    }
    await afterAuth();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (upPass.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: upEmail,
      password: upPass,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: fullName },
      },
    });
    if (error) {
      setBusy(false);
      const code = (error as { code?: string }).code ?? "";
      if (code === "weak_password" || error.message.toLowerCase().includes("weak")) {
        toast.error("كلمة المرور ضعيفة أو شائعة، اختر كلمة مرور أقوى");
      } else if (error.message.includes("already") || code === "user_already_exists") {
        toast.error("هذا البريد مسجل بالفعل");
      } else {
        toast.error("تعذر إنشاء الحساب، تحقق من البيانات وحاول مرة أخرى");
      }
      return;
    }

    if (!data.session) {
      setBusy(false);
      toast.success("تم إنشاء الحساب. تحقق من بريدك لتأكيد الحساب ثم سجّل الدخول.");
      return;
    }
    const { error: rpcError } = await supabase.rpc("bootstrap_organization", {
      _org_name: orgName,
      _full_name: fullName,
    });
    setBusy(false);
    if (rpcError) {
      toast.error("تم إنشاء الحساب لكن تعذر إنشاء المتجر، حاول مرة أخرى");
      return;
    }
    toast.success("تم إنشاء متجرك بنجاح");
    await refresh();
    navigate({ to: "/dashboard" });
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(480px,42%)]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary-foreground/15">
            <ShoppingCart className="size-6" />
          </span>
          <div>
            <div className="text-2xl font-black">SmartPOS</div>
            <div className="text-xs text-primary-foreground/70">نقطة بيع ذكية لمتجرك</div>
          </div>
        </div>
        <div className="relative z-10 max-w-xl">
          <h1 className="text-4xl font-black leading-tight">
            كل ما تحتاجه لإدارة متجرك، في مكان واحد.
          </h1>
          <p className="mt-4 max-w-lg leading-8 text-primary-foreground/75">
            بيع أسرع، مخزون دقيق، وتقارير واضحة لحظة بلحظة مع استمرار العمل عند انقطاع الإنترنت.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            <AuthFeature icon={Store} title="مبيعات سهلة" />
            <AuthFeature icon={Boxes} title="مخزون لحظي" />
            <AuthFeature icon={BarChart3} title="تقارير واضحة" />
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-sm text-primary-foreground/70">
          <CheckCircle2 className="size-4" /> آمن، سريع، ومصمم للمتاجر العربية
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-10">
        <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
          <CardHeader className="px-0 text-start">
            <span className="mb-6 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg lg:hidden">
              <ShoppingCart />
            </span>
            <CardTitle className="text-3xl font-black">مرحبًا بك في SmartPOS</CardTitle>
            <CardDescription className="pt-2">
              سجّل الدخول للمتابعة إلى لوحة إدارة متجرك
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Tabs defaultValue="signin">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg bg-secondary">
                <TabsTrigger value="signin">دخول</TabsTrigger>
                <TabsTrigger value="signup">متجر جديد</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form className="space-y-5 pt-6" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="in-email">البريد الإلكتروني</Label>
                    <Input
                      id="in-email"
                      type="email"
                      required
                      dir="ltr"
                      value={inEmail}
                      onChange={(e) => setInEmail(e.target.value)}
                      className="h-11 bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="in-pass">كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        id="in-pass"
                        type={showPassword ? "text" : "password"}
                        required
                        dir="ltr"
                        value={inPass}
                        onChange={(e) => setInPass(e.target.value)}
                        className="h-11 bg-card pe-11"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute end-1 top-1/2 size-9 -translate-y-1/2"
                        aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  </div>
                  <Button className="h-12 w-full text-base font-black" disabled={busy}>
                    {busy ? "جارٍ الدخول..." : "تسجيل الدخول"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-4 pt-6" onSubmit={handleSignUp}>
                  <div className="space-y-2">
                    <Label htmlFor="org">اسم المتجر / النشاط</Label>
                    <Input
                      id="org"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">اسمك بالكامل</Label>
                    <Input
                      id="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="up-email">البريد الإلكتروني</Label>
                    <Input
                      id="up-email"
                      type="email"
                      required
                      dir="ltr"
                      value={upEmail}
                      onChange={(e) => setUpEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="up-pass">كلمة المرور</Label>
                    <Input
                      id="up-pass"
                      type="password"
                      required
                      dir="ltr"
                      value={upPass}
                      onChange={(e) => setUpPass(e.target.value)}
                    />
                  </div>
                  <Button className="h-12 w-full font-black" disabled={busy}>
                    {busy ? "جارٍ الإنشاء..." : "إنشاء المتجر"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function AuthFeature({ icon: Icon, title }: { icon: typeof Store; title: string }) {
  return (
    <div className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 p-4">
      <Icon className="mb-3 size-5" />
      <div className="text-sm font-bold">{title}</div>
    </div>
  );
}
