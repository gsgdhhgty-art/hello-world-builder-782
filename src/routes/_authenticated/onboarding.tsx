import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  validateSearch: (search: Record<string, unknown>): { industry?: string } => ({
    industry: typeof search.industry === "string" ? search.industry : undefined,
  }),
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
  const { industry } = Route.useSearch();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [taxRate, setTaxRate] = useState("0");
  const [busy, setBusy] = useState(false);

  // No industry chosen yet -> go back to the selection screen.
  useEffect(() => {
    if (!industry) {
      navigate({ to: "/select-industry", replace: true });
    }
  }, [industry, navigate]);

  const industryQuery = useQuery({
    queryKey: ["industry", industry],
    enabled: Boolean(industry),
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("industries")
        .select("slug, name, description")
        .eq("slug", industry!)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!industry) return;
    setBusy(true);
    const { error } = await supabase.rpc("bootstrap_organization", {
      _org_name: orgName,
      _full_name: fullName,
      _currency: currency,
      _tax_rate: Number(taxRate) || 0,
      _industry_slug: industry,
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
          <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-muted-foreground">النشاط المختار</div>
              <div className="truncate text-sm font-bold">
                {industryQuery.data?.name ?? industry ?? "…"}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/select-industry" })}
            >
              تغيير
            </Button>
          </div>
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
            <Button className="w-full" disabled={busy || !industry}>
              {busy ? "جارٍ الإنشاء..." : "إنشاء المتجر"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
