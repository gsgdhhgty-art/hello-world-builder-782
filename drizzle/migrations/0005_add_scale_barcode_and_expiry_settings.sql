ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS scale_barcode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scale_barcode_prefix text NOT NULL DEFAULT '20',
  ADD COLUMN IF NOT EXISTS scale_barcode_mode text NOT NULL DEFAULT 'WEIGHT',
  ADD COLUMN IF NOT EXISTS expiry_alert_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS block_expired_sales boolean NOT NULL DEFAULT true;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_scale_barcode_prefix_check
  CHECK (scale_barcode_prefix ~ '^[0-9]{1,2}$'),
  ADD CONSTRAINT organizations_scale_barcode_mode_check
  CHECK (scale_barcode_mode IN ('WEIGHT', 'PRICE')),
  ADD CONSTRAINT organizations_expiry_alert_days_check
  CHECK (expiry_alert_days BETWEEN 1 AND 365);