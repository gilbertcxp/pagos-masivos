-- ============================================================================
-- Migración 014: Permitir rol contabilidad escribir en payments
--   Necesario para poder eliminar pagos individuales de una solicitud
--   (antes solo el dueño del batch o admin podían modificar payments).
-- ============================================================================

DROP POLICY IF EXISTS "payments_write" ON public.payments;

CREATE POLICY "payments_write" ON public.payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = payments.batch_id
        AND (b.user_id = auth.uid() OR public.is_admin() OR public.rol_actual() = 'contabilidad')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = payments.batch_id
        AND (b.user_id = auth.uid() OR public.is_admin() OR public.rol_actual() = 'contabilidad')
    )
  );
