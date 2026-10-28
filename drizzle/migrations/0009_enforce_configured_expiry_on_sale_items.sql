CREATE OR REPLACE FUNCTION public.guard_sale_item_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _expires date; _block boolean; _product_org uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.expires_at, p.org_id, o.block_expired_sales INTO _expires, _product_org, _block
  FROM public.products p JOIN public.organizations o ON o.id=p.org_id WHERE p.id=NEW.product_id;
  IF _product_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'invalid product organization'; END IF;
  IF _block AND _expires IS NOT NULL AND _expires < CURRENT_DATE THEN
    RAISE EXCEPTION 'expired product cannot be sold';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sale_item_expiry() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_sale_item_expiry BEFORE INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.guard_sale_item_expiry();