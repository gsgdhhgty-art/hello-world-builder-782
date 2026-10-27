-- ============================================================
-- SmartPOS Multi-Industry SaaS — Foundation
-- industries, platform admins, plans, subscriptions, audit
-- ============================================================

-- 1) Subscription status enum
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('TRIAL','ACTIVE','EXPIRED','SUSPENDED','CANCELLED','PENDING_PAYMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Platform admins (owner/developer of the platform)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;

DROP POLICY IF EXISTS "platform admins read own" ON public.platform_admins;
CREATE POLICY "platform admins read own" ON public.platform_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_platform_admin());

-- 3) Industries (dynamic, platform-managed)
CREATE TABLE IF NOT EXISTS public.industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'store',
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  features text[] NOT NULL DEFAULT '{}',
  requires_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.industries TO anon, authenticated;
GRANT ALL ON public.industries TO service_role;
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "industries public read" ON public.industries;
CREATE POLICY "industries public read" ON public.industries
  FOR SELECT TO anon, authenticated
  USING ((is_active AND is_public) OR public.has_platform_admin());

DROP TRIGGER IF EXISTS set_industries_updated_at ON public.industries;
CREATE TRIGGER set_industries_updated_at BEFORE UPDATE ON public.industries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Subscription plans (definitions are immutable snapshots once subscribed)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EGP',
  duration_days integer NOT NULL,
  industry_slugs text[],
  max_branches integer,
  max_users integer,
  features text[] NOT NULL DEFAULT '{}',
  is_trial boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans public read" ON public.subscription_plans;
CREATE POLICY "plans public read" ON public.subscription_plans
  FOR SELECT TO anon, authenticated
  USING ((is_active AND is_public) OR public.has_platform_admin());

DROP TRIGGER IF EXISTS set_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER set_plans_updated_at BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Organizations: link to industry + suspension flag (additive)
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS industry_id uuid REFERENCES public.industries(id);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "platform admins read orgs" ON public.organizations;
CREATE POLICY "platform admins read orgs" ON public.organizations
  FOR SELECT TO authenticated USING (public.has_platform_admin());

DROP POLICY IF EXISTS "platform admins update orgs" ON public.organizations;
CREATE POLICY "platform admins update orgs" ON public.organizations
  FOR UPDATE TO authenticated USING (public.has_platform_admin()) WITH CHECK (public.has_platform_admin());

-- 6) Subscriptions (per organization)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status public.subscription_status NOT NULL DEFAULT 'TRIAL',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EGP',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  granted_by uuid,
  grant_reason text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON public.subscriptions(expires_at);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own subscription" ON public.subscriptions;
CREATE POLICY "members read own subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.has_platform_admin());

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Platform audit log
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform admins read audit" ON public.platform_audit_logs;
CREATE POLICY "platform admins read audit" ON public.platform_audit_logs
  FOR SELECT TO authenticated USING (public.has_platform_admin());

-- 8) Seed industries
INSERT INTO public.industries (slug, name, description, icon, theme, default_settings, features, sort_order) VALUES
('supermarket','السوبر ماركت والبقالة','إدارة أصناف وباركود، بيع بالقطعة والوزن، مشتريات وموردون، جرد وورديات.','shopping-cart','{"primary":"#0F766E","accent":"#F59E0B"}','{"sold_by_weight":true,"expiry_alert_days":30,"block_expired_sales":true}','{barcode,scale,expiry,purchases,stock_count,shifts}',1),
('pharmacy','الصيدليات','أدوية وتشغيلات وتواريخ صلاحية، تنبيهات صلاحية ومخزون، ضوابط بيع وفق قوانين الدولة.','pill','{"primary":"#0E7490","accent":"#10B981"}','{"expiry_alert_days":90,"block_expired_sales":true,"batch_tracking":true}','{barcode,expiry,batches,stock_count,prescriptions}',2),
('cafe','الكافيهات والمقاهي','قوائم مشروبات وحلويات، إضافات وأحجام، طاولات وطلبات وحالات تجهيز.','coffee','{"primary":"#B45309","accent":"#F97316"}','{"tables":true,"modifiers":true,"kitchen_print":true,"service_charge":true}','{tables,modifiers,kitchen_print,order_status}',3),
('restaurant','المطاعم','قوائم طعام، إضافات وأحجام، طاولات، طلبات داخلية وخارجية وطباعة مطبخ.','utensils','{"primary":"#B91C1C","accent":"#F59E0B"}','{"tables":true,"modifiers":true,"kitchen_print":true,"service_charge":true,"delivery":true}','{tables,modifiers,kitchen_print,delivery,order_status}',4),
('clothing','محلات الملابس والأحذية','مقاسات وألوان ومتغيرات، استبدال ومرتجعات، مخزون حسب المقاس واللون.','shirt','{"primary":"#7C3AED","accent":"#EC4899"}','{"variants":true,"sizes":true,"colors":true,"exchange":true}','{variants,sizes,colors,exchange}',5),
('electronics','محلات الإلكترونيات والهواتف','أرقام تسلسلية وضمان، بيانات أجهزة، تتبع مخزون ومرتجعات.','smartphone','{"primary":"#1D4ED8","accent":"#06B6D4"}','{"serial_tracking":true,"warranty":true}','{serial_tracking,warranty,imei}',6),
('home-goods','محلات الأدوات المنزلية','أدوات منزلية ومستلزمات، وحدات وأحجام متعددة، جرد ومخزون.','home','{"primary":"#CA8A04","accent":"#84CC16"}','{"units":true,"stock_count":true}','{units,stock_count}',7),
('bookstore','المكتبات والأدوات المكتبية','كتب ومستلزمات مكتبية، تصنيفات ومؤلفون، جرد ومخزون.','book','{"primary":"#92400E","accent":"#D97706"}','{"stock_count":true}','{stock_count,catalog}',8),
('cosmetics','محلات العطور ومستحضرات التجميل','عطور ومستحضرات تجميل، أحجام وعبوات، تواريخ صلاحية وتشغيلات.','sparkles','{"primary":"#DB2777","accent":"#A855F7"}','{"expiry_alert_days":180,"batches":true}','{expiry,batches,catalog}',9),
('auto-parts','محلات قطع غيار السيارات','قطع غيار وماركات وموديلات، مطابقة السيارة، مخزون ومشتريات.','wrench','{"primary":"#374151","accent":"#EF4444"}','{"vehicle_fitment":true}','{fitment,stock_count,purchases}',10),
('general-retail','محلات البيع بالتجزئة العامة','بيع تجزئة عام بباركود ومخزون وورديات وتقارير.','store','{"primary":"#0E7490","accent":"#F59E0B"}','{"stock_count":true}','{barcode,stock_count,shifts}',11)
ON CONFLICT (slug) DO NOTHING;

