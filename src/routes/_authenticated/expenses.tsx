import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateTime, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "المصروفات — SmartPOS" },
      { name: "description", content: "تسجيل مصروفات المتجر النقدية وربطها بالوردية." },
      { property: "og:title", content: "المصروفات — SmartPOS" },
      { property: "og:description", content: "متابعة مصروفات التشغيل اليومية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensesPage,
});

const CATEGORIES = [
  { key: "GENERAL", label: "عام" },
  { key: "RENT", label: "إيجار" },
  { key: "SALARY", label: "رواتب" },
  { key: "UTILITIES", label: "كهرباء وماء" },
  { key: "MAINTENANCE", label: "صيانة" },
  { key: "TRANSPORT", label: "نقل" },
];

function ExpensesPage() {
  const { org, can, profile } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("GENERAL");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const expenses = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, category, amount, note, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: shift } = await supabase
        .from("shifts")
        .select("id, branch_id")
        .eq("status", "OPEN")
        .maybeSingle();
      const { error } = await supabase.from("expenses").insert({
        org_id: profile!.org_id!,
        branch_id: shift?.branch_id ?? profile!.branch_id,
        shift_id: shift?.id ?? null,
        category,
        amount: Number(amount) || 0,
        note: note || null,
        user_id: profile!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل المصروف");
      setOpen(false);
      setAmount("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["dash-expenses"] });
    },
    onError: () => toast.error("تعذر تسجيل المصروف"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: () => toast.error("تعذر الحذف"),
  });

  if (!can("expenses.manage")) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية المصروفات.</div>;
  }

  const total = (expenses.data ?? []).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <PageHeader title="المصروفات" description="مصروفات التشغيل المخصومة من الصندوق.">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> مصروف جديد
        </Button>
      </PageHeader>

      <div className="page-canvas space-y-4">
        <div className="workspace-card p-4">
          <span className="text-sm text-muted-foreground">إجمالي المصروفات المعروضة</span>
          <div className="text-2xl font-extrabold tabular-nums">{money(total, currency)}</div>
        </div>

        <div className="data-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>البند</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(expenses.data ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {CATEGORIES.find((c) => c.key === e.category)?.label ?? e.category}
                  </TableCell>
                  <TableCell>{money(e.amount, currency)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.note ?? "—"}</TableCell>
                  <TableCell>{dateTime(e.created_at)}</TableCell>
                  <TableCell className="text-end">
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!expenses.data?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    لا توجد مصروفات بعد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مصروف جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>البند</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">المبلغ</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-note">ملاحظة</Label>
              <Input id="e-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={!Number(amount) || save.isPending} onClick={() => save.mutate()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
