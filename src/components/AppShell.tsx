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
  Bell,
  Search,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  ShoppingCart,
  FileInput,
  PanelRightClose,
  PanelRightOpen,
  Truck,
  Users,
  Wallet,
  Tags,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { OfflineProvider } from "@/hooks/useOffline";
import { SyncBadge } from "@/components/SyncBadge";
import { PwaInstallControl } from "@/components/PwaInstallControl";
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; perm?: string };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "البيع",
    items: [
      { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, perm: "reports.view" },
      { to: "/pos", label: "البيع السريع", icon: ScanBarcode, perm: "sales.create" },
      { to: "/sales", label: "الفواتير", icon: Receipt },
      { to: "/returns", label: "المرتجعات", icon: RotateCcw, perm: "sales.refund" },
      { to: "/shifts", label: "الورديات", icon: Clock },
    ],
  },
  {
    title: "المخزون والشراء",
    items: [
      { to: "/products", label: "المنتجات", icon: Package, perm: "products.view" },
      { to: "/catalog", label: "الفئات والعلامات", icon: Tags, perm: "products.view" },
      { to: "/inventory", label: "المخزون", icon: Boxes, perm: "inventory.view" },
      { to: "/purchases", label: "المشتريات", icon: ShoppingCart, perm: "purchases.manage" },
      { to: "/purchase-orders", label: "طلبات الشراء", icon: FileInput, perm: "purchases.manage" },
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

function AppShellInner() {
  const { profile, org, loading, can, signOut, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navigationSearch, setNavigationSearch] = useState("");
  const onOnboarding = location.pathname.startsWith("/onboarding");
  const lowStock = useQuery({
    queryKey: ["header-low-stock", org?.id],
    enabled: Boolean(org?.id && org?.low_stock_alerts_enabled && can("inventory.view")),
    refetchInterval: 60000,
    queryFn: async () => {
      const [productsResult, inventoryResult] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, reorder_level")
          .eq("is_active", true)
          .eq("track_stock", true),
        supabase.from("inventory").select("product_id, quantity"),
      ]);
      if (productsResult.error) throw productsResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      return (productsResult.data ?? [])
        .map((product) => ({
          ...product,
          quantity: (inventoryResult.data ?? [])
            .filter((row) => row.product_id === product.id)
            .reduce((sum, row) => sum + Number(row.quantity), 0),
        }))
        .filter(
          (product) =>
            product.quantity <= Number(product.reorder_level) &&
            (org?.low_stock_include_out_of_stock || product.quantity > 0),
        );
    },
  });

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

  const availableGroups = profile.role === "CASHIER" ? NAV_GROUPS.slice(0, 1) : NAV_GROUPS;
  const groups = availableGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.perm || (i.perm === "*" ? permissions["*"] : can(i.perm))),
    }))
    .filter((g) => g.items.length);

  const current = groups.flatMap((g) => g.items).find((i) => i.to === location.pathname);
  const searchableItems = groups
    .flatMap((group) => group.items)
    .filter((item) => item.label.includes(navigationSearch.trim()));

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile.full_name || "؟").trim().slice(0, 1);

  const nav = (
    <>
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-sidebar-border px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <ScanBarcode className="size-5" />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-base font-black text-sidebar-foreground">
              Smart<span className="text-primary">POS</span>
            </div>
            <div className="truncate text-[10px] font-semibold text-muted-foreground">
              {org?.name ?? "إدارة أسهل، مبيعات أكثر"}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-slim">
        {groups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-extrabold text-sidebar-foreground/45">
                {group.title}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="grid size-7 shrink-0 place-items-center">
                      <item.icon className="size-4" />
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {active && !collapsed ? (
                      <ChevronLeft className="ms-auto size-4 opacity-70" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {!collapsed && <SyncBadge className="mb-2 w-full justify-center" />}
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-2",
            collapsed && "justify-center",
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full gradient-primary text-sm font-bold">
            {initials}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">
                {profile.full_name}
              </div>
              <div className="truncate text-[11px] text-sidebar-foreground/60">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </div>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="تسجيل الخروج"
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card/95 px-3 shadow-xs backdrop-blur-md sm:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="القائمة">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-72 flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              {nav}
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <PanelRightOpen className="size-5" />
            ) : (
              <PanelRightClose className="size-5" />
            )}
          </Button>

          <DropdownMenu
            open={Boolean(navigationSearch.trim())}
            onOpenChange={(open) => !open && setNavigationSearch("")}
          >
            <DropdownMenuTrigger asChild>
              <div className="relative hidden min-w-0 max-w-lg flex-1 lg:block">
                <Search className="pointer-events-none absolute end-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pe-10"
                  placeholder="انتقل إلى صفحة أو وظيفة..."
                  value={navigationSearch}
                  onChange={(event) => setNavigationSearch(event.target.value)}
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>نتائج التنقل</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {searchableItems.slice(0, 8).map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link to={item.to} onClick={() => setNavigationSearch("")}>
                    <item.icon className="size-4" /> {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
              {!searchableItems.length ? (
                <DropdownMenuItem disabled>لا توجد صفحة مطابقة</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="min-w-0 lg:hidden">
            <h2 className="truncate text-base font-extrabold">{current?.label ?? "SmartPOS"}</h2>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge className="hidden shrink-0 border bg-secondary text-secondary-foreground sm:flex" />
            <PwaInstallControl />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="تنبيهات المخزون"
                  className="relative"
                >
                  <Bell className="size-5" />
                  {(lowStock.data?.length ?? 0) > 0 ? (
                    <span className="absolute end-0 top-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {lowStock.data?.length}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>تنبيهات المخزون</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(lowStock.data ?? []).slice(0, 6).map((product) => (
                  <DropdownMenuItem key={product.id} asChild>
                    <Link to="/inventory">
                      <AlertStock name={product.name} quantity={product.quantity} />
                    </Link>
                  </DropdownMenuItem>
                ))}
                {!lowStock.data?.length ? (
                  <DropdownMenuItem disabled>لا توجد أصناف تحتاج لإعادة التوريد</DropdownMenuItem>
                ) : null}
                {(lowStock.data?.length ?? 0) > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/inventory">عرض قائمة إعادة التوريد</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {can("sales.create") ? (
              <Button asChild className="hidden sm:inline-flex">
                <Link to="/pos">
                  <ScanBarcode className="size-4" /> الكاشير
                </Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" aria-label="حسابي" className="rounded-full">
                  {initials}
                </Button>
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

function AlertStock({ name, quantity }: { name: string; quantity: number }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold">{name}</div>
      <div className="text-xs text-muted-foreground">المتوفر: {quantity}</div>
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
    <div className="px-4 pb-4 pt-6 sm:px-6 sm:pt-7">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border pb-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black text-foreground sm:text-[1.65rem]">{title}</h1>
          {description ? (
            <p className="mt-1 truncate text-xs font-medium text-muted-foreground sm:text-sm">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
