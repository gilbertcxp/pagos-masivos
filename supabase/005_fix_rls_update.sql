-- ============================================================================
-- Migración 005: Fix RLS UPDATE en payment_batches
--   El policy de UPDATE sin WITH CHECK usa el mismo USING para verificar la
--   fila NUEVA, lo que impedía cambiar estado a 'publicada' (no estaba en la
--   lista borrador/devuelta). Se agrega WITH CHECK explícito.
-- ============================================================================

drop policy if exists "batches_update" on public.payment_batches;

create policy "batches_update" on public.payment_batches for update
  using (
    -- ¿Quién puede tocar esta fila? (fila ACTUAL)
       public.is_admin()
    or public.rol_actual() = 'contabilidad'
    or (user_id = auth.uid() and estado::text in ('borrador','devuelta'))
  )
  with check (
    -- ¿A qué estados puede llegar la fila NUEVA?
       public.is_admin()
    or public.rol_actual() = 'contabilidad'
    or (
         user_id = auth.uid()
         and estado::text in ('borrador','devuelta','publicada')
       )
  );
