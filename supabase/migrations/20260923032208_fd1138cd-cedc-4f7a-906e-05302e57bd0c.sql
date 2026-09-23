CREATE OR REPLACE FUNCTION public.audit_organization_financial_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.tax_rate IS DISTINCT FROM NEW.tax_rate
     OR OLD.profit_calculation_method IS DISTINCT FROM NEW.profit_calculation_method THEN
    INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
    VALUES (
      NEW.id,
      auth.uid(),
      'FINANCIAL_SETTINGS_UPDATED',
      'organizations',
      NEW.id,
      jsonb_build_object(
        'before', jsonb_build_object(
          'currency', OLD.currency,
          'tax_rate', OLD.tax_rate,
          'profit_calculation_method', OLD.profit_calculation_method
        ),
        'after', jsonb_build_object(
          'currency', NEW.currency,
          'tax_rate', NEW.tax_rate,
          'profit_calculation_method', NEW.profit_calculation_method
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_organization_financial_settings() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_organization_financial_settings() TO service_role;

CREATE TRIGGER t_audit_organization_financial_settings
AFTER UPDATE OF currency, tax_rate, profit_calculation_method ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.audit_organization_financial_settings();