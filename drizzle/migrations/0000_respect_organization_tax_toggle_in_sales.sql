DO $migration$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_sale'
    AND pg_get_function_arguments(p.oid) = '_payload jsonb';

  IF fn IS NULL THEN
    RAISE EXCEPTION 'public.create_sale(jsonb) was not found';
  END IF;

  fn := replace(
    fn,
    'SELECT tax_rate INTO _org_tax FROM public.organizations WHERE id = _org;',
    'SELECT CASE WHEN coalesce((feature_flags ->> ''tax_enabled'')::boolean, true) THEN tax_rate ELSE NULL END INTO _org_tax FROM public.organizations WHERE id = _org;'
  );
  fn := replace(
    fn,
    '_rate := coalesce(_prod.tax_rate, _org_tax, 0);',
    '_rate := CASE WHEN _org_tax IS NULL THEN 0 ELSE coalesce(_prod.tax_rate, _org_tax, 0) END;'
  );

  IF position('feature_flags ->> ''tax_enabled''' in fn) = 0
     OR position('_rate := CASE WHEN _org_tax IS NULL THEN 0' in fn) = 0 THEN
    RAISE EXCEPTION 'create_sale source did not match the expected tax calculation';
  END IF;

  EXECUTE fn;
END
$migration$;

COMMENT ON FUNCTION public.create_sale(jsonb) IS 'Creates an authoritative sale and respects organizations.feature_flags.tax_enabled while preserving the configured tax rate.';