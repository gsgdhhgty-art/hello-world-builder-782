-- ===== enums =====
CREATE TYPE public.app_role AS ENUM ('OWNER','ADMIN','MANAGER','CASHIER','INVENTORY_MANAGER','ACCOUNTANT');
CREATE TYPE public.shift_status AS ENUM ('OPEN','CLOSED');
CREATE TYPE public.sale_status AS ENUM ('COMPLETED','REFUNDED','PARTIALLY_REFUNDED','VOID');

-- ===== shared trigger fn =====
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ===== organizations =====
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  tax_rate numeric(6,3) NOT NULL DEFAULT 15,
  business_type text NOT NULL DEFAULT 'RETAIL',
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_role public.app_role NOT NULL DEFAULT 'CASHIER',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registers TO authenticated;
GRANT ALL ON public.registers TO service_role;
ALTER TABLE public.registers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  username text,
  phone text,
  employee_code text,
  role public.app_role NOT NULL DEFAULT 'CASHIER',
  custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== security helper functions =====
CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_role_name() RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('OWNER','ADMIN'))
$$;

CREATE OR REPLACE FUNCTION public.default_permissions(_role public.app_role) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role
    WHEN 'OWNER' THEN '{"*":true}'::jsonb
    WHEN 'ADMIN' THEN '{"*":true}'::jsonb
    WHEN 'MANAGER' THEN '{"sales.create":true,"sales.view_all":true,"sales.refund":true,"sales.discount":true,"products.view":true,"products.edit":true,"inventory.view":true,"inventory.edit":true,"reports.view":true,"profit.view":true,"shift.open":true,"shift.close":true,"expenses.manage":true,"customers.manage":true,"suppliers.manage":true,"purchases.manage":true}'::jsonb
    WHEN 'CASHIER' THEN '{"sales.create":true,"sales.view_own":true,"products.view":true,"inventory.view":true,"shift.open":true,"shift.close":true,"customers.manage":true}'::jsonb
    WHEN 'INVENTORY_MANAGER' THEN '{"products.view":true,"products.edit":true,"inventory.view":true,"inventory.edit":true,"purchases.manage":true,"suppliers.manage":true,"reports.view":true}'::jsonb
    WHEN 'ACCOUNTANT' THEN '{"sales.view_all":true,"reports.view":true,"profit.view":true,"expenses.manage":true,"products.view":true,"inventory.view":true}'::jsonb
    ELSE '{}'::jsonb END
$$;

CREATE OR REPLACE FUNCTION public.has_perm(_perm text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; perms jsonb;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() AND is_active;
  IF p.id IS NULL THEN RETURN false; END IF;
  IF p.role IN ('OWNER','ADMIN') THEN RETURN true; END IF;
  SELECT permissions INTO perms FROM public.custom_roles WHERE id = p.custom_role_id;
  IF perms IS NULL THEN perms := public.default_permissions(p.role); END IF;
  RETURN coalesce((perms ->> _perm)::boolean, false);
END; $$;

CREATE OR REPLACE FUNCTION public.my_permissions() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; perms jsonb;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() AND is_active;
  IF p.id IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF p.role IN ('OWNER','ADMIN') THEN RETURN '{"*":true}'::jsonb; END IF;
  SELECT permissions INTO perms FROM public.custom_roles WHERE id = p.custom_role_id;
  RETURN coalesce(perms, public.default_permissions(p.role));
END; $$;

-- ===== policies for core tables =====
CREATE POLICY "org members read org" ON public.organizations FOR SELECT TO authenticated USING (id = public.current_org_id());
CREATE POLICY "owner updates org" ON public.organizations FOR UPDATE TO authenticated USING (id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "roles read" ON public.custom_roles FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "roles manage" ON public.custom_roles FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.is_org_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "branches read" ON public.branches FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "branches manage" ON public.branches FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.is_org_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "warehouses read" ON public.warehouses FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "warehouses manage" ON public.warehouses FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.is_org_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "registers read" ON public.registers FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "registers manage" ON public.registers FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.is_org_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "profiles read self" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR org_id = public.current_org_id());
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND org_id = public.current_org_id());
CREATE POLICY "profiles admin manage" ON public.profiles FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.is_org_admin()) WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());

