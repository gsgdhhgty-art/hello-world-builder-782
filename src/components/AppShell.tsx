import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { OfflineProvider } from "@/hooks/useOffline";
import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; perm?: string }[] = [
  { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, perm: "reports.view" },
  { to: "/pos", label: "الكاشير", icon: ScanBarcode, perm: "sales.create" },
  { to: "/sales", label: "الفواتير", icon: Receipt },
  { to: "/products", label: "المنتجات", icon: Package, perm: "products.view" },
  { to: "/inventory", label: "المخزون", icon: Boxes, perm: "inventory.view" },
  { to: "/purchases", label: "المشتريات", icon: ShoppingCart, perm: "purchases.manage" },
  { to: "/customers", label: "العملاء", icon: Users, perm: "customers.manage" },
  { to: "/suppliers", label: "الموردون", icon: Truck, perm: "suppliers.manage" },
  { to: "/expenses", label: "المصروفات", icon: Wallet, perm: "expenses.manage" },
  { to: "/shifts", label: "الورديات", icon: Clock },
  { to: "/reports", label: "التقارير", icon: BarChart3, perm: "reports.view" },
  { to: "/employees", label: "الموظفون", icon: Users, perm: "*" },
  { to: "/settings", label: "الإعدادات", icon: Building2, perm: "*" },
  { to: "/audit", label: "سجل التدقيق", icon: ClipboardList, perm: "*" },
];

export function AppShell() {
  return (
    <OfflineProvider>
      <AppShellInner />
    </OfflineProvider>
  );
}

function AppShellInner() {
  const { profile, org, loading, can, signOut, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onOnboarding = location.pathname.startsWith("/onboarding");

  useEffect(() => {
    if (loading) return;
    if (!profile?.org_id && !onOnboarding) {
      navigate({ to: "/onboarding", replace: true });
    }
    if (profile?.org_id && onOnboarding) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, profile, onOnboarding, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        جارٍ التحميل...
      </div>
    );
  }

  if (onOnboarding || !profile?.org_id) {
    return (
      <main className="min-h-screen bg-secondary/40">
        <Outlet />
      </main>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="grid min-h-screen place-items-center gap-4 bg-background p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">حسابك موقوف</h1>
          <p className="mt-2 text-muted-foreground">تواصل مع مدير المتجر لتفعيل حسابك.</p>
          <Button className="mt-4" variant="outline" onClick={() => void signOut()}>
            خروج
          </Button>
        </div>
      </div>
    );
  }

  const items = NAV.filter((i) => !i.perm || (i.perm === "*" ? permissions["*"] : can(i.perm)));

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-5 text-lg font-extrabold">
          <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            ك
          </span>
          <span className="truncate">{org?.name ?? "كاشير كلاود"}</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-sm">
          <div className="truncate font-semibold">{profile.full_name}</div>
          <div className="text-xs opacity-70">{ROLE_LABELS[profile.role] ?? profile.role}</div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-4" /> تسجيل الخروج
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs",
                location.pathname === item.to
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void handleSignOut()}>
            <LogOut className="size-4" />
          </Button>
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-background px-6 py-5">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
