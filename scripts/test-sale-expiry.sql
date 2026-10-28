-- Run only as an administrative regression test. All writes are rolled back.
BEGIN;
DO $$
DECLARE _item public.sale_items; _other_org uuid; _rejected boolean := false;
BEGIN
  SELECT * INTO _item FROM public.sale_items WHERE product_id IS NOT NULL LIMIT 1;
  IF _item.id IS NULL THEN RAISE EXCEPTION 'test requires an existing sale item'; END IF;
  UPDATE public.products SET expires_at = CURRENT_DATE - 1 WHERE id=_item.product_id;
  UPDATE public.organizations SET block_expired_sales=true WHERE id=_item.org_id;
  BEGIN
    INSERT INTO public.sale_items(org_id,sale_id,product_id,product_name,quantity,unit_price,unit_cost,discount,tax,line_total)
    VALUES(_item.org_id,_item.sale_id,_item.product_id,_item.product_name,1,_item.unit_price,_item.unit_cost,0,0,_item.unit_price);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'expired product cannot be sold' THEN RAISE; END IF;
    _rejected := true;
  END;
  IF NOT _rejected THEN RAISE EXCEPTION 'expired sale was incorrectly accepted'; END IF;
  UPDATE public.organizations SET block_expired_sales=false WHERE id=_item.org_id;
  INSERT INTO public.sale_items(org_id,sale_id,product_id,product_name,quantity,unit_price,unit_cost,discount,tax,line_total)
  VALUES(_item.org_id,_item.sale_id,_item.product_id,_item.product_name,1,_item.unit_price,_item.unit_cost,0,0,_item.unit_price);
  UPDATE public.organizations SET block_expired_sales=true WHERE id=_item.org_id;
  UPDATE public.products SET expires_at = CURRENT_DATE WHERE id=_item.product_id;
  INSERT INTO public.sale_items(org_id,sale_id,product_id,product_name,quantity,unit_price,unit_cost,discount,tax,line_total)
  VALUES(_item.org_id,_item.sale_id,_item.product_id,_item.product_name,1,_item.unit_price,_item.unit_cost,0,0,_item.unit_price);
  SELECT id INTO _other_org FROM public.organizations WHERE id<>_item.org_id LIMIT 1;
  IF _other_org IS NULL THEN RAISE EXCEPTION 'test requires a second organization'; END IF;
  _rejected := false;
  BEGIN
    INSERT INTO public.sale_items(org_id,sale_id,product_id,product_name,quantity,unit_price,unit_cost,discount,tax,line_total)
    VALUES(_other_org,_item.sale_id,_item.product_id,_item.product_name,1,_item.unit_price,_item.unit_cost,0,0,_item.unit_price);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid product organization' THEN RAISE; END IF;
    _rejected := true;
  END;
  IF NOT _rejected THEN RAISE EXCEPTION 'cross-organization product incorrectly accepted'; END IF;
END $$;
ROLLBACK;