-- ===== catalog =====
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories read" ON public.categories FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "categories manage" ON public.categories FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('products.edit')) WITH CHECK (org_id = public.current_org_id() AND public.has_perm('products.edit'));

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text,
  barcode text,
  unit text NOT NULL DEFAULT 'piece',
  cost numeric(14,4) NOT NULL DEFAULT 0,
  price numeric(14,4) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3),
  track_stock boolean NOT NULL DEFAULT true,
  reorder_level numeric(14,3) NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_org_barcode_idx ON public.products(org_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_org_idx ON public.products(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "products manage" ON public.products FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('products.edit')) WITH CHECK (org_id = public.current_org_id() AND public.has_perm('products.edit'));

CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory read" ON public.inventory FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('inventory.view'));
CREATE POLICY "inventory manage" ON public.inventory FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('inventory.edit')) WITH CHECK (org_id = public.current_org_id() AND public.has_perm('inventory.edit'));

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  qty_change numeric(14,3) NOT NULL,
  movement_type text NOT NULL,
  reference_id uuid,
  note text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements read" ON public.stock_movements FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('inventory.view'));
CREATE POLICY "movements insert" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id() AND public.has_perm('inventory.edit'));

-- ===== parties =====
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "customers manage" ON public.customers FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('customers.manage')) WITH CHECK (org_id = public.current_org_id() AND public.has_perm('customers.manage'));

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers read" ON public.suppliers FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('suppliers.manage'));
CREATE POLICY "suppliers manage" ON public.suppliers FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('suppliers.manage')) WITH CHECK (org_id = public.current_org_id() AND public.has_perm('suppliers.manage'));

-- ===== shifts =====
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  register_id uuid REFERENCES public.registers(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  opening_cash numeric(14,2) NOT NULL DEFAULT 0,
  closing_cash numeric(14,2),
  expected_cash numeric(14,2),
  status public.shift_status NOT NULL DEFAULT 'OPEN',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shifts_one_open_per_user ON public.shifts(user_id) WHERE status = 'OPEN';
GRANT SELECT, INSERT, UPDATE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts read" ON public.shifts FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND (user_id = auth.uid() OR public.has_perm('sales.view_all')));
CREATE POLICY "shifts insert" ON public.shifts FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id() AND user_id = auth.uid() AND public.has_perm('shift.open'));
CREATE POLICY "shifts update" ON public.shifts FOR UPDATE TO authenticated USING (org_id = public.current_org_id() AND (user_id = auth.uid() OR public.is_org_admin())) WITH CHECK (org_id = public.current_org_id());

-- ===== sales =====
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  register_id uuid REFERENCES public.registers(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  cashier_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_no text NOT NULL,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  cost_total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  change_due numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'CASH',
  status public.sale_status NOT NULL DEFAULT 'COMPLETED',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, invoice_no)
);
CREATE INDEX sales_org_created_idx ON public.sales(org_id, created_at DESC);
GRANT SELECT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales read" ON public.sales FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND (public.has_perm('sales.view_all') OR (cashier_id = auth.uid() AND public.has_perm('sales.view_own'))));

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_items_sale_idx ON public.sale_items(sale_id);
GRANT SELECT ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale items read" ON public.sale_items FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE TABLE public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric(14,2) NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale payments read" ON public.sale_payments FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE TABLE public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  total numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_returns TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "returns read" ON public.sale_returns FOR SELECT TO authenticated USING (org_id = public.current_org_id());

CREATE TABLE public.sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity numeric(14,3) NOT NULL,
  refund_amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_return_items TO authenticated;
GRANT ALL ON public.sale_return_items TO service_role;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "return items read" ON public.sale_return_items FOR SELECT TO authenticated USING (org_id = public.current_org_id());

