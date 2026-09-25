CREATE TABLE IF NOT EXISTS public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'CASH',
  note text,
  balance_after numeric NOT NULL DEFAULT 0,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_payments_customer_idx ON public.customer_payments(customer_id, created_at DESC);
GRANT SELECT ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read customer payments" ON public.customer_payments
  FOR SELECT TO authenticated USING (org_id = public.current_org_id());

CREATE OR REPLACE FUNCTION public.record_customer_payment(_customer_id uuid, _amount numeric, _method text, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.current_org_id(); _bal numeric; _new numeric; _id uuid;
BEGIN
  IF auth.uid() IS NULL OR _org IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_perm('sales.create') OR public.has_perm('customers.manage')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF _method NOT IN ('CASH','CARD','TRANSFER','WALLET') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  SELECT balance INTO _bal FROM public.customers WHERE id = _customer_id AND org_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid customer'; END IF;
  IF round(_amount,2) > round(_bal,2) THEN RAISE EXCEPTION 'amount exceeds balance'; END IF;
  _new := round(_bal - _amount, 2);
  UPDATE public.customers SET balance = _new, updated_at = now() WHERE id = _customer_id;
  INSERT INTO public.customer_payments (org_id, customer_id, amount, method, note, balance_after, user_id)
  VALUES (_org, _customer_id, round(_amount,2), _method, nullif(trim(_note),''), _new, auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, auth.uid(), 'CUSTOMER_PAYMENT', 'customers', _customer_id, jsonb_build_object('amount', round(_amount,2), 'method', _method, 'balance_after', _new));
  RETURN jsonb_build_object('id', _id, 'balance', _new);
END $$;

CREATE OR REPLACE FUNCTION public.get_customer_ledger(_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.current_org_id(); _res jsonb;
BEGIN
  IF auth.uid() IS NULL OR _org IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_perm('sales.create') OR public.has_perm('customers.manage')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'customer', to_jsonb(c) - 'org_id',
    'sales', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'invoice_no', s.invoice_no, 'created_at', s.created_at, 'total', s.total,
        'paid', s.paid, 'payment_method', s.payment_method, 'status', s.status,
        'credit', GREATEST(s.total - s.paid, 0),
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.created_at) FROM public.sale_items i WHERE i.sale_id = s.id), '[]'::jsonb)
      ) ORDER BY s.created_at DESC) FROM public.sales s WHERE s.customer_id = c.id AND s.org_id = _org AND s.status <> 'VOID'), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'method', p.method, 'note', p.note, 'balance_after', p.balance_after, 'created_at', p.created_at) ORDER BY p.created_at DESC) FROM public.customer_payments p WHERE p.customer_id = c.id), '[]'::jsonb)
  ) INTO _res FROM public.customers c WHERE c.id = _customer_id AND c.org_id = _org;
  IF _res IS NULL THEN RAISE EXCEPTION 'invalid customer'; END IF;
  RETURN _res;
END $$;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger(uuid) TO authenticated;