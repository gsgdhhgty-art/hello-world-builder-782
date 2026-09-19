REVOKE ALL ON FUNCTION public.recalculate_purchase_order_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_purchase_order_total() TO service_role;