-- ===== purchases =====
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  reference text,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'RECEIVED',
  user_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases read" ON public.purchases FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('purchases.manage'));

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  line_total numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase items read" ON public.purchase_items FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('purchases.manage'));

-- ===== expenses =====
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'GENERAL',
  amount numeric(14,2) NOT NULL,
  note text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('expenses.manage'));
CREATE POLICY "expenses manage" ON public.expenses FOR ALL TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('expenses.manage')) WITH CHECK (org_id = public.current_org_id() AND public.has_perm('expenses.manage'));

-- ===== audit =====
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_org_created_idx ON public.audit_logs(org_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.is_org_admin());

-- ===== updated_at triggers =====
CREATE TRIGGER t_org_upd BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_roles_upd BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_branches_upd BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_wh_upd BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_reg_upd BEFORE UPDATE ON public.registers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_prof_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_cat_upd BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_prod_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inv_upd BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_cust_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_supp_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_shift_upd BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_sales_upd BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_purch_upd BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_exp_upd BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== bootstrap organization (owner signup) =====
CREATE OR REPLACE FUNCTION public.bootstrap_organization(_org_name text, _full_name text, _currency text DEFAULT 'SAR', _tax_rate numeric DEFAULT 15)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _org uuid; _branch uuid; _wh uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND org_id IS NOT NULL) THEN
    RAISE EXCEPTION 'user already belongs to an organization';
  END IF;
  INSERT INTO public.organizations (name, owner_id, currency, tax_rate)
  VALUES (coalesce(nullif(trim(_org_name),''),'My Business'), _uid, coalesce(_currency,'SAR'), coalesce(_tax_rate,15))
  RETURNING id INTO _org;
  INSERT INTO public.branches (org_id, name, code) VALUES (_org, 'الفرع الرئيسي', 'BR-01') RETURNING id INTO _branch;
  INSERT INTO public.warehouses (org_id, branch_id, name) VALUES (_org, _branch, 'المستودع الرئيسي') RETURNING id INTO _wh;
  INSERT INTO public.registers (org_id, branch_id, name, code) VALUES (_org, _branch, 'كاشير 01', 'POS-01');
  INSERT INTO public.profiles (id, org_id, full_name, role, branch_id, is_active)
  VALUES (_uid, _org, coalesce(nullif(trim(_full_name),''),'Owner'), 'OWNER', _branch, true)
  ON CONFLICT (id) DO UPDATE SET org_id = _org, role = 'OWNER', branch_id = _branch, full_name = coalesce(nullif(trim(_full_name),''), public.profiles.full_name);
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id)
  VALUES (_org, _uid, 'ORG_CREATED', 'organizations', _org);
  RETURN _org;
