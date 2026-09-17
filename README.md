# كاشير كلاود — نظام نقاط بيع سحابي متعدد الفروع

نظام SaaS كامل لنقاط البيع وإدارة المتاجر: كاشير سريع، مخزون لحظي، ورديات وخزنة،
مشتريات، مصروفات، تقارير أرباح، أدوار وصلاحيات دقيقة، وسجل تدقيق — بواجهة عربية RTL.

## البنية التقنية

- **الواجهة:** React 19 + TypeScript (صارم) + Vite 7 + TanStack Start/Router + Tailwind CSS v4 + shadcn/ui + Lucide
- **الخادم:** TanStack server functions (Cloudflare Workers runtime)
- **قاعدة البيانات والمصادقة:** PostgreSQL + Supabase Auth + Row Level Security
- **حالة البيانات:** TanStack Query

## القواعد الأمنية الأساسية

1. **عزل المستأجرين:** كل جدول يحمل `org_id`، وكل سياسة RLS تقيّد الصفوف بـ `current_org_id()`.
2. **الصلاحيات من جانب الخادم فقط:** الواجهة تُخفي الأزرار للراحة، لكن القرار يتخذه
   `has_perm()` داخل سياسات RLS ودوال `SECURITY DEFINER`.
3. **لا تثق بمدخلات العميل:** الأسعار والتكاليف والضرائب والإجماليات تُحسب داخل
   `create_sale()` / `create_return()` / `receive_purchase()` من بيانات الجدول، وليس من الطلب.
4. **لا أسرار في الكود:** المفاتيح تُقرأ من متغيرات البيئة وGitHub Secrets. ملفات
   `.env*` خارج Git (ما عدا `.env.example`).

## الأدوار

| الدور | الوصف |
| --- | --- |
| OWNER | مالك المؤسسة، كل الصلاحيات |
| ADMIN | مسؤول، كل الصلاحيات |
| MANAGER | مدير فرع: بيع، مرتجعات، مخزون، تقارير |
| CASHIER | بيع، ورديته، عملاء |
| INVENTORY_MANAGER | منتجات، مخزون، مشتريات |
| ACCOUNTANT | تقارير، أرباح، مصروفات |

يمكن كذلك إنشاء **أدوار مخصصة** بصلاحيات مفصّلة (jsonb) وربطها بأي موظف.

## التشغيل محليًا

```bash
bun install
cp .env.example .env.local   # ثم املأ القيم
bun run dev
```

## الأوامر

```bash
bun run dev        # تشغيل التطوير
bun run build      # بناء الإنتاج
bun run lint       # فحص الأسلوب
bunx tsc --noEmit  # فحص الأنواع
bunx vitest run    # الاختبارات
```

## هيكل المشروع

```
src/
  routes/                 # المسارات (TanStack Router)
    index.tsx             # صفحة التعريف
    auth.tsx              # تسجيل الدخول وإنشاء متجر
    _authenticated/       # كل الصفحات المحمية (POS، منتجات، تقارير...)
  components/AppShell.tsx # الهيكل والقائمة الجانبية
  hooks/useAuth.tsx       # الجلسة + الملف + الصلاحيات
  lib/                    # التنسيقات ودوال الخادم
  integrations/supabase/  # عملاء قاعدة البيانات (مُولّدة)
supabase/migrations/      # كل تغييرات قاعدة البيانات
.github/workflows/        # CI، الأمان، النشر
```

## النشر

- كل Pull Request يمر بـ install → typecheck → lint → tests → build.
- الدمج في `main` يشغّل `deploy-production`.
- المفاتيح تُضاف في GitHub → Settings → Secrets and variables → Actions.

راجع [CONTRIBUTING.md](./CONTRIBUTING.md) و[SECURITY.md](./SECURITY.md).
