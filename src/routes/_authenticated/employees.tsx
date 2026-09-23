import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createStaff, resetStaffPassword } from "@/lib/staff.functions";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { dateTime, ROLE_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "الموظفون — SmartPOS" },
      {
        name: "description",
        content: "إضافة موظفين، تحديد الأدوار والصلاحيات وتفعيل أو إيقاف الحسابات.",
      },
      { property: "og:title", content: "الموظفون — SmartPOS" },
      { property: "og:description", content: "إدارة فريق المتجر وصلاحياتهم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmployeesPage,
});

const ROLE_OPTIONS = ["ADMIN", "MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT"] as const;

function EmployeesPage() {
  const { profile, permissions } = useAuth();
  const isAdmin = Boolean(permissions["*"]);
  const qc = useQueryClient();
  const createStaffFn = useServerFn(createStaff);
  const resetPasswordFn = useServerFn(resetStaffPassword);

  const [open, setOpen] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "CASHIER" as (typeof ROLE_OPTIONS)[number],
    branchId: "none",
    employeeCode: "",
    customRoleId: "none",
  });

  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, employee_code, branch_id, custom_role_id, is_active, last_login_at",
        )
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const customRoles = useQuery({
    queryKey: ["custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      createStaffFn({
        data: {
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          branchId: form.branchId === "none" ? null : form.branchId,
          employeeCode: form.employeeCode.trim() || undefined,
          customRoleId: form.customRoleId === "none" ? null : form.customRoleId,
        },
      }),
    onSuccess: () => {
      toast.success("تم إنشاء حساب الموظف");
      setOpen(false);
      setForm({ ...form, email: "", password: "", fullName: "", employeeCode: "" });
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("forbidden")
          ? "لا تملك صلاحية إضافة موظفين"
          : e.message.includes("already")
            ? "البريد مستخدم بالفعل"
            : "تعذر إنشاء الحساب",
      ),
  });

  const update = useMutation({
    mutationFn: async (payload: {
      id: string;
      role?: (typeof ROLE_OPTIONS)[number];
      branch_id?: string | null;
      custom_role_id?: string | null;
      is_active?: boolean;
    }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("profiles").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم التحديث");
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: () => toast.error("تعذر التحديث"),
  });

  const resetPass = useMutation({
    mutationFn: async () => resetPasswordFn({ data: { userId: resetFor!, password: newPassword } }),
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور");
      setResetFor(null);
      setNewPassword("");
    },
    onError: () => toast.error("تعذر تغيير كلمة المرور"),
  });

  if (!isAdmin) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        هذه الصفحة للمالك والمسؤولين فقط.
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="الموظفون" description="الأدوار والصلاحيات وحسابات الدخول.">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> موظف جديد
        </Button>
      </PageHeader>

      <div className="page-canvas">
        <div className="data-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>دور مخصص</TableHead>
                <TableHead>آخر دخول</TableHead>
                <TableHead>نشط</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(staff.data ?? []).map((s) => {
                const self = s.id === profile?.id;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.full_name}
                      {self && (
                        <Badge className="ms-2" variant="secondary">
                          أنت
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.role === "OWNER" || self ? (
                        (ROLE_LABELS[s.role] ?? s.role)
                      ) : (
                        <Select
                          value={s.role}
                          onValueChange={(v) =>
                            update.mutate({ id: s.id, role: v as (typeof ROLE_OPTIONS)[number] })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.branch_id ?? "none"}
                        onValueChange={(v) =>
                          update.mutate({ id: s.id, branch_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون فرع</SelectItem>
                          {(branches.data ?? []).map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.custom_role_id ?? "none"}
                        onValueChange={(v) =>
                          update.mutate({ id: s.id, custom_role_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">الافتراضي</SelectItem>
                          {(customRoles.data ?? []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{dateTime(s.last_login_at)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={s.is_active}
                        disabled={self || s.role === "OWNER"}
                        onCheckedChange={(v) => update.mutate({ id: s.id, is_active: v })}
                      />
                    </TableCell>
                    <TableCell className="text-end">
                      {!self && (
                        <Button size="sm" variant="ghost" onClick={() => setResetFor(s.id)}>
                          <KeyRound className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>موظف جديد</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="f-name">الاسم بالكامل</Label>
              <Input
                id="f-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-email">البريد الإلكتروني</Label>
              <Input
                id="f-email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-pass">كلمة المرور</Label>
              <Input
                id="f-pass"
                dir="ltr"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({ ...form, role: v as (typeof ROLE_OPTIONS)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفرع</Label>
              <Select
                value={form.branchId}
                onValueChange={(v) => setForm({ ...form, branchId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون فرع</SelectItem>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-code">رقم الموظف</Label>
              <Input
                id="f-code"
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>دور مخصص</Label>
              <Select
                value={form.customRoleId}
                onValueChange={(v) => setForm({ ...form, customRoleId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">الافتراضي للدور</SelectItem>
                  {(customRoles.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={
                create.isPending ||
                !form.fullName.trim() ||
                !form.email.trim() ||
                form.password.length < 6
              }
              onClick={() => create.mutate()}
            >
              إنشاء الحساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetFor)} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="np">كلمة المرور الجديدة</Label>
            <Input
              id="np"
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>
              إلغاء
            </Button>
            <Button
              disabled={newPassword.length < 6 || resetPass.isPending}
              onClick={() => resetPass.mutate()}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
