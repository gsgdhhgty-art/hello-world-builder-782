import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  Building2,
  ChevronLeft,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { OfflineProvider } from "@/hooks/useOffline";
import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; perm?: string };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "البيع",
    items: [
      { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, perm: "reports.view" },
      { to: "/pos", label: "الكاشير", icon: ScanBarcode, perm: "sales.create" },
      { to: "/sales", label: "الفواتير", icon: Receipt },
      { to: "/returns", label: "المرتجعات", icon: RotateCcw, perm: "sales.refund" },
      { to: "/shifts", label: "الورديات", icon: Clock },
    ],
  },
  {
    title: "المخزون والشراء",
    items: [
      { to: "/products", label: "المنتجات", icon: Package, perm: "products.view" },
      { to: "/inventory", label: "المخزون", icon: Boxes, perm: "inventory.view" },
      { to: "/purchases", label: "المشتريات", icon: ShoppingCart, perm: "purchases.manage" },
      { to: "/suppliers", label: "الموردون", icon: Truck, perm: "suppliers.manage" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { to: "/customers", label: "العملاء", icon: Users, perm: "customers.manage" },
      { to: "/expenses", label: "المصروفات", icon: Wallet, perm: "expenses.manage" },
      { to: "/reports", label: "التقارير", icon: BarChart3, perm: "reports.view" },
      { to: "/employees", label: "الموظفون", icon: Users, perm: "*" },
      { to: "/settings", label: "الإعدادات", icon: Building2, perm: "*" },
      { to: "/sync", label: "المزامنة", icon: RefreshCw },
      { to: "/audit", label: "سجل التدقيق", icon: ClipboardList, perm: "*" },
    ],
  },
];

export function AppShell() {
  return (
    <OfflineProvider>
      <AppShellInner />
    </OfflineProvider>
  );
}

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("kashir_theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("kashir_theme", next ? "dark" : "light");
  }
  return { dark, toggle };
}

function AppShellInner() {
  const { profile, org, loading, can, signOut, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <span className="grid size-12 animate-pulse place-items-center rounded-2xl gradient-primary text-xl font-black">
            ك
          </span>
          جارٍ التحميل...
        </div>
      </div>
    );
  }

  if (onOnboarding || !profile?.org_id) {
    return (
      <main className="min-h-screen bg-background">
        <Outlet />
      </main>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div className="surface-card max-w-sm p-8">
          <h1 className="text-xl font-bold">حسابك موقوف</h1>
          <p className="mt-2 text-sm text-muted-foreground">تواصل مع مدير المتجر لتفعيل حسابك.</p>
          <Button className="mt-5 w-full" variant="outline" onClick={() => void signOut()}>
            خروج
          </Button>
        </div>
      </div>
    );
  }

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.perm || (i.perm === "*" ? permissions["*"] : can(i.perm))),
  })).filter((g) => g.items.length);

  const current = groups.flatMap((g) => g.items).find((i) => i.to === location.pathname);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile.full_name || "؟").trim().slice(0, 1);

  const nav = (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl gradient-primary text-lg font-black glow-primary">
          ك
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold text-sidebar-foreground">
            {org?.name ?? "كاشير كلاود"}
          </div>
          <div className="text-[11px] text-sidebar-foreground/60">نظام نقاط البيع</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 scroll-slim">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="px-3 pb-2 text-[10px] font-bold tracking-widest text-sidebar-foreground/45">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                      active
                        ? "bg-sidebar-primary/15 font-bold text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                        active
                          ? "gradient-primary"
                          : "bg-sidebar-accent/60 text-sidebar-foreground/80 group-hover:bg-sidebar-accent",
                      )}
                    >
                      <item.icon className="size-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                    {active ? <ChevronLeft className="ms-auto size-4 opacity-70" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <SyncBadge className="mb-3 w-full justify-center" />
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full gradient-primary text-sm font-bold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-sidebar-foreground">
              {profile.full_name}
            </div>
            <div className="truncate text-[11px] text-sidebar-foreground/60">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="تسجيل الخروج"
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gradient-sidebar text-sidebar-foreground md:flex">
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/85 px-4 py-3 backdrop-blur-md">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="القائمة">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-72 flex-col gap-0 gradient-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              {nav}
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold sm:text-lg">
              {current?.label ?? "كاشير كلاود"}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">{org?.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge className="hidden shrink-0 border bg-secondary text-secondary-foreground sm:flex" />
            <Button variant="outline" size="icon" aria-label="تبديل المظهر" onClick={toggle}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {can("sales.create") ? (
              <Button asChild className="hidden gradient-primary press sm:inline-flex">
                <Link to="/pos">
                  <ScanBarcode className="size-4" /> الكاشير
                </Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="حسابي"
                  className="grid size-9 shrink-0 place-items-center rounded-full gradient-primary text-sm font-bold"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="truncate">{profile.full_name}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {ROLE_LABELS[profile.role] ?? profile.role}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleSignOut()}>
                  <LogOut className="size-4" /> تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
    <div className="border-b bg-surface/60 px-4 py-5 sm:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
