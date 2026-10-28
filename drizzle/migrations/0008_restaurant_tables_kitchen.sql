CREATE TABLE public.dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  zone text NOT NULL DEFAULT 'الصالة' CHECK (length(zone) <= 40),
  seats integer NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'FREE' CHECK (status IN ('FREE','OCCUPIED','BILL','RESERVED')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dining_tables TO authenticated;
GRANT ALL ON public.dining_tables TO service_role;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dining tables read" ON public.dining_tables FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "dining tables status" ON public.dining_tables FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('sales.create'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('sales.create'));
CREATE POLICY "dining tables insert" ON public.dining_tables FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('settings.manage'));
CREATE POLICY "dining tables delete" ON public.dining_tables FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('settings.manage'));

CREATE TABLE public.kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid,
  table_id uuid REFERENCES public.dining_tables(id) ON DELETE SET NULL,
  ticket_no integer NOT NULL DEFAULT 0,
  order_type text NOT NULL DEFAULT 'DINE_IN' CHECK (order_type IN ('DINE_IN','TAKEAWAY','DELIVERY')),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','PREPARING','READY','SERVED','BILLED','CANCELLED')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  note text CHECK (note IS NULL OR length(note) <= 300),
  customer_name text CHECK (customer_name IS NULL OR length(customer_name) <= 80),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kitchen_tickets_org_status_idx ON public.kitchen_tickets (org_id, status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.kitchen_tickets TO authenticated;
GRANT ALL ON public.kitchen_tickets TO service_role;
ALTER TABLE public.kitchen_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kitchen tickets read" ON public.kitchen_tickets FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "kitchen tickets insert" ON public.kitchen_tickets FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('sales.create'));
CREATE POLICY "kitchen tickets update" ON public.kitchen_tickets FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_perm('sales.create'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_perm('sales.create'));

CREATE OR REPLACE FUNCTION public.kitchen_ticket_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT coalesce(max(ticket_no), 0) + 1 INTO NEW.ticket_no
  FROM public.kitchen_tickets
  WHERE org_id = NEW.org_id AND created_at >= date_trunc('day', now());
  RETURN NEW;
END $$;
CREATE TRIGGER kitchen_ticket_number BEFORE INSERT ON public.kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_ticket_number();

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER dining_tables_touch BEFORE UPDATE ON public.dining_tables FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER kitchen_tickets_touch BEFORE UPDATE ON public.kitchen_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dining_tables;