END; $$;
REVOKE ALL ON FUNCTION public.bootstrap_organization(text, text, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization(text, text, text, numeric) TO authenticated;

-- ===== create_sale: server-authoritative checkout =====
CREATE OR REPLACE FUNCTION public.create_sale(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid := public.current_org_id();
  _org_tax numeric;
  _branch uuid; _wh uuid; _reg uuid; _shift uuid; _cust uuid;
  _item jsonb; _prod public.products;
  _qty numeric; _line_disc numeric; _line_net numeric; _line_tax numeric; _rate numeric;
  _subtotal numeric := 0; _disc_total numeric := 0; _tax_total numeric := 0; _cost_total numeric := 0;
  _total numeric := 0; _paid numeric := 0; _sale_id uuid; _invoice text; _seq bigint;
  _method text; _allow_discount boolean;
BEGIN
  IF _uid IS NULL OR _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('sales.create') THEN RAISE EXCEPTION 'no permission to create sales'; END IF;
  IF jsonb_typeof(_payload -> 'items') <> 'array' OR jsonb_array_length(_payload -> 'items') = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;

  SELECT tax_rate INTO _org_tax FROM public.organizations WHERE id = _org;
  _allow_discount := public.has_perm('sales.discount');

  SELECT id INTO _shift FROM public.shifts WHERE user_id = _uid AND status = 'OPEN' AND org_id = _org;
  IF _shift IS NULL THEN RAISE EXCEPTION 'no open shift'; END IF;
  SELECT branch_id, register_id INTO _branch, _reg FROM public.shifts WHERE id = _shift;
  SELECT id INTO _wh FROM public.warehouses WHERE org_id = _org AND (branch_id = _branch OR branch_id IS NULL) ORDER BY branch_id NULLS LAST LIMIT 1;
  IF _wh IS NULL THEN RAISE EXCEPTION 'no warehouse configured'; END IF;

  _cust := nullif(_payload ->> 'customer_id','')::uuid;
  IF _cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _cust AND org_id = _org) THEN
    RAISE EXCEPTION 'invalid customer';
  END IF;
  _method := coalesce(nullif(_payload ->> 'payment_method',''),'CASH');
  IF _method NOT IN ('CASH','CARD','TRANSFER','CREDIT') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  _paid := coalesce((_payload ->> 'paid')::numeric, 0);

  _invoice := to_char(now(),'YYYYMMDD');
  SELECT count(*) + 1 INTO _seq FROM public.sales WHERE org_id = _org AND created_at::date = current_date;
  _invoice := 'INV-' || _invoice || '-' || lpad(_seq::text, 4, '0');

  INSERT INTO public.sales (org_id, branch_id, warehouse_id, register_id, shift_id, cashier_id, customer_id, invoice_no, payment_method, note)
  VALUES (_org, _branch, _wh, _reg, _shift, _uid, _cust, _invoice, _method, nullif(_payload ->> 'note',''))
  RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_payload -> 'items') LOOP
    SELECT * INTO _prod FROM public.products WHERE id = (_item ->> 'product_id')::uuid AND org_id = _org AND is_active;
    IF _prod.id IS NULL THEN RAISE EXCEPTION 'invalid product in cart'; END IF;
    _qty := coalesce((_item ->> 'quantity')::numeric, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    _line_disc := CASE WHEN _allow_discount THEN greatest(coalesce((_item ->> 'discount')::numeric, 0), 0) ELSE 0 END;
    _line_net := _prod.price * _qty;
    IF _line_disc > _line_net THEN _line_disc := _line_net; END IF;
    _line_net := _line_net - _line_disc;
    _rate := coalesce(_prod.tax_rate, _org_tax, 0);
    _line_tax := round(_line_net * _rate / 100.0, 2);

    INSERT INTO public.sale_items (org_id, sale_id, product_id, product_name, quantity, unit_price, unit_cost, discount, tax, line_total)
    VALUES (_org, _sale_id, _prod.id, _prod.name, _qty, _prod.price, _prod.cost, _line_disc, _line_tax, round(_line_net + _line_tax, 2));

    IF _prod.track_stock THEN
      INSERT INTO public.inventory (org_id, product_id, warehouse_id, quantity)
      VALUES (_org, _prod.id, _wh, -_qty)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.inventory.quantity - _qty, updated_at = now();
      INSERT INTO public.stock_movements (org_id, product_id, warehouse_id, qty_change, movement_type, reference_id, user_id)
      VALUES (_org, _prod.id, _wh, -_qty, 'SALE', _sale_id, _uid);
    END IF;

    _subtotal := _subtotal + round(_prod.price * _qty, 2);
    _disc_total := _disc_total + _line_disc;
    _tax_total := _tax_total + _line_tax;
    _cost_total := _cost_total + round(_prod.cost * _qty, 2);
  END LOOP;

  _total := round(_subtotal - _disc_total + _tax_total, 2);
  IF _method = 'CREDIT' THEN
    IF _cust IS NULL THEN RAISE EXCEPTION 'credit sale requires a customer'; END IF;
    _paid := 0;
    UPDATE public.customers SET balance = balance + _total WHERE id = _cust;
  ELSE
    IF _paid < _total THEN _paid := _total; END IF;
  END IF;

  UPDATE public.sales SET subtotal = _subtotal, discount = _disc_total, tax = _tax_total,
    total = _total, cost_total = _cost_total, paid = _paid,
    change_due = greatest(_paid - _total, 0)
  WHERE id = _sale_id;

  INSERT INTO public.sale_payments (org_id, sale_id, method, amount)
  VALUES (_org, _sale_id, _method, CASE WHEN _method = 'CREDIT' THEN 0 ELSE _total END);

  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SALE_CREATED', 'sales', _sale_id, jsonb_build_object('invoice_no', _invoice, 'total', _total));

  RETURN jsonb_build_object('sale_id', _sale_id, 'invoice_no', _invoice, 'total', _total,
    'subtotal', _subtotal, 'discount', _disc_total, 'tax', _tax_total, 'paid', _paid,
    'change_due', greatest(_paid - _total, 0));
END; $$;
REVOKE ALL ON FUNCTION public.create_sale(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb) TO authenticated;

-- ===== refund =====
CREATE OR REPLACE FUNCTION public.create_return(_sale_id uuid, _items jsonb, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _sale public.sales;
  _ret uuid; _item jsonb; _si public.sale_items; _qty numeric; _refund numeric; _total numeric := 0;
  _already numeric;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('sales.refund') THEN RAISE EXCEPTION 'no permission to refund'; END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id AND org_id = _org;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'sale not found'; END IF;

  INSERT INTO public.sale_returns (org_id, sale_id, user_id, reason) VALUES (_org, _sale_id, _uid, _reason) RETURNING id INTO _ret;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _si FROM public.sale_items WHERE id = (_item ->> 'sale_item_id')::uuid AND sale_id = _sale_id;
    IF _si.id IS NULL THEN RAISE EXCEPTION 'invalid sale item'; END IF;
    _qty := coalesce((_item ->> 'quantity')::numeric, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'invalid return quantity'; END IF;
    SELECT coalesce(sum(quantity),0) INTO _already FROM public.sale_return_items WHERE sale_item_id = _si.id;
    IF _already + _qty > _si.quantity THEN RAISE EXCEPTION 'return quantity exceeds sold quantity'; END IF;
    _refund := round(_si.line_total * (_qty / _si.quantity), 2);
    INSERT INTO public.sale_return_items (org_id, return_id, sale_item_id, product_id, quantity, refund_amount)
    VALUES (_org, _ret, _si.id, _si.product_id, _qty, _refund);
    IF _si.product_id IS NOT NULL THEN
      INSERT INTO public.inventory (org_id, product_id, warehouse_id, quantity)
      VALUES (_org, _si.product_id, _sale.warehouse_id, _qty)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.inventory.quantity + _qty, updated_at = now();
      INSERT INTO public.stock_movements (org_id, product_id, warehouse_id, qty_change, movement_type, reference_id, user_id)
      VALUES (_org, _si.product_id, _sale.warehouse_id, _qty, 'RETURN', _ret, _uid);
    END IF;
    _total := _total + _refund;
  END LOOP;

  UPDATE public.sale_returns SET total = _total WHERE id = _ret;
  UPDATE public.sales SET status = CASE WHEN _total >= _sale.total THEN 'REFUNDED'::public.sale_status ELSE 'PARTIALLY_REFUNDED'::public.sale_status END WHERE id = _sale_id;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SALE_RETURNED', 'sales', _sale_id, jsonb_build_object('return_id', _ret, 'total', _total));
  RETURN jsonb_build_object('return_id', _ret, 'total', _total);
END; $$;
REVOKE ALL ON FUNCTION public.create_return(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_return(uuid, jsonb, text) TO authenticated;

-- ===== purchase receive =====
CREATE OR REPLACE FUNCTION public.receive_purchase(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _wh uuid; _sup uuid;
  _pid uuid; _item jsonb; _qty numeric; _cost numeric; _total numeric := 0; _prod public.products;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('purchases.manage') THEN RAISE EXCEPTION 'no permission for purchases'; END IF;
  _wh := nullif(_payload ->> 'warehouse_id','')::uuid;
  IF _wh IS NULL OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _wh AND org_id = _org) THEN RAISE EXCEPTION 'invalid warehouse'; END IF;
  _sup := nullif(_payload ->> 'supplier_id','')::uuid;
  IF _sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _sup AND org_id = _org) THEN RAISE EXCEPTION 'invalid supplier'; END IF;

  INSERT INTO public.purchases (org_id, supplier_id, warehouse_id, reference, user_id, note)
  VALUES (_org, _sup, _wh, nullif(_payload ->> 'reference',''), _uid, nullif(_payload ->> 'note',''))
  RETURNING id INTO _pid;

  FOR _item IN SELECT * FROM jsonb_array_elements(_payload -> 'items') LOOP
    SELECT * INTO _prod FROM public.products WHERE id = (_item ->> 'product_id')::uuid AND org_id = _org;
    IF _prod.id IS NULL THEN RAISE EXCEPTION 'invalid product'; END IF;
    _qty := coalesce((_item ->> 'quantity')::numeric, 0);
    _cost := greatest(coalesce((_item ->> 'unit_cost')::numeric, _prod.cost), 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    INSERT INTO public.purchase_items (org_id, purchase_id, product_id, quantity, unit_cost, line_total)
    VALUES (_org, _pid, _prod.id, _qty, _cost, round(_qty * _cost, 2));
    INSERT INTO public.inventory (org_id, product_id, warehouse_id, quantity)
    VALUES (_org, _prod.id, _wh, _qty)
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.inventory.quantity + _qty, updated_at = now();
    INSERT INTO public.stock_movements (org_id, product_id, warehouse_id, qty_change, movement_type, reference_id, user_id)
    VALUES (_org, _prod.id, _wh, _qty, 'PURCHASE', _pid, _uid);
    UPDATE public.products SET cost = _cost WHERE id = _prod.id;
    _total := _total + round(_qty * _cost, 2);
  END LOOP;

  UPDATE public.purchases SET total = _total WHERE id = _pid;
  IF _sup IS NOT NULL THEN UPDATE public.suppliers SET balance = balance + _total WHERE id = _sup; END IF;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'PURCHASE_RECEIVED', 'purchases', _pid, jsonb_build_object('total', _total));
  RETURN jsonb_build_object('purchase_id', _pid, 'total', _total);
END; $$;
REVOKE ALL ON FUNCTION public.receive_purchase(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.receive_purchase(jsonb) TO authenticated;

-- ===== shift close with expected cash =====
CREATE OR REPLACE FUNCTION public.close_shift(_shift_id uuid, _closing_cash numeric, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _s public.shifts;
  _cash_sales numeric; _expenses numeric; _expected numeric;
BEGIN
  SELECT * INTO _s FROM public.shifts WHERE id = _shift_id AND org_id = _org;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'shift not found'; END IF;
  IF _s.user_id <> _uid AND NOT public.is_org_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _s.status = 'CLOSED' THEN RAISE EXCEPTION 'shift already closed'; END IF;
  SELECT coalesce(sum(total),0) INTO _cash_sales FROM public.sales WHERE shift_id = _shift_id AND payment_method = 'CASH';
  SELECT coalesce(sum(amount),0) INTO _expenses FROM public.expenses WHERE shift_id = _shift_id;
  _expected := _s.opening_cash + _cash_sales - _expenses;
  UPDATE public.shifts SET status = 'CLOSED', closed_at = now(), closing_cash = _closing_cash,
    expected_cash = _expected, note = coalesce(_note, note) WHERE id = _shift_id;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SHIFT_CLOSED', 'shifts', _shift_id, jsonb_build_object('expected', _expected, 'counted', _closing_cash));
  RETURN jsonb_build_object('expected_cash', _expected, 'closing_cash', _closing_cash, 'difference', _closing_cash - _expected);
END; $$;
REVOKE ALL ON FUNCTION public.close_shift(uuid, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_perm(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;