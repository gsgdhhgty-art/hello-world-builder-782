import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { streamResponseText } from "./ai-gateway.server";

const inputSchema = z.object({
  question: z.string().trim().min(3).max(800),
  days: z.number().int().min(1).max(365).default(30),
});

export const askStoreAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const { data: rawPermissions, error: permissionError } = await sb.rpc("my_permissions");
    if (permissionError) throw new Error("تعذر التحقق من صلاحية التقارير");
    const permissions =
      rawPermissions && typeof rawPermissions === "object" && !Array.isArray(rawPermissions)
        ? (rawPermissions as Record<string, unknown>)
        : {};
    if (!permissions["*"] && !permissions["reports.view"])
      throw new Error("لا تملك صلاحية استخدام المحلل الذكي");

    const [org, sales, items, products, stock, expenses] = await Promise.all([
      sb.from("organizations").select("name, currency, tax_enabled, tax_rate").limit(1).maybeSingle(),
      sb
        .from("sales")
        .select("created_at, total, subtotal, discount, tax, cost_total, payment_method, status")
        .gte("created_at", since)
        .limit(5000),
      sb
        .from("sale_items")
        .select("product_name, quantity, line_total, unit_cost, created_at")
        .gte("created_at", since)
        .limit(10000),
      sb.from("products").select("id, name, price, cost, reorder_level, is_active").limit(2000),
      sb.from("inventory").select("product_id, quantity").limit(5000),
      sb.from("expenses").select("amount, created_at").gte("created_at", since).limit(2000),
    ]);
    if (
      org.error ||
      sales.error ||
      items.error ||
      products.error ||
      stock.error ||
      expenses.error
    )
      throw new Error("تعذر تجهيز بيانات التحليل");

    const mayViewProfit = Boolean(permissions["*"] || permissions["profit.view"]);

    const done = (sales.data ?? []).filter((s) => s.status !== "VOID");
    const revenue = done.reduce((a, s) => a + Number(s.total), 0);
    const cost = done.reduce((a, s) => a + Number(s.cost_total ?? 0), 0);
    const byDay: Record<string, { sales: number; count: number }> = {};
    const byPay: Record<string, number> = {};
    for (const s of done) {
      const d = s.created_at.slice(0, 10);
      byDay[d] ??= { sales: 0, count: 0 };
      byDay[d].sales += Number(s.total);
      byDay[d].count++;
      byPay[s.payment_method] = (byPay[s.payment_method] ?? 0) + Number(s.total);
    }
    const byProduct: Record<string, { qty: number; revenue: number; cost: number }> = {};
    for (const i of items.data ?? []) {
      const p = (byProduct[i.product_name] ??= { qty: 0, revenue: 0, cost: 0 });
      p.qty += Number(i.quantity);
      p.revenue += Number(i.line_total);
      p.cost += Number(i.unit_cost ?? 0) * Number(i.quantity);
    }
    const top = Object.entries(byProduct)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 25)
      .map(([name, v]) => ({ name, ...v, profit: v.revenue - v.cost }));
    const qty: Record<string, number> = {};
    for (const r of stock.data ?? []) qty[r.product_id] = (qty[r.product_id] ?? 0) + Number(r.quantity);
    const active = (products.data ?? []).filter((p) => p.is_active);
    const soldNames = new Set(Object.keys(byProduct));
    const lowStock = active
      .filter((p) => (qty[p.id] ?? 0) <= Number(p.reorder_level))
      .slice(0, 40)
      .map((p) => ({ name: p.name, qty: qty[p.id] ?? 0, reorder: p.reorder_level }));
    const deadStock = active
      .filter((p) => !soldNames.has(p.name) && (qty[p.id] ?? 0) > 0)
      .slice(0, 30)
      .map((p) => ({ name: p.name, qty: qty[p.id], value: (qty[p.id] ?? 0) * Number(p.cost) }));

    const snapshot = {
      store: org.data?.name,
      currency: org.data?.currency ?? "EGP",
      tax: org.data?.tax_enabled ? `${org.data.tax_rate}%` : "متوقفة",
      periodDays: data.days,
      invoices: done.length,
      revenue,
      ...(mayViewProfit ? { grossProfit: revenue - cost } : {}),
      avgTicket: done.length ? revenue / done.length : 0,
      expenses: (expenses.data ?? []).reduce((a, e) => a + Number(e.amount), 0),
      byDay,
      byPaymentMethod: byPay,
      topProducts: top.map((product) =>
        mayViewProfit
          ? product
          : { name: product.name, qty: product.qty, revenue: product.revenue },
      ),
      lowStock,
      deadStock,
      productCount: active.length,
    };

    const answer = await streamResponseText([
      {
        role: "system",
        content:
          "أنت محلل أعمال لمتجر تجزئة. أجب بالعربية بوضوح وإيجاز باستخدام Markdown (عناوين قصيرة، نقاط، أرقام بالعملة). اعتمد فقط على البيانات المرسلة ولا تخترع أرقامًا؛ إذا كانت البيانات غير كافية قل ذلك. اختم بتوصيات عملية مرقمة (حتى 5).",
      },
      {
        role: "user",
        content: `السؤال: ${data.question}\n\nبيانات المتجر:\n${JSON.stringify(snapshot)}`,
      },
    ]);
    return {
      answer: answer || "لم يتمكن المحلل من إنتاج إجابة، أعد صياغة السؤال.",
      stats: {
        invoices: done.length,
        revenue,
        grossProfit: mayViewProfit ? revenue - cost : null,
        lowStock: lowStock.length,
        currency: snapshot.currency,
      },
    };
  });
