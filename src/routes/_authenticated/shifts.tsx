import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { dateTime, money } from "@/lib/format";
import { localFirst } from "@/lib/offline/local-first";
import {
  closeLocalShift,
  enqueue,
  isNetworkFailure,
  isOnline,
  REQUEST_TIMEOUT_MS,
} from "@/lib/offline/sync";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({
    meta: [
      { title: "الورديات — كاشير كلاود" },
      { name: "description", content: "فتح وإغلاق ورديات الكاشير ومطابقة النقدية." },
      { property: "og:title", content: "الورديات — كاشير كلاود" },
      { property: "og:description", content: "إدارة ورديات الصندوق والنقدية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const [closingCash, setClosingCash] = useState("");
  const [note, setNote] = useState("");

  const shifts = useQuery({
    queryKey: ["shifts"],
    queryFn: () =>
      localFirst("shifts", async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select(
          "id, user_id, opening_cash, closing_cash, expected_cash, status, opened_at, closed_at, note",
        )
        .order("opened_at", { ascending: false })
        .limit(100);
        if (error) throw error;
        return data ?? [];
      }),
  });

  const staff = useQuery({
    queryKey: ["staff-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const open = shifts.data?.find((s) => s.status === "OPEN");

  const close = useMutation({
    mutationFn: async (shiftId: string) => {
      const cash = Number(closingCash) || 0;

      // بدون إنترنت: نغلق محليًا ونضع الإغلاق في قائمة المزامنة
      async function closeOffline() {
        await closeLocalShift(shiftId, cash, note || null);
        const txn = crypto.randomUUID();
        await enqueue(
          "shift_close",
          "UPDATE",
          { closing_cash: cash, note: note || null, client_txn_id: txn },
          { entity_id: shiftId, idempotency_key: txn },
        );
        return null;
      }

      if (!isOnline()) return closeOffline();
      try {
        const { data, error } = await supabase
          .rpc("close_shift", {
            _shift_id: shiftId,
            _closing_cash: cash,
            ...(note ? { _note: note } : {}),
          })
          .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
        if (error) throw error;
        return data as { expected_cash: number; difference: number };
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (isNetworkFailure(message)) return closeOffline();
        throw e;
      }
    },
    onSuccess: (data) => {
      if (!data) toast.success("تم إغلاق الوردية محليًا — سترسل تلقائيًا عند عودة الإنترنت");
      else
        toast.success(
          `تم إغلاق الوردية — المتوقع ${money(data.expected_cash, currency)} والفرق ${money(data.difference, currency)}`,
        );
      setClosingCash("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["shifts"] });
      void qc.invalidateQueries({ queryKey: ["open-shift"] });
    },
    onError: () => toast.error("تعذر إغلاق الوردية"),
  });

  const nameOf = (id: string) => staff.data?.find((s) => s.id === id)?.full_name ?? "—";

  return (
    <div>
      <PageHeader title="الورديات" description="فتح وإغلاق الصندوق ومطابقة النقدية." />
      <div className="space-y-6 p-6">
        {open && can("shift.close") && (
          <Card>
            <CardHeader>
              <CardTitle>إغلاق الوردية الحالية</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>النقدية الافتتاحية</Label>
                <Input value={money(open.opening_cash, currency)} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closing">النقدية المعدودة</Label>
                <Input
                  id="closing"
                  type="number"
                  step="0.01"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">ملاحظة</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button
                className="sm:col-span-3"
                disabled={close.isPending}
                onClick={() => close.mutate(open.id)}
              >
                إغلاق الوردية
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>سجل الورديات</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الفتح</TableHead>
                  <TableHead>الإغلاق</TableHead>
                  <TableHead>افتتاحية</TableHead>
                  <TableHead>المتوقع</TableHead>
                  <TableHead>المعدود</TableHead>
                  <TableHead>الفرق</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(shifts.data ?? []).map((s) => {
                  const diff =
                    s.closing_cash != null && s.expected_cash != null
                      ? Number(s.closing_cash) - Number(s.expected_cash)
                      : null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{nameOf(s.user_id)}</TableCell>
                      <TableCell>{dateTime(s.opened_at)}</TableCell>
                      <TableCell>{dateTime(s.closed_at)}</TableCell>
                      <TableCell>{money(s.opening_cash, currency)}</TableCell>
                      <TableCell>
                        {s.expected_cash == null ? "—" : money(s.expected_cash, currency)}
                      </TableCell>
                      <TableCell>
                        {s.closing_cash == null ? "—" : money(s.closing_cash, currency)}
                      </TableCell>
                      <TableCell className={diff && diff < 0 ? "text-destructive" : ""}>
                        {diff == null ? "—" : money(diff, currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "OPEN" ? "default" : "secondary"}>
                          {s.status === "OPEN" ? "مفتوحة" : "مغلقة"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!shifts.data?.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      لا توجد ورديات بعد.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
