-- ============================================================================
-- Migración 004: Fix definitivo de numero_solicitud (reemplaza intento anterior)
--   Usa una tabla de secuencia por año con INSERT ON CONFLICT DO UPDATE RETURNING,
--   que es 100% atómico en PostgreSQL sin advisory locks ni condiciones de carrera.
-- ============================================================================

-- 1) Tabla de secuencia por año
CREATE TABLE IF NOT EXISTS public.numero_solicitud_seq (
  anio   TEXT PRIMARY KEY,
  ultimo INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.numero_solicitud_seq ENABLE ROW LEVEL SECURITY;
-- Solo funciones con security definer pueden modificarla
DROP POLICY IF EXISTS "seq_deny_all" ON public.numero_solicitud_seq;
CREATE POLICY "seq_deny_all" ON public.numero_solicitud_seq
  FOR ALL USING (false);

-- 2) Inicializar con datos existentes (para no reiniciar en 1)
INSERT INTO public.numero_solicitud_seq (anio, ultimo)
SELECT
  to_char(now(), 'YYYY') AS anio,
  COALESCE(
    MAX(CAST(split_part(numero_solicitud, '-', 3) AS integer)),
    0
  ) AS ultimo
FROM public.payment_batches
WHERE numero_solicitud LIKE 'SOL-' || to_char(now(), 'YYYY') || '-%'
  AND split_part(numero_solicitud, '-', 3) ~ '^[0-9]+$'
ON CONFLICT (anio) DO UPDATE
  SET ultimo = EXCLUDED.ultimo
  WHERE EXCLUDED.ultimo > numero_solicitud_seq.ultimo;

-- 3) Función generadora (atomic upsert)
CREATE OR REPLACE FUNCTION public.generar_numero_solicitud()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  anio  text := to_char(now(), 'YYYY');
  nuevo integer;
BEGIN
  INSERT INTO public.numero_solicitud_seq (anio, ultimo)
  VALUES (anio, 1)
  ON CONFLICT (anio) DO UPDATE
    SET ultimo = numero_solicitud_seq.ultimo + 1
  RETURNING ultimo INTO nuevo;

  RETURN 'SOL-' || anio || '-' || lpad(nuevo::text, 4, '0');
END;
$$;

-- 4) Trigger que asigna el número en el INSERT (sin pasar por el cliente)
CREATE OR REPLACE FUNCTION public.trigger_numero_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_solicitud IS NULL THEN
    NEW.numero_solicitud := public.generar_numero_solicitud();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_numero_solicitud ON public.payment_batches;
CREATE TRIGGER set_numero_solicitud
  BEFORE INSERT ON public.payment_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_numero_solicitud();
