import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "إعداد المتجر — SmartPOS" },
      { name: "description", content: "أكمل بيانات متجرك الأساسية لبدء استخدام SmartPOS." },
      { property: "og:title", content: "إعداد المتجر — SmartPOS" },
      { property: "og:description", content: "إعداد المتجر والفرع الرئيسي ونقطة البيع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [taxRate, setTaxRate] = useState("0");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("bootstrap_organization", {
      _org_name: orgName,
      _full_name: fullName,
      _currency: currency,
      _tax_rate: Number(taxRate) || 0,
    });
    setBusy(false);
    if (error) {
      toast.error("تعذر إنشاء المتجر، حاول مرة أخرى");
      return;
    }
    toast.success("تم إنشاء متجرك");
    await refresh();
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>إعداد متجرك</CardTitle>
          <CardDescription>
            {session?.user.email} — خطوة واحدة وننشئ لك الفرع الرئيسي والمستودع وجهاز الكاشير.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="org">اسم المتجر</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cur">العملة</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="cur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">الجنيه المصري (EGP)</SelectItem>
                    <SelectItem value="SAR">الريال السعودي (SAR)</SelectItem>
                    <SelectItem value="AED">الدرهم الإماراتي (AED)</SelectItem>
                    <SelectItem value="MAD">الدرهم المغربي (MAD)</SelectItem>
                    <SelectItem value="KWD">الدينار الكويتي (KWD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">نسبة الضريبة %</Label>
                <Input
                  id="tax"
                  type="number"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
            </div>
            <Button className="w-full" disabled={busy}>
              {busy ? "جارٍ الإنشاء..." : "إنشاء المتجر"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
