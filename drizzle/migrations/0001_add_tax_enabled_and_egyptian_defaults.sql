ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tax_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations ALTER COLUMN currency SET DEFAULT 'EGP';
ALTER TABLE public.organizations ALTER COLUMN tax_rate SET DEFAULT 0;

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
    'SELECT CASE WHEN coalesce((feature_flags ->> ''tax_enabled'')::boolean, true) THEN tax_rate ELSE NULL END INTO _org_tax FROM public.organizations WHERE id = _org;',
    'SELECT CASE WHEN tax_enabled THEN tax_rate ELSE NULL END INTO _org_tax FROM public.organizations WHERE id = _org;'
  );

  IF position('SELECT CASE WHEN tax_enabled THEN tax_rate ELSE NULL END' in fn) = 0 THEN
    RAISE EXCEPTION 'create_sale source did not match the expected tax toggle';
  END IF;

  EXECUTE fn;
END
$migration$;

COMMENT ON COLUMN public.organizations.tax_enabled IS 'Master switch controlling whether sales tax is applied at checkout.';