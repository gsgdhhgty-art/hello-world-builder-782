ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS wholesale_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS expires_at date;

CREATE INDEX IF NOT EXISTS products_org_supplier_idx ON public.products(org_id, supplier_id);