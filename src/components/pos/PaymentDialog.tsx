import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Plus, Smartphone, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Keypad } from "@/components/pos/Keypad";
import { money } from "@/lib/format";
import { round2 } from "@/lib/pos-math";
import { cn } from "@/lib/utils";

export interface PaymentLine {
  method: string;
  amount: number;
  reference?: string;
}

const METHODS: { key: string; label: string; icon: typeof Banknote }[] = [
  { key: "CASH", label: "نقدًا", icon: Banknote },
  { key: "CARD", label: "بطاقة", icon: CreditCard },
  { key: "WALLET", label: "محفظة", icon: Smartphone },
  { key: "TRANSFER", label: "تحويل", icon: Wallet },
  { key: "CREDIT", label: "آجل", icon: Plus },
];

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  currency,
  customers,
  customerId,
  onCustomerChange,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  currency: string;
  customers: { id: string; name: string }[];
  customerId: string;
  onCustomerChange: (id: string) => void;
  submitting: boolean;
  onConfirm: (payments: PaymentLine[]) => void;
}) {
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) {
      setLines([]);
      setMethod("CASH");
      setAmount("");
    }
  }, [open]);

  const paidLines = useMemo(
    () => round2(lines.filter((l) => l.method !== "CREDIT").reduce((s, l) => s + l.amount, 0)),
    [lines],
  );
  const typed = Number(amount) || 0;
  const paid = round2(paidLines + (method === "CREDIT" ? 0 : typed));
  const remaining = round2(Math.max(total - paid, 0));
  const change = round2(Math.max(paid - total, 0));
  const creditSelected = method === "CREDIT" || lines.some((l) => l.method === "CREDIT");
  const hasCustomer = customerId !== "none";

  const canConfirm =
    total > 0 && (remaining <= 0 || (creditSelected && hasCustomer)) && !submitting;

  const quick = useMemo(() => {
    const base = [50, 100, 200, 500, 1000];
    const need = remaining || total;
    return base.filter((v) => v >= need).slice(0, 4);
  }, [remaining, total]);

  function addLine() {
    if (method === "CREDIT") {
      setLines((prev) => [
        ...prev.filter((l) => l.method !== "CREDIT"),
        { method: "CREDIT", amount: 0 },
      ]);
      setAmount("");
      return;
    }
    if (typed <= 0) return;
    setLines((prev) => [...prev, { method, amount: round2(typed) }]);
    setAmount("");
  }

  function confirm() {
    const finalLines = [...lines];
    if (method !== "CREDIT" && typed > 0) finalLines.push({ method, amount: round2(typed) });
    if (method === "CREDIT" && !finalLines.some((l) => l.method === "CREDIT")) {
      finalLines.push({ method: "CREDIT", amount: 0 });
    }
    if (!finalLines.length) finalLines.push({ method: "CASH", amount: total });
    onConfirm(finalLines);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="text-lg">الدفع</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          {/* summary + methods */}
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground">المطلوب</div>
              <div className="text-3xl font-black text-primary">{money(total, currency)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">المدفوع: </span>
                  <span className="font-bold">{money(paid, currency)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">المتبقي: </span>
                  <span className={cn("font-bold", remaining > 0 && "text-destructive")}>
                    {money(remaining, currency)}
                  </span>
                </div>
                {change > 0 && (
                  <div className="col-span-2 text-emerald-600 dark:text-emerald-400">
                    <span>الباقي للعميل: </span>
                    <span className="font-bold">{money(change, currency)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <Button
                  key={m.key}
                  type="button"
                  variant={method === m.key ? "default" : "outline"}
                  className="h-14 flex-col gap-1 text-xs font-bold"
                  onClick={() => setMethod(m.key)}
                >
                  <m.icon className="size-4" />
                  {m.label}
                </Button>
              ))}
            </div>

            {creditSelected && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">
                  العميل (مطلوب للبيع الآجل)
                </div>
                <Select value={customerId} onValueChange={onCustomerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون عميل</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!hasCustomer && (
                  <p className="text-xs text-destructive">
                    اختر عميلًا لتسجيل المبلغ المتبقي دينًا.
                  </p>
                )}
              </div>
            )}

            {lines.length > 0 && (
              <ul className="space-y-1 rounded-lg border p-2 text-sm">
                {lines.map((l, i) => (
                  <li key={`${l.method}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {METHODS.find((m) => m.key === l.method)?.label ?? l.method}
                    </span>
                    <span className="ms-auto">
                      {l.method === "CREDIT"
                        ? money(remaining, currency)
                        : money(l.amount, currency)}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* keypad */}
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-end text-2xl font-black tabular-nums">
              {amount || "0"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="secondary"
                className="text-xs font-bold"
                onClick={() => setAmount(String(remaining || total))}
              >
                بالضبط
              </Button>
              {quick.map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant="secondary"
                  className="text-xs font-bold"
                  onClick={() => setAmount(String(v))}
                >
                  {v}
                </Button>
              ))}
            </div>
            <Keypad
              value={amount}
              onChange={setAmount}
              confirmLabel="إضافة دفعة"
              onConfirm={addLine}
              confirmDisabled={method !== "CREDIT" && typed <= 0}
            />
          </div>
        </div>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button className="min-w-40 text-base font-bold" disabled={!canConfirm} onClick={confirm}>
            إتمام البيع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
