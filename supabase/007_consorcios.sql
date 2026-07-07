-- ============================================================================
-- Migración 007: Ajuste RLS de grupos — solo admin puede escribir
--   La tabla grupos ya existe (002_grupos_y_txt.sql).
--   Antes cualquier autenticado podía escribir; ahora solo el administrador.
--   Lectura sigue siendo abierta a todos los autenticados (dropdown TXT).
-- ============================================================================

DROP POLICY IF EXISTS "grupos_write" ON public.grupos;
CREATE POLICY "grupos_write" ON public.grupos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