-- 9) Seed plans
INSERT INTO public.subscription_plans (slug, name, description, price, currency, duration_days, max_branches, max_users, features, is_trial, sort_order) VALUES
('trial','تجربة مجانية','14 يومًا لتجربة المنصة كاملة على نشاطك.',0,'EGP',14,1,3,'{pos,inventory,reports}',true,0),
('monthly','اشتراك شهري','اشتراك شهري كامل لكل مزايا نشاطك.',299,'EGP',30,3,10,'{pos,inventory,reports,credit,ai_analyst}',false,1),
('quarterly','اشتراك 3 أشهر','ثلاثة أشهر بسعر مخفض.',799,'EGP',90,3,10,'{pos,inventory,reports,credit,ai_analyst}',false,2),
('semiannual','اشتراك 6 أشهر','ستة أشهر بسعر مخفض.',1499,'EGP',180,5,20,'{pos,inventory,reports,credit,ai_analyst,multi_branch}',false,3),
('yearly','اشتراك سنوي','سنة كاملة بأفضل سعر.',2799,'EGP',365,10,50,'{pos,inventory,reports,credit,ai_analyst,multi_branch,api}',false,4)
ON CONFLICT (slug) DO NOTHING;

-- 10) Platform owner
INSERT INTO public.platform_admins (user_id) VALUES ('d1003404-aeab-4d38-9144-144933d0f6f4')
ON CONFLICT (user_id) DO NOTHING;

-- 11) bootstrap_organization: require/attach industry + auto trial subscription
CREATE OR REPLACE FUNCTION public.bootstrap_organization(_org_name text, _full_name text, _currency text DEFAULT 'SAR'::text, _tax_rate numeric DEFAULT 15, _industry_slug text DEFAULT 'supermarket'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _org uuid; _branch uuid; _wh uuid; _ind uuid; _plan record; _dflt jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND org_id IS NOT NULL) THEN
    RAISE EXCEPTION 'user already belongs to an organization';
  END IF;
  SELECT id, default_settings INTO _ind, _dflt FROM public.industries
    WHERE slug = coalesce(nullif(trim(_industry_slug),''),'supermarket') AND is_active = true;
  IF _ind IS NULL THEN RAISE EXCEPTION 'invalid or inactive industry'; END IF;
  INSERT INTO public.organizations (name, owner_id, currency, tax_rate, industry_id, expiry_alert_days, block_expired_sales)
  VALUES (coalesce(nullif(trim(_org_name),''),'My Business'), _uid, coalesce(_currency,'SAR'), coalesce(_tax_rate,15), _ind,
          coalesce((_dflt->>'expiry_alert_days')::int, 30),
          coalesce((_dflt->>'block_expired_sales')::boolean, false))
  RETURNING id INTO _org;
  INSERT INTO public.branches (org_id, name, code) VALUES (_org, 'الفرع الرئيسي', 'BR-01') RETURNING id INTO _branch;
  INSERT INTO public.warehouses (org_id, branch_id, name) VALUES (_org, _branch, 'المستودع الرئيسي') RETURNING id INTO _wh;
  INSERT INTO public.registers (org_id, branch_id, name, code) VALUES (_org, _branch, 'كاشير 01', 'POS-01');
  INSERT INTO public.profiles (id, org_id, full_name, role, branch_id, is_active)
  VALUES (_uid, _org, coalesce(nullif(trim(_full_name),''),'Owner'), 'OWNER', _branch, true)
  ON CONFLICT (id) DO UPDATE SET org_id = _org, role = 'OWNER', branch_id = _branch, full_name = coalesce(nullif(trim(_full_name),''), public.profiles.full_name);
  -- Auto trial subscription (one trial per organization; enforced by policy, not UI)
  SELECT id, duration_days, price, currency, features INTO _plan FROM public.subscription_plans
    WHERE is_trial = true AND is_active = true ORDER BY sort_order LIMIT 1;
  IF _plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (org_id, plan_id, status, price, currency, expires_at)
    VALUES (_org, _plan.id, 'TRIAL', _plan.price, _plan.currency, now() + make_interval(days => _plan.duration_days));
  END IF;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'ORG_CREATED', 'organizations', _org, jsonb_build_object('industry', _industry_slug));
  RETURN _org;
END; $function$;