CREATE POLICY "service role manages barcode counters"
ON public.product_barcode_counters
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);