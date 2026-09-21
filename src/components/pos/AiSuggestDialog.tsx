import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Plus, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { suggestCatalogProducts } from "@/lib/ai-suggest.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";

type Product = { id: string; name: string; price: number };

export function AiSuggestDialog({ open, onOpenChange, products, currency, online, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  currency: string;
  online: boolean;
  onAdd: (productId: string) => void;
}) {
  const [request, setRequest] = useState("");
  const callSuggest = useServerFn(suggestCatalogProducts);
  const suggestion = useMutation({
    mutationFn: () => callSuggest({ data: { request } }),
    onError: (error: Error) => toast.error(error.message || "تعذر الحصول على اقتراحات"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /> اقتراح منتجات للعميل</DialogTitle>
          <DialogDescription>اكتب طلب العميل كما وصفه، وستظهر أنسب المنتجات المتوفرة في الكتالوج.</DialogDescription>
        </DialogHeader>
        {!online ? (
          <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-4 text-sm text-warning"><WifiOff className="size-5" /> الاقتراحات الذكية تحتاج اتصالًا بالإنترنت.</div>
        ) : (
          <>
            <Textarea rows={4} maxLength={500} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="مثال: العميل يريد مشروبًا باردًا بدون سكر ووجبة خفيفة..." />
            <div className="space-y-2">
              {(suggestion.data ?? []).map((item) => {
                const product = products.find((candidate) => candidate.id === item.productId);
                if (!product) return null;
                return <div key={item.productId} className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><div className="font-bold">{product.name}</div><div className="text-xs text-muted-foreground">{item.reason}</div></div><div className="shrink-0 text-sm font-bold">{money(product.price, currency)}</div><Button size="icon" variant="outline" aria-label={`إضافة ${product.name}`} onClick={() => onAdd(product.id)}><Plus /></Button></div>;
              })}
              {suggestion.isSuccess && !suggestion.data.length ? <p className="py-4 text-center text-sm text-muted-foreground">لم نجد منتجات مطابقة كفاية.</p> : null}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          {online ? <Button disabled={request.trim().length < 3 || suggestion.isPending} onClick={() => suggestion.mutate()}><Sparkles /> {suggestion.isPending ? "جارٍ الاقتراح..." : "اقترح المنتجات"}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}