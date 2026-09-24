import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { BarChart3, Boxes, Lightbulb, LoaderCircle, ReceiptText, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { askStoreAnalyst } from "@/lib/ai-analyst.functions";
import { money, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ai-analyst")({
  head: () => ({
    meta: [
      { title: "المحلل الذكي — SmartPOS" },
      { name: "description", content: "تحليل ذكي وآمن لمبيعات المتجر ومخزونه." },
      { property: "og:title", content: "المحلل الذكي — SmartPOS" },
      { property: "og:description", content: "إجابات وتوصيات عملية مبنية على بيانات المتجر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiAnalystPage,
});

const QUICK_QUESTIONS = [
  "ما أكثر المنتجات مبيعًا وما الذي يجب أن أركز عليه؟",
  "ما المنتجات منخفضة المخزون التي تحتاج إعادة طلب؟",
  "حلل أداء المبيعات واقترح خطوات عملية لتحسينه.",
  "ما المنتجات الراكدة التي تربط جزءًا من رأس المال؟",
];

type AnalystResult = Awaited<ReturnType<typeof askStoreAnalyst>>;

function AiAnalystPage() {
  const { can, org } = useAuth();
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState("30");
  const callAnalyst = useServerFn(askStoreAnalyst);
  const analysis = useMutation<AnalystResult, Error>({
    mutationFn: () => callAnalyst({ data: { question: question.trim(), days: Number(days) } }),
    onError: (error) => toast.error(error.message || "تعذر إكمال التحليل الآن"),
  });

  if (!can("reports.view"))
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية استخدام المحلل الذكي.</div>;

  const run = (suggestedQuestion?: string) => {
    const nextQuestion = suggestedQuestion ?? question.trim();
    if (nextQuestion.length < 3) return;
    if (suggestedQuestion) setQuestion(suggestedQuestion);
    analysis.mutate();
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="المحلل الذكي"
        description="اسأل عن المبيعات والمخزون واحصل على قراءة عملية من بيانات متجرك"
      />
      <div className="page-canvas space-y-5">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="size-5 text-primary" /> اسأل عن أداء المتجر
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={5}
                maxLength={800}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="مثال: قارن أداء آخر 30 يومًا وحدد المنتجات التي تحتاج إعادة طلب"
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") run();
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="w-full sm:w-44" aria-label="فترة التحليل">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">آخر 7 أيام</SelectItem>
                    <SelectItem value="30">آخر 30 يومًا</SelectItem>
                    <SelectItem value="90">آخر 90 يومًا</SelectItem>
                    <SelectItem value="365">آخر سنة</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="w-full sm:w-auto"
                  disabled={question.trim().length < 3 || analysis.isPending}
                  onClick={() => run()}
                >
                  {analysis.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}
                  {analysis.isPending ? "جارٍ تحليل البيانات..." : "تحليل السؤال"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="size-5 text-warning" /> أسئلة مقترحة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {QUICK_QUESTIONS.map((item) => (
                <Button
                  key={item}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal py-3 text-start leading-6"
                  disabled={analysis.isPending}
                  onClick={() => run(item)}
                >
                  {item}
                </Button>
              ))}
            </CardContent>
          </Card>
        </section>

        {analysis.data ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={ReceiptText} label="الفواتير" value={num(analysis.data.stats.invoices)} />
              <Metric icon={BarChart3} label="المبيعات" value={money(analysis.data.stats.revenue, analysis.data.stats.currency)} />
              {analysis.data.stats.grossProfit != null ? (
                <Metric icon={Sparkles} label="الربح الإجمالي" value={money(analysis.data.stats.grossProfit, analysis.data.stats.currency)} />
              ) : null}
              <Metric icon={Boxes} label="تنبيهات المخزون" value={num(analysis.data.stats.lowStock)} />
            </section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="size-5 text-primary" /> نتيجة التحليل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm leading-8 text-foreground sm:text-base">
                  {analysis.data.answer}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="surface-card flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <Sparkles className="size-10 text-primary/60" />
            <p className="max-w-md">اختر سؤالًا مقترحًا أو اكتب سؤالك لتحليل بيانات {org?.name ?? "المتجر"}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-28 items-center gap-4 pt-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-black">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}