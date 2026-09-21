CREATE TABLE public.sale_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  original_sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  return_id uuid NOT NULL UNIQUE REFERENCES public.sale_returns(id) ON DELETE RESTRICT,
  replacement_sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  returned_total numeric(14,2) NOT NULL DEFAULT 0,
  replacement_total numeric(14,2) NOT NULL DEFAULT 0,
  amount_due numeric(14,2) NOT NULL DEFAULT 0,
  refund_due numeric(14,2) NOT NULL DEFAULT 0,
  settlement_method text NOT NULL DEFAULT 'CASH',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_exchanges TO authenticated;
GRANT ALL ON public.sale_exchanges TO service_role;
ALTER TABLE public.sale_exchanges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exchanges read" ON public.sale_exchanges FOR SELECT TO authenticated USING (org_id = public.current_org_id() AND public.has_perm('sales.refund'));
CREATE INDEX sale_exchanges_org_created_idx ON public.sale_exchanges(org_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_return(_sale_id uuid, _items jsonb, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _sale public.sales;
  _ret uuid; _item jsonb; _si public.sale_items; _qty numeric; _refund numeric; _total numeric := 0;
  _already numeric;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('sales.refund') THEN RAISE EXCEPTION 'no permission to refund'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'return items required'; END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id AND org_id = _org FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'sale not found'; END IF;
  IF _sale.status = 'VOID' THEN RAISE EXCEPTION 'sale is void'; END IF;

  INSERT INTO public.sale_returns (org_id, sale_id, user_id, reason) VALUES (_org, _sale_id, _uid, nullif(trim(_reason), '')) RETURNING id INTO _ret;

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
  IF _sale.payment_method = 'CREDIT' AND _sale.customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance = greatest(balance - _total, 0), updated_at = now() WHERE id = _sale.customer_id AND org_id = _org;
  END IF;
  UPDATE public.sales SET status = CASE WHEN _total >= _sale.total THEN 'REFUNDED'::public.sale_status ELSE 'PARTIALLY_REFUNDED'::public.sale_status END, updated_at = now() WHERE id = _sale_id;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SALE_RETURNED', 'sales', _sale_id, jsonb_build_object('return_id', _ret, 'total', _total));
  RETURN jsonb_build_object('return_id', _ret, 'total', _total);
END; $$;
REVOKE ALL ON FUNCTION public.create_return(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_return(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_exchange(_sale_id uuid, _return_items jsonb, _replacement_items jsonb, _settlement_method text DEFAULT 'CASH', _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _sale public.sales; _shift public.shifts;
  _return_id uuid; _replacement_sale_id uuid; _exchange_id uuid; _item jsonb; _si public.sale_items; _prod public.products;
  _qty numeric; _already numeric; _line_refund numeric; _returned_total numeric := 0;
  _line_discount numeric; _line_net numeric; _line_tax numeric; _rate numeric; _org_tax numeric;
  _subtotal numeric := 0; _discount numeric := 0; _tax numeric := 0; _replacement_total numeric := 0; _cost numeric := 0;
  _amount_due numeric; _refund_due numeric; _invoice text; _seq bigint; _method text;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('sales.refund') OR NOT public.has_perm('sales.create') THEN RAISE EXCEPTION 'no permission to exchange'; END IF;
  IF jsonb_typeof(_return_items) <> 'array' OR jsonb_array_length(_return_items) = 0 THEN RAISE EXCEPTION 'return items required'; END IF;
  IF jsonb_typeof(_replacement_items) <> 'array' OR jsonb_array_length(_replacement_items) = 0 THEN RAISE EXCEPTION 'replacement items required'; END IF;
  _method := coalesce(nullif(_settlement_method, ''), 'CASH');
  IF _method NOT IN ('CASH','CARD','TRANSFER','CREDIT') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id AND org_id = _org FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'sale not found'; END IF;
  IF _sale.status = 'VOID' THEN RAISE EXCEPTION 'sale is void'; END IF;
  SELECT * INTO _shift FROM public.shifts WHERE user_id = _uid AND org_id = _org AND status = 'OPEN' LIMIT 1;
  IF _shift.id IS NULL THEN RAISE EXCEPTION 'no open shift'; END IF;
  SELECT tax_rate INTO _org_tax FROM public.organizations WHERE id = _org;

  INSERT INTO public.sale_returns (org_id, sale_id, user_id, reason) VALUES (_org, _sale_id, _uid, nullif(trim(_note), '')) RETURNING id INTO _return_id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_return_items) LOOP
    SELECT * INTO _si FROM public.sale_items WHERE id = (_item ->> 'sale_item_id')::uuid AND sale_id = _sale_id;
    IF _si.id IS NULL THEN RAISE EXCEPTION 'invalid sale item'; END IF;
    _qty := coalesce((_item ->> 'quantity')::numeric, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'invalid return quantity'; END IF;
    SELECT coalesce(sum(quantity),0) INTO _already FROM public.sale_return_items WHERE sale_item_id = _si.id;
    IF _already + _qty > _si.quantity THEN RAISE EXCEPTION 'return quantity exceeds sold quantity'; END IF;
    _line_refund := round(_si.line_total * (_qty / _si.quantity), 2);
    INSERT INTO public.sale_return_items (org_id, return_id, sale_item_id, product_id, quantity, refund_amount)
    VALUES (_org, _return_id, _si.id, _si.product_id, _qty, _line_refund);
    IF _si.product_id IS NOT NULL THEN
      INSERT INTO public.inventory (org_id, product_id, warehouse_id, quantity)
      VALUES (_org, _si.product_id, _sale.warehouse_id, _qty)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.inventory.quantity + _qty, updated_at = now();
      INSERT INTO public.stock_movements (org_id, product_id, warehouse_id, qty_change, movement_type, reference_id, user_id)
      VALUES (_org, _si.product_id, _sale.warehouse_id, _qty, 'EXCHANGE_RETURN', _return_id, _uid);
    END IF;
    _returned_total := _returned_total + _line_refund;
  END LOOP;
  UPDATE public.sale_returns SET total = _returned_total WHERE id = _return_id;

  _invoice := to_char(now(),'YYYYMMDD');
  SELECT count(*) + 1 INTO _seq FROM public.sales WHERE org_id = _org AND created_at::date = current_date;
  _invoice := 'EX-' || _invoice || '-' || lpad(_seq::text, 4, '0');
  INSERT INTO public.sales (org_id, branch_id, warehouse_id, register_id, shift_id, cashier_id, customer_id, invoice_no, payment_method, note)
  VALUES (_org, _sale.branch_id, _sale.warehouse_id, _shift.register_id, _shift.id, _uid, _sale.customer_id, _invoice, _method, concat('استبدال للفاتورة ', _sale.invoice_no, CASE WHEN nullif(trim(_note), '') IS NOT NULL THEN ' — ' || trim(_note) ELSE '' END))
  RETURNING id INTO _replacement_sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_replacement_items) LOOP
    SELECT * INTO _prod FROM public.products WHERE id = (_item ->> 'product_id')::uuid AND org_id = _org AND is_active;
    IF _prod.id IS NULL THEN RAISE EXCEPTION 'invalid replacement product'; END IF;
    _qty := coalesce((_item ->> 'quantity')::numeric, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'invalid replacement quantity'; END IF;
    _line_discount := CASE WHEN public.has_perm('sales.discount') THEN greatest(coalesce((_item ->> 'discount')::numeric, 0), 0) ELSE 0 END;
    _line_net := _prod.price * _qty;
    IF _line_discount > _line_net THEN _line_discount := _line_net; END IF;
    _line_net := _line_net - _line_discount;
    _rate := coalesce(_prod.tax_rate, _org_tax, 0);
    _line_tax := round(_line_net * _rate / 100.0, 2);
    INSERT INTO public.sale_items (org_id, sale_id, product_id, product_name, quantity, unit_price, unit_cost, discount, tax, line_total)
    VALUES (_org, _replacement_sale_id, _prod.id, _prod.name, _qty, _prod.price, _prod.cost, _line_discount, _line_tax, round(_line_net + _line_tax, 2));
    IF _prod.track_stock THEN
      INSERT INTO public.inventory (org_id, product_id, warehouse_id, quantity)
      VALUES (_org, _prod.id, _sale.warehouse_id, -_qty)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.inventory.quantity - _qty, updated_at = now();
      INSERT INTO public.stock_movements (org_id, product_id, warehouse_id, qty_change, movement_type, reference_id, user_id)
      VALUES (_org, _prod.id, _sale.warehouse_id, -_qty, 'EXCHANGE_OUT', _replacement_sale_id, _uid);
    END IF;
    _subtotal := _subtotal + round(_prod.price * _qty, 2);
    _discount := _discount + _line_discount;
    _tax := _tax + _line_tax;
    _cost := _cost + round(_prod.cost * _qty, 2);
  END LOOP;
  _replacement_total := round(_subtotal - _discount + _tax, 2);
  _amount_due := greatest(_replacement_total - _returned_total, 0);
  _refund_due := greatest(_returned_total - _replacement_total, 0);
  UPDATE public.sales SET subtotal = _subtotal, discount = _discount, tax = _tax, total = _replacement_total,
    cost_total = _cost, paid = _replacement_total, change_due = 0, updated_at = now() WHERE id = _replacement_sale_id;
  INSERT INTO public.sale_payments (org_id, sale_id, method, amount, reference)
  VALUES (_org, _replacement_sale_id, 'RETURN_CREDIT', least(_returned_total, _replacement_total), _sale.invoice_no);
  IF _amount_due > 0 THEN
    INSERT INTO public.sale_payments (org_id, sale_id, method, amount, reference)
    VALUES (_org, _replacement_sale_id, _method, _amount_due, 'EXCHANGE_DIFFERENCE');
  END IF;
  IF _method = 'CREDIT' AND _amount_due > 0 THEN
    IF _sale.customer_id IS NULL THEN RAISE EXCEPTION 'credit exchange requires a customer'; END IF;
    UPDATE public.customers SET balance = balance + _amount_due, updated_at = now() WHERE id = _sale.customer_id AND org_id = _org;
  ELSIF _sale.payment_method = 'CREDIT' AND _sale.customer_id IS NOT NULL AND _refund_due > 0 THEN
    UPDATE public.customers SET balance = greatest(balance - _refund_due, 0), updated_at = now() WHERE id = _sale.customer_id AND org_id = _org;
  END IF;
  UPDATE public.sales SET status = CASE WHEN _returned_total >= _sale.total THEN 'REFUNDED'::public.sale_status ELSE 'PARTIALLY_REFUNDED'::public.sale_status END, updated_at = now() WHERE id = _sale_id;
  INSERT INTO public.sale_exchanges (org_id, original_sale_id, return_id, replacement_sale_id, user_id, returned_total, replacement_total, amount_due, refund_due, settlement_method, note)
  VALUES (_org, _sale_id, _return_id, _replacement_sale_id, _uid, _returned_total, _replacement_total, _amount_due, _refund_due, _method, nullif(trim(_note), '')) RETURNING id INTO _exchange_id;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SALE_EXCHANGED', 'sales', _sale_id, jsonb_build_object('exchange_id', _exchange_id, 'return_id', _return_id, 'replacement_sale_id', _replacement_sale_id, 'returned_total', _returned_total, 'replacement_total', _replacement_total, 'amount_due', _amount_due, 'refund_due', _refund_due));
  RETURN jsonb_build_object('exchange_id', _exchange_id, 'return_id', _return_id, 'replacement_sale_id', _replacement_sale_id, 'invoice_no', _invoice, 'returned_total', _returned_total, 'replacement_total', _replacement_total, 'amount_due', _amount_due, 'refund_due', _refund_due);
END; $$;
REVOKE ALL ON FUNCTION public.create_exchange(uuid, jsonb, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_exchange(uuid, jsonb, jsonb, text, text) TO authenticated;