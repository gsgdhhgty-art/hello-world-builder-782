-- ============ mixed payments + partial credit ============
CREATE OR REPLACE FUNCTION public.create_sale(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _org uuid := public.current_org_id();
  _org_tax numeric;
  _branch uuid; _wh uuid; _reg uuid; _shift uuid; _cust uuid;
  _item jsonb; _prod public.products; _pay jsonb;
  _qty numeric; _line_disc numeric; _line_net numeric; _line_tax numeric; _rate numeric;
  _subtotal numeric := 0; _disc_total numeric := 0; _tax_total numeric := 0; _cost_total numeric := 0;
  _total numeric := 0; _paid numeric := 0; _sale_id uuid; _invoice text; _seq bigint;
  _method text; _allow_discount boolean; _txn text; _existing public.sales;
  _payments jsonb; _pm text; _amt numeric; _cart_disc numeric := 0; _cart_disc_left numeric;
  _gross numeric := 0; _credit numeric := 0;
BEGIN
  IF _uid IS NULL OR _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('sales.create') THEN RAISE EXCEPTION 'no permission to create sales'; END IF;
  IF jsonb_typeof(_payload -> 'items') <> 'array' OR jsonb_array_length(_payload -> 'items') = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;

  _txn := nullif(_payload ->> 'client_txn_id','');
  IF _txn IS NOT NULL THEN
    SELECT * INTO _existing FROM public.sales WHERE org_id = _org AND client_txn_id = _txn;
    IF _existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('sale_id', _existing.id, 'invoice_no', _existing.invoice_no,
        'total', _existing.total, 'subtotal', _existing.subtotal, 'discount', _existing.discount,
        'tax', _existing.tax, 'paid', _existing.paid, 'change_due', _existing.change_due,
        'duplicate', true);
    END IF;
  END IF;

  SELECT tax_rate INTO _org_tax FROM public.organizations WHERE id = _org;
  _allow_discount := public.has_perm('sales.discount');

  SELECT id INTO _shift FROM public.shifts WHERE user_id = _uid AND status = 'OPEN' AND org_id = _org;
  IF _shift IS NULL THEN RAISE EXCEPTION 'no open shift'; END IF;
  SELECT branch_id, register_id INTO _branch, _reg FROM public.shifts WHERE id = _shift;

  SELECT id INTO _wh FROM public.warehouses
    WHERE org_id = _org AND is_active AND branch_id = _branch
    ORDER BY created_at LIMIT 1;
  IF _wh IS NULL THEN
    SELECT id INTO _wh FROM public.warehouses
      WHERE org_id = _org AND is_active AND branch_id IS NULL
      ORDER BY created_at LIMIT 1;
  END IF;
  IF _wh IS NULL THEN RAISE EXCEPTION 'no warehouse configured'; END IF;

  _cust := nullif(_payload ->> 'customer_id','')::uuid;
  IF _cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _cust AND org_id = _org) THEN
    RAISE EXCEPTION 'invalid customer';
  END IF;

  -- payment breakdown (server-authoritative)
  _payments := CASE WHEN jsonb_typeof(_payload -> 'payments') = 'array' THEN _payload -> 'payments' ELSE '[]'::jsonb END;
  IF jsonb_array_length(_payments) > 0 THEN
    FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      _pm := coalesce(nullif(_pay ->> 'method',''),'CASH');
      IF _pm NOT IN ('CASH','CARD','TRANSFER','WALLET','CREDIT') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
      _amt := coalesce((_pay ->> 'amount')::numeric, 0);
      IF _amt < 0 THEN RAISE EXCEPTION 'invalid payment amount'; END IF;
      IF _pm = 'CREDIT' THEN CONTINUE; END IF;
      _paid := _paid + _amt;
    END LOOP;
    IF jsonb_array_length(_payments) = 1 THEN
      _method := coalesce(nullif((_payments -> 0) ->> 'method',''),'CASH');
    ELSE
      _method := 'MIXED';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_payments) p WHERE p ->> 'method' = 'CREDIT') THEN
      IF jsonb_array_length(_payments) > 1 THEN _method := 'MIXED'; ELSE _method := 'CREDIT'; END IF;
    END IF;
  ELSE
    _method := coalesce(nullif(_payload ->> 'payment_method',''),'CASH');
    IF _method NOT IN ('CASH','CARD','TRANSFER','WALLET','CREDIT') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
    _paid := coalesce((_payload ->> 'paid')::numeric, 0);
  END IF;

  _invoice := to_char(now(),'YYYYMMDD');
  SELECT count(*) + 1 INTO _seq FROM public.sales WHERE org_id = _org AND created_at::date = current_date;
  _invoice := 'INV-' || _invoice || '-' || lpad(_seq::text, 4, '0');

  INSERT INTO public.sales (org_id, branch_id, warehouse_id, register_id, shift_id, cashier_id, customer_id, invoice_no, payment_method, note, client_txn_id, local_created_at)
  VALUES (_org, _branch, _wh, _reg, _shift, _uid, _cust, _invoice, _method, nullif(_payload ->> 'note',''), _txn,
    nullif(_payload ->> 'local_created_at','')::timestamptz)
  RETURNING id INTO _sale_id;

  -- whole-cart discount, distributed over lines (permission gated)
  IF _allow_discount THEN
    _cart_disc := greatest(coalesce((_payload ->> 'cart_discount')::numeric, 0), 0);
  END IF;
  IF _cart_disc > 0 THEN
    FOR _item IN SELECT * FROM jsonb_array_elements(_payload -> 'items') LOOP
      SELECT * INTO _prod FROM public.products WHERE id = (_item ->> 'product_id')::uuid AND org_id = _org AND is_active;
      IF _prod.id IS NULL THEN RAISE EXCEPTION 'invalid product in cart'; END IF;
      _gross := _gross + _prod.price * coalesce((_item ->> 'quantity')::numeric, 0);
    END LOOP;
    IF _cart_disc > _gross THEN _cart_disc := _gross; END IF;
  END IF;
  _cart_disc_left := _cart_disc;

  FOR _item IN SELECT * FROM jsonb_array_elements(_payload -> 'items') LOOP
    SELECT * INTO _prod FROM public.products WHERE id = (_item ->> 'product_id')::uuid AND org_id = _org AND is_active;
    IF _prod.id IS NULL THEN RAISE EXCEPTION 'invalid product in cart'; END IF;
    _qty := coalesce((_item ->> 'quantity')::numeric, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    _line_disc := CASE WHEN _allow_discount THEN greatest(coalesce((_item ->> 'discount')::numeric, 0), 0) ELSE 0 END;
    _line_net := _prod.price * _qty;
    IF _line_disc > _line_net THEN _line_disc := _line_net; END IF;
    -- share of the cart-level discount, proportional to line weight
    IF _cart_disc > 0 AND _gross > 0 THEN
      _amt := least(round(_cart_disc * (_prod.price * _qty) / _gross, 2), _cart_disc_left);
      _amt := least(_amt, _line_net - _line_disc);
      _line_disc := _line_disc + _amt;
      _cart_disc_left := _cart_disc_left - _amt;
    END IF;
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

  IF _method = 'CREDIT' OR (_method = 'MIXED' AND _paid < _total) THEN
    IF _cust IS NULL THEN RAISE EXCEPTION 'credit sale requires a customer'; END IF;
    IF _paid > _total THEN _paid := _total; END IF;
    _credit := round(_total - _paid, 2);
    IF _credit > 0 THEN
      UPDATE public.customers SET balance = balance + _credit WHERE id = _cust;
    END IF;
  ELSE
    IF _paid < _total THEN _paid := _total; END IF;
  END IF;

  UPDATE public.sales SET subtotal = _subtotal, discount = _disc_total, tax = _tax_total,
    total = _total, cost_total = _cost_total, paid = _paid,
    change_due = greatest(_paid - _total, 0)
  WHERE id = _sale_id;

  IF jsonb_array_length(_payments) > 0 THEN
    FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      _pm := coalesce(nullif(_pay ->> 'method',''),'CASH');
      _amt := coalesce((_pay ->> 'amount')::numeric, 0);
      IF _pm = 'CREDIT' THEN _amt := _credit; END IF;
      IF _amt <= 0 THEN CONTINUE; END IF;
      INSERT INTO public.sale_payments (org_id, sale_id, method, amount, reference)
      VALUES (_org, _sale_id, _pm, _amt, nullif(_pay ->> 'reference',''));
    END LOOP;
    IF _credit > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_payments) p WHERE p ->> 'method' = 'CREDIT') THEN
      INSERT INTO public.sale_payments (org_id, sale_id, method, amount)
      VALUES (_org, _sale_id, 'CREDIT', _credit);
    END IF;
  ELSE
    INSERT INTO public.sale_payments (org_id, sale_id, method, amount)
    VALUES (_org, _sale_id, _method, CASE WHEN _method = 'CREDIT' THEN 0 ELSE _paid END);
  END IF;

  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SALE_CREATED', 'sales', _sale_id, jsonb_build_object('invoice_no', _invoice, 'total', _total, 'method', _method, 'credit', _credit));

  RETURN jsonb_build_object('sale_id', _sale_id, 'invoice_no', _invoice, 'total', _total,
    'subtotal', _subtotal, 'discount', _disc_total, 'tax', _tax_total, 'paid', _paid,
    'change_due', greatest(_paid - _total, 0), 'credit', _credit, 'duplicate', false);
END; $function$;

-- ============ open_shift: server-authoritative, idempotent ============
CREATE OR REPLACE FUNCTION public.open_shift(_opening_cash numeric DEFAULT 0, _register_id uuid DEFAULT NULL, _client_txn_id text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _org uuid := public.current_org_id();
  _reg uuid; _branch uuid; _shift public.shifts;
BEGIN
  IF _uid IS NULL OR _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('shift.open') THEN RAISE EXCEPTION 'no permission to open shifts'; END IF;

  SELECT * INTO _shift FROM public.shifts WHERE org_id = _org AND user_id = _uid AND status = 'OPEN';
  IF _shift.id IS NOT NULL THEN
    RETURN jsonb_build_object('shift_id', _shift.id, 'opening_cash', _shift.opening_cash, 'duplicate', true);
  END IF;

  IF _register_id IS NOT NULL THEN
    SELECT id, branch_id INTO _reg, _branch FROM public.registers WHERE id = _register_id AND org_id = _org AND is_active;
  END IF;
  IF _reg IS NULL THEN
    SELECT id, branch_id INTO _reg, _branch FROM public.registers
      WHERE org_id = _org AND is_active ORDER BY created_at LIMIT 1;
  END IF;
  IF _reg IS NULL THEN RAISE EXCEPTION 'no register configured'; END IF;

  INSERT INTO public.shifts (org_id, branch_id, register_id, user_id, opening_cash, status,
    opened_at, note)
  VALUES (_org, _branch, _reg, _uid, greatest(coalesce(_opening_cash,0),0), 'OPEN', now(), _client_txn_id)
  RETURNING * INTO _shift;

  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SHIFT_OPENED', 'shifts', _shift.id, jsonb_build_object('opening_cash', _shift.opening_cash));

  RETURN jsonb_build_object('shift_id', _shift.id, 'opening_cash', _shift.opening_cash, 'duplicate', false);
END; $function$;

REVOKE ALL ON FUNCTION public.open_shift(numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_shift(numeric, uuid, text) TO authenticated;