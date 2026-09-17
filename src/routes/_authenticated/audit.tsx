import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "سجل التدقيق — كاشير كلاود" },
      {
        name: "description",
        content: "سجل كل العمليات الحساسة: المبيعات، المرتجعات، الورديات والحسابات.",
      },
      { property: "og:title", content: "سجل التدقيق — كاشير كلاود" },
      { property: "og:description", content: "تتبع كل عملية داخل المتجر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

const ACTION_LABELS: Record<string, string> = {
  ORG_CREATED: "إنشاء المتجر",
  SALE_CREATED: "فاتورة بيع",
  SALE_RETURNED: "مرتجع",
  PURCHASE_RECEIVED: "استلام مشتريات",
  SHIFT_CLOSED: "إغلاق وردية",
  STAFF_CREATED: "إضافة موظف",
  STAFF_PASSWORD_RESET: "تغيير كلمة مرور موظف",
};

function AuditPage() {
  const { permissions } = useAuth();
  const isAdmin = Boolean(permissions["*"]);

  const logs = useQuery({
    queryKey: ["audit"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, details, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staff = useQuery({
    queryKey: ["staff-lite"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        سجل التدقيق للمالك والمسؤولين فقط.
      </div>
    );
  }

  const nameOf = (id: string | null) => staff.data?.find((s) => s.id === id)?.full_name ?? "—";

  return (
    <div>
      <PageHeader title="سجل التدقيق" description="كل عملية حساسة مسجلة بالوقت والمستخدم." />
      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العملية</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>التفاصيل</TableHead>
                <TableHead>الوقت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {ACTION_LABELS[l.action] ?? l.action}
                  </TableCell>
                  <TableCell>{nameOf(l.user_id)}</TableCell>
                  <TableCell
                    className="max-w-[320px] truncate text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {JSON.stringify(l.details)}
                  </TableCell>
                  <TableCell>{dateTime(l.created_at)}</TableCell>
                </TableRow>
              ))}
              {!logs.data?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    لا توجد عمليات بعد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
