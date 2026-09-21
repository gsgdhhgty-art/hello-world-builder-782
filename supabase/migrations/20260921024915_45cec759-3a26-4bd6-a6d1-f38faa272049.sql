CREATE UNIQUE INDEX categories_org_name_unique_idx
ON public.categories (org_id, lower(btrim(name)));

CREATE TABLE public.product_barcode_counters (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0 AND next_value <= 9999999999),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_barcode_counters TO service_role;
ALTER TABLE public.product_barcode_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.generate_product_barcode()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_value bigint;
  v_body text;
  v_sum integer := 0;
  v_check integer;
  i integer;
BEGIN
  v_org := public.current_org_id();
  IF v_org IS NULL OR NOT public.has_perm('products.edit') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO public.product_barcode_counters (org_id, next_value)
  VALUES (v_org, 2)
  ON CONFLICT (org_id) DO UPDATE
    SET next_value = public.product_barcode_counters.next_value + 1,
        updated_at = now()
  RETURNING next_value - 1 INTO v_value;

  v_body := '29' || lpad(v_value::text, 10, '0');
  FOR i IN 1..12 LOOP
    v_sum := v_sum + substring(v_body from i for 1)::integer * CASE WHEN mod(i, 2) = 0 THEN 3 ELSE 1 END;
  END LOOP;
  v_check := mod(10 - mod(v_sum, 10), 10);
  RETURN v_body || v_check::text;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_product_barcode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_product_barcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_product_barcode() TO service_role;