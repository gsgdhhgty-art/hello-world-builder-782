ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS scale_barcode_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scale_barcode_prefix text NOT NULL DEFAULT '2',
  ADD COLUMN IF NOT EXISTS scale_barcode_mode text NOT NULL DEFAULT 'WEIGHT',
  ADD COLUMN IF NOT EXISTS expiry_alert_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS block_expired_sales boolean NOT NULL DEFAULT true;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_scale_mode_chk CHECK (scale_barcode_mode IN ('WEIGHT','PRICE')),
  ADD CONSTRAINT organizations_scale_prefix_chk CHECK (scale_barcode_prefix ~ '^[0-9]{1,2}$'),
  ADD CONSTRAINT organizations_expiry_days_chk CHECK (expiry_alert_days BETWEEN 0 AND 365);
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_by_weight boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS products_org_expires_idx ON public.products(org_id, expires_at) WHERE expires_at IS NOT NULL;