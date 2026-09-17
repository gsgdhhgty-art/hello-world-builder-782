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

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "الموردون — كاشير كلاود" },
      { name: "description", content: "بيانات الموردين وأرصدة المستحقات عليهم." },
      { property: "og:title", content: "الموردون — كاشير كلاود" },
      { property: "og:description", content: "إدارة الموردين وأرصدتهم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

const EMPTY = { name: "", phone: "", email: "", address: "" };

function SuppliersPage() {
  const { org, can, profile } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const editable = can("suppliers.manage");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
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
        ? supabase.from("suppliers").update(payload).eq("id", editingId)
        : supabase.from("suppliers").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY });
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: () => toast.error("تعذر الحفظ"),
  });

  if (!editable) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية الموردين.</div>;
  }

  return (
    <div>
      <PageHeader title="الموردون" description="جهات التوريد والمستحقات.">
        <Button
          onClick={() => {
            setEditingId(null);
            setForm({ ...EMPTY });
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> مورد جديد
        </Button>
      </PageHeader>

      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الجوال</TableHead>
                <TableHead>البريد</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(suppliers.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell dir="ltr">{s.phone ?? "—"}</TableCell>
                  <TableCell dir="ltr">{s.email ?? "—"}</TableCell>
                  <TableCell>{money(s.balance, currency)}</TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(s.id);
                        setForm({
                          name: s.name,
                          phone: s.phone ?? "",
                          email: s.email ?? "",
                          address: s.address ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!suppliers.data?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    لا يوجد موردون بعد.
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
            <DialogTitle>{editingId ? "تعديل مورد" : "مورد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-name">الاسم</Label>
              <Input
                id="s-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-phone">الجوال</Label>
              <Input
                id="s-phone"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-email">البريد</Label>
              <Input
                id="s-email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-address">العنوان</Label>
              <Input
                id="s-address"
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
