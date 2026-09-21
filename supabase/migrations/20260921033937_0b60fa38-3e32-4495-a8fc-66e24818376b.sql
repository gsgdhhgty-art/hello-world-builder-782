CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands read" ON public.brands FOR SELECT TO authenticated
USING (org_id = public.current_org_id());
CREATE POLICY "brands manage" ON public.brands FOR ALL TO authenticated
USING (org_id = public.current_org_id() AND public.has_perm('products.edit'))
WITH CHECK (org_id = public.current_org_id() AND public.has_perm('products.edit'));
CREATE UNIQUE INDEX brands_org_name_unique_idx ON public.brands (org_id, lower(btrim(name)));
CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products
  ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
CREATE INDEX products_org_brand_idx ON public.products(org_id, brand_id);

ALTER TABLE public.organizations
  ADD COLUMN low_stock_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN low_stock_include_out_of_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN reorder_suggestion_multiplier numeric(8,2) NOT NULL DEFAULT 2 CHECK (reorder_suggestion_multiplier >= 1 AND reorder_suggestion_multiplier <= 100);

DROP POLICY IF EXISTS "sale items read" ON public.sale_items;
CREATE POLICY "sale items read" ON public.sale_items FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_id
      AND s.org_id = public.current_org_id()
      AND (public.has_perm('sales.view_all') OR (s.cashier_id = auth.uid() AND public.has_perm('sales.view_own')))
  )
);

DROP POLICY IF EXISTS "sale payments read" ON public.sale_payments;
CREATE POLICY "sale payments read" ON public.sale_payments FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_id
      AND s.org_id = public.current_org_id()
      AND (public.has_perm('sales.view_all') OR (s.cashier_id = auth.uid() AND public.has_perm('sales.view_own')))
  )
);

CREATE OR REPLACE FUNCTION public.report_daily_sales(
  _from timestamptz,
  _to timestamptz,
  _branch_id uuid DEFAULT NULL,
  _cashier_id uuid DEFAULT NULL
)
RETURNS TABLE(day date, sales_total numeric, tax_total numeric, invoice_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.current_org_id();
BEGIN
  IF _org IS NULL OR NOT public.has_perm('reports.view') THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
  SELECT s.created_at::date,
         round(coalesce(sum(s.total), 0), 2),
         round(coalesce(sum(s.tax), 0), 2),
         count(*)
  FROM public.sales s
  WHERE s.org_id = _org
    AND s.created_at >= _from AND s.created_at <= _to
    AND (_branch_id IS NULL OR s.branch_id = _branch_id)
    AND (_cashier_id IS NULL OR s.cashier_id = _cashier_id)
    AND s.status <> 'VOID'
  GROUP BY s.created_at::date
  ORDER BY s.created_at::date;
END; $$;
REVOKE ALL ON FUNCTION public.report_daily_sales(timestamptz, timestamptz, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.report_daily_sales(timestamptz, timestamptz, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_top_products(
  _from timestamptz,
  _to timestamptz,
  _branch_id uuid DEFAULT NULL,
  _cashier_id uuid DEFAULT NULL
)
RETURNS TABLE(product_id uuid, product_name text, quantity numeric, sales_total numeric, profit numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.current_org_id(); _can_profit boolean;
BEGIN
  IF _org IS NULL OR NOT public.has_perm('reports.view') THEN RAISE EXCEPTION 'not allowed'; END IF;
  _can_profit := public.has_perm('profit.view');
  RETURN QUERY
  SELECT si.product_id, max(si.product_name), sum(si.quantity), round(sum(si.line_total), 2),
         CASE WHEN _can_profit THEN round(sum(si.line_total - si.unit_cost * si.quantity), 2) ELSE NULL END
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id AND s.org_id = si.org_id
  WHERE s.org_id = _org
    AND s.created_at >= _from AND s.created_at <= _to
    AND (_branch_id IS NULL OR s.branch_id = _branch_id)
    AND (_cashier_id IS NULL OR s.cashier_id = _cashier_id)
    AND s.status <> 'VOID'
  GROUP BY si.product_id
  ORDER BY sum(si.line_total) DESC;
END; $$;
REVOKE ALL ON FUNCTION public.report_top_products(timestamptz, timestamptz, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.report_top_products(timestamptz, timestamptz, uuid, uuid) TO authenticated;