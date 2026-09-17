-- 1) idempotency + offline metadata for purchases
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS local_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS purchases_org_client_txn_uidx
  ON public.purchases (org_id, client_txn_id)
  WHERE client_txn_id IS NOT NULL;

-- 2) receive_purchase becomes idempotent (safe to retry from the offline queue)
CREATE OR REPLACE FUNCTION public.receive_purchase(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _wh uuid; _sup uuid;
  _pid uuid; _item jsonb; _qty numeric; _cost numeric; _total numeric := 0; _prod public.products;
  _txn text; _existing public.purchases; _local timestamptz;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('purchases.manage') THEN RAISE EXCEPTION 'no permission for purchases'; END IF;

  _txn := nullif(_payload ->> 'client_txn_id','');
  IF _txn IS NOT NULL THEN
    SELECT * INTO _existing FROM public.purchases WHERE org_id = _org AND client_txn_id = _txn;
    IF _existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('purchase_id', _existing.id, 'total', _existing.total, 'duplicate', true);
    END IF;
  END IF;

  _wh := nullif(_payload ->> 'warehouse_id','')::uuid;
  IF _wh IS NULL OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _wh AND org_id = _org) THEN RAISE EXCEPTION 'invalid warehouse'; END IF;
  _sup := nullif(_payload ->> 'supplier_id','')::uuid;
  IF _sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _sup AND org_id = _org) THEN RAISE EXCEPTION 'invalid supplier'; END IF;
  _local := nullif(_payload ->> 'local_created_at','')::timestamptz;

  INSERT INTO public.purchases (org_id, supplier_id, warehouse_id, reference, user_id, note, client_txn_id, local_created_at)
  VALUES (_org, _sup, _wh, nullif(_payload ->> 'reference',''), _uid, nullif(_payload ->> 'note',''), _txn, _local)
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
  RETURN jsonb_build_object('purchase_id', _pid, 'total', _total, 'duplicate', false);
END; $function$;

-- 3) expected cash now counts real cash payments (mixed payments included)
CREATE OR REPLACE FUNCTION public.close_shift(_shift_id uuid, _closing_cash numeric, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _s public.shifts;
  _cash_sales numeric; _expenses numeric; _expected numeric;
BEGIN
  SELECT * INTO _s FROM public.shifts WHERE id = _shift_id AND org_id = _org;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'shift not found'; END IF;
  IF _s.user_id <> _uid AND NOT public.is_org_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _s.status = 'CLOSED' THEN RAISE EXCEPTION 'shift already closed'; END IF;
  SELECT coalesce(sum(p.amount),0) INTO _cash_sales
  FROM public.sale_payments p
  JOIN public.sales s ON s.id = p.sale_id
  WHERE s.shift_id = _shift_id AND p.method = 'CASH';
  SELECT coalesce(sum(amount),0) INTO _expenses FROM public.expenses WHERE shift_id = _shift_id;
  _expected := _s.opening_cash + _cash_sales - _expenses;
  UPDATE public.shifts SET status = 'CLOSED', closed_at = now(), closing_cash = _closing_cash,
    expected_cash = _expected, note = coalesce(_note, note) WHERE id = _shift_id;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
  VALUES (_org, _uid, 'SHIFT_CLOSED', 'shifts', _shift_id, jsonb_build_object('expected', _expected, 'counted', _closing_cash));
  RETURN jsonb_build_object('expected_cash', _expected, 'closing_cash', _closing_cash, 'difference', _closing_cash - _expected);
END; $function$;

-- 4) close the caller's open shift without knowing its server id (offline queue safe)
CREATE OR REPLACE FUNCTION public.close_open_shift(_closing_cash numeric, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _org uuid := public.current_org_id(); _sid uuid;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT public.has_perm('shift.close') THEN RAISE EXCEPTION 'no permission to close shifts'; END IF;
  SELECT id INTO _sid FROM public.shifts
  WHERE org_id = _org AND user_id = _uid AND status = 'OPEN'
  ORDER BY opened_at DESC LIMIT 1;
  IF _sid IS NULL THEN RETURN jsonb_build_object('already_closed', true); END IF;
  RETURN public.close_shift(_sid, _closing_cash, _note) || jsonb_build_object('already_closed', false);
END; $function$;

REVOKE ALL ON FUNCTION public.close_open_shift(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_open_shift(numeric, text) TO authenticated;