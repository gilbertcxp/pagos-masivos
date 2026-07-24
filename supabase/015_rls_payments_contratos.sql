-- ============================================================================
-- Migración 015: Permitir rol contratos escribir en payments
--   Necesario para poder eliminar pagos individuales tambien desde Contratos
--   (antes solo el dueño del batch, admin o contabilidad podian).
-- ============================================================================

DROP POLICY IF EXISTS "payments_write" ON public.payments;

CREATE POLICY "payments_write" ON public.payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = payments.batch_id
        AND (
          b.user_id = auth.uid()
          OR public.is_admin()
          OR public.rol_actual() = 'contabilidad'
          OR public.rol_actual() = 'contratos'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = payments.batch_id
        AND (
          b.user_id = auth.uid()
          OR public.is_admin()
          OR public.rol_actual() = 'contabilidad'
          OR public.rol_actual() = 'contratos'
        )
    )
  );
