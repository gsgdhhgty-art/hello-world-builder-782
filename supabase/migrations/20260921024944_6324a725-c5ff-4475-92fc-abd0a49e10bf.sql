REVOKE EXECUTE ON FUNCTION public.generate_product_barcode() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_product_barcode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_product_barcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_product_barcode() TO service_role;