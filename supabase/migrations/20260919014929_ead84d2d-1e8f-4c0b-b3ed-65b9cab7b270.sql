ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS tax_number text;

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  order_no text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ORDERED','RECEIVED','CANCELLED')),
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  note text,
  expected_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, order_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organization members can view purchase orders"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "Authorized staff can create purchase orders"
  ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND created_by = auth.uid() AND public.has_perm('purchases.manage'));
CREATE POLICY "Authorized staff can update purchase orders"
  ON public.purchase_orders FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('purchases.manage'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('purchases.manage'));
CREATE POLICY "Authorized staff can delete draft purchase orders"
  ON public.purchase_orders FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND status = 'DRAFT' AND public.has_perm('purchases.manage'));
CREATE TRIGGER set_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  line_total numeric GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organization members can view purchase order items"
  ON public.purchase_order_items FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "Authorized staff can create purchase order items"
  ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('purchases.manage'));
CREATE POLICY "Authorized staff can update purchase order items"
  ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('purchases.manage'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('purchases.manage'));
CREATE POLICY "Authorized staff can delete purchase order items"
  ON public.purchase_order_items FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('purchases.manage'));

CREATE OR REPLACE FUNCTION public.recalculate_purchase_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_id uuid := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
BEGIN
  UPDATE public.purchase_orders po
  SET total = COALESCE((SELECT SUM(i.line_total) FROM public.purchase_order_items i WHERE i.purchase_order_id = _order_id), 0)
  WHERE po.id = _order_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER recalculate_purchase_order_total
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_purchase_order_total();

CREATE INDEX purchase_orders_org_created_idx ON public.purchase_orders(org_id, created_at DESC);
CREATE INDEX purchase_order_items_order_idx ON public.purchase_order_items(purchase_order_id);
CREATE INDEX purchase_orders_supplier_idx ON public.purchase_orders(supplier_id);