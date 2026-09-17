import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "العملاء — كاشير كلاود" },
      { name: "description", content: "سجل العملاء وأرصدة البيع الآجل وبيانات التواصل." },
      { property: "og:title", content: "العملاء — كاشير كلاود" },
      { property: "og:description", content: "إدارة عملاء المتجر وأرصدتهم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomersPage,
});

const EMPTY = { name: "", phone: "", email: "", address: "" };

function CustomersPage() {
  const { org, can, profile } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const editable = can("customers.manage");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, address, balance")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        org_id: profile!.org_id!,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      };
      const q = editingId
        ? supabase.from("customers").update(payload).eq("id", editingId)
        : supabase.from("customers").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["customers-lite"] });
    },
    onError: () => toast.error("تعذر الحفظ"),
  });

  return (
    <div>
      <PageHeader title="العملاء" description="بيانات العملاء وأرصدة الآجل.">
        {editable && (
          <Button
            onClick={() => {
              setEditingId(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> عميل جديد
          </Button>
        )}
      </PageHeader>

      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الجوال</TableHead>
                <TableHead>البريد</TableHead>
                <TableHead>الرصيد المستحق</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(customers.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell dir="ltr">{c.phone ?? "—"}</TableCell>
                  <TableCell dir="ltr">{c.email ?? "—"}</TableCell>
                  <TableCell className={Number(c.balance) > 0 ? "text-destructive" : ""}>
                    {money(c.balance, currency)}
                  </TableCell>
                  <TableCell className="text-end">
                    {editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(c.id);
                          setForm({
                            name: c.name,
                            phone: c.phone ?? "",
                            email: c.email ?? "",
                            address: c.address ?? "",
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!customers.data?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    لا يوجد عملاء بعد.
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
            <DialogTitle>{editingId ? "تعديل عميل" : "عميل جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-name">الاسم</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-phone">الجوال</Label>
              <Input
                id="c-phone"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">البريد</Label>
              <Input
                id="c-email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-address">العنوان</Label>
              <Input
                id="c-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
