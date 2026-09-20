import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_IMAGES_BUCKET = "product-images";
const MAX_EDGE = 1400;
const QUALITY = 0.82;

export async function optimizeProductImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة صالحًا");
  if (file.size > 12 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 12 ميجابايت");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز الصورة");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY),
  );
  if (!blob) throw new Error("تعذر ضغط الصورة");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
}

export async function uploadProductImage(orgId: string, productId: string, file: File) {
  const optimized = await optimizeProductImage(file);
  const path = `${orgId}/${productId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, optimized, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return path;
}

export async function removeProductImage(path: string | null | undefined) {
  if (!path || /^https?:\/\//i.test(path)) return;
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  if (error) throw error;
}

export async function resolveProductImage(path: string | null | undefined) {
  if (!path || /^https?:\/\//i.test(path)) return path ?? null;
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) return null;
  return data.signedUrl;
}

export async function resolveProductImages<T extends { image_url: string | null }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({ ...row, image_url: await resolveProductImage(row.image_url) })),
  );
}
