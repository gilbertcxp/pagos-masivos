-- ============================================================================
-- Migración 004: Fix race condition en numero_solicitud
--   El número ahora se genera en un trigger BEFORE INSERT con advisory lock,
--   eliminando duplicados cuando dos usuarios insertan al mismo tiempo.
-- ============================================================================

-- 1) Reemplazar la función con versión que usa advisory lock
CREATE OR REPLACE FUNCTION public.generar_numero_solicitud()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  anio text := to_char(now(), 'YYYY');
  seq  integer;
BEGIN
  -- Advisory lock garantiza exclusividad dentro de la transacción
  PERFORM pg_advisory_xact_lock(8675309);
  SELECT coalesce(max(cast(split_part(numero_solicitud, '-', 3) as integer)), 0) + 1
    INTO seq
    FROM public.payment_batches
   WHERE numero_solicitud LIKE 'SOL-' || anio || '-%';
  RETURN 'SOL-' || anio || '-' || lpad(seq::text, 4, '0');
END;
$$;

-- 2) Función del trigger
CREATE OR REPLACE FUNCTION public.trigger_numero_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_solicitud IS NULL THEN
    NEW.numero_solicitud := public.generar_numero_solicitud();
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Crear trigger BEFORE INSERT
DROP TRIGGER IF EXISTS set_numero_solicitud ON public.payment_batches;
CREATE TRIGGER set_numero_solicitud
  BEFORE INSERT ON public.payment_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_numero_solicitud();
