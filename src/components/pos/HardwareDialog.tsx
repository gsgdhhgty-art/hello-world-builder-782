import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isValidHost,
  loadHardware,
  nativeBridge,
  openCashDrawer,
  saveHardware,
  type HardwareSettings,
} from "@/lib/hardware";

export function HardwareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [s, setS] = useState<HardwareSettings>(loadHardware);
  const [printers, setPrinters] = useState<Array<{ name: string; isDefault: boolean }>>([]);
  const native = Boolean(nativeBridge());

  useEffect(() => {
    if (!open) return;
    setS(loadHardware());
    void nativeBridge()?.listPrinters().then(setPrinters).catch(() => setPrinters([]));
  }, [open]);

  const set = <K extends keyof HardwareSettings>(k: K, v: HardwareSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (s.drawerHost && !isValidHost(s.drawerHost)) return toast.error("عنوان الطابعة غير صحيح");
    saveHardware(s);
    toast.success("تم حفظ إعدادات أجهزة هذا الكاشير");
    onOpenChange(false);
  };

  const testDrawer = async () => {
    const res = await openCashDrawer(s);
    if (res.ok) toast.success("تم إرسال أمر فتح الدرج");
    else toast.error(res.error ?? "تعذر فتح الدرج");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>الطابعة ودرج النقد</DialogTitle>
          <DialogDescription>
            {native
              ? "إعدادات خاصة بهذا الجهاز فقط."
              : "في المتصفح تُستخدم نافذة الطباعة العادية. الطباعة الصامتة وفتح الدرج تعمل في تطبيق سطح المكتب."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="hw-auto">طباعة الفاتورة تلقائيًا بعد كل بيع</Label>
            <Switch id="hw-auto" checked={s.autoPrint} onCheckedChange={(v) => set("autoPrint", v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>عرض الورق</Label>
              <div className="flex gap-2">
                {(["58", "80"] as const).map((p) => (
                  <Button key={p} type="button" size="sm" variant={s.paper === p ? "default" : "outline"} onClick={() => set("paper", p)}>
                    {p} مم
                  </Button>
                ))}
              </div>
            </div>
            {native && (
              <div className="grid gap-1.5">
                <Label htmlFor="hw-printer">الطابعة</Label>
                <select
                  id="hw-printer"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={s.printerName}
                  onChange={(e) => set("printerName", e.target.value)}
                >
                  <option value="">الطابعة الافتراضية</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="hw-host">IP طابعة الشبكة المتصل بها الدرج</Label>
              <Input id="hw-host" dir="ltr" placeholder="192.168.1.100" value={s.drawerHost} onChange={(e) => set("drawerHost", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hw-port">المنفذ</Label>
              <Input id="hw-port" dir="ltr" type="number" value={s.drawerPort} onChange={(e) => set("drawerPort", Number(e.target.value) || 9100)} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="hw-cash">فتح الدرج تلقائيًا عند الدفع نقدًا</Label>
            <Switch id="hw-cash" checked={s.openDrawerOnCash} onCheckedChange={(v) => set("openDrawerOnCash", v)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => void testDrawer()} disabled={!native}>تجربة فتح الدرج</Button>
          <Button onClick={save}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
