import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
      { title: "تسجيل الدخول — كاشير كلاود" },
      { name: "description", content: "سجّل الدخول لنظام نقاط البيع أو أنشئ حساب متجرك الجديد." },
      { property: "og:title", content: "تسجيل الدخول — كاشير كلاود" },
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
    await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", uid);
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
      toast.error(error.message.includes("already") ? "هذا البريد مسجل بالفعل" : "تعذر إنشاء الحساب");
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
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">
            ك
          </span>
          <CardTitle className="mt-3">كاشير كلاود</CardTitle>
          <CardDescription>نظام نقاط البيع وإدارة المتاجر</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">دخول</TabsTrigger>
              <TabsTrigger value="signup">متجر جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="in-email">البريد الإلكتروني</Label>
                  <Input
                    id="in-email"
                    type="email"
                    required
                    dir="ltr"
                    value={inEmail}
                    onChange={(e) => setInEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="in-pass">كلمة المرور</Label>
                  <Input
                    id="in-pass"
                    type="password"
                    required
                    dir="ltr"
                    value={inPass}
                    onChange={(e) => setInPass(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={busy}>
                  {busy ? "جارٍ الدخول..." : "تسجيل الدخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={handleSignUp}>
                <div className="space-y-2">
                  <Label htmlFor="org">اسم المتجر / النشاط</Label>
                  <Input id="org" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">اسمك بالكامل</Label>
                  <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
                <Button className="w-full" disabled={busy}>
                  {busy ? "جارٍ الإنشاء..." : "إنشاء المتجر"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
