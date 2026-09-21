import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ request: z.string().trim().min(3).max(500) });

type Suggestion = { productId: string; reason: string };

export const suggestCatalogProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: products, error } = await context.supabase
      .from("products")
      .select("id, name, description, price, unit, category:categories(name), brand:brands(name)")
      .eq("is_active", true)
      .limit(300);
    if (error) throw error;
    if (!products?.length) return [] as Suggestion[];

    const apiKey = process.env["LOVABLE_API_KEY"]!;
    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [
          {
            role: "system",
            content:
              'أنت مساعد مبيعات. اختر حتى 6 منتجات مناسبة فقط من الكتالوج المرسل. أعد JSON فقط بالشكل {"suggestions":[{"productId":"uuid","reason":"سبب عربي موجز"}]}. لا تختر أي معرف غير موجود.',
          },
          {
            role: "user",
            content: JSON.stringify({ customerRequest: data.request, catalog: products }),
          },
        ],
        text: { format: { type: "json_object" } },
      }),
    });
    if (!response.ok) throw new Error("تعذر الحصول على اقتراحات الآن");
    const result = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const raw =
      result.output_text ??
      result.output
        ?.flatMap((item) => item.content ?? [])
        .map((item) => item.text ?? "")
        .join("") ??
      "{}";
    const parsed = JSON.parse(raw) as { suggestions?: Suggestion[] };
    const validIds = new Set(products.map((product) => product.id));
    return (parsed.suggestions ?? [])
      .filter((item) => validIds.has(item.productId) && typeof item.reason === "string")
      .slice(0, 6);
  });
