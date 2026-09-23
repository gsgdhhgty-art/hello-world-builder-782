ALTER TABLE public.organizations
ADD COLUMN profit_calculation_method text NOT NULL DEFAULT 'AVERAGE_COST';

ALTER TABLE public.organizations
ADD CONSTRAINT organizations_profit_calculation_method_check
CHECK (profit_calculation_method IN ('AVERAGE_COST'));

COMMENT ON COLUMN public.organizations.profit_calculation_method IS
'Profit calculation method. AVERAGE_COST uses the unit cost captured on each sale item.';