-- ============================================================================
-- Migración 012: Permitir rol contratos cancelar cualquier solicitud
--   El policy anterior solo dejaba al dueño cambiar a borrador/devuelta/publicada.
--   Contratos necesita poder cancelar cualquier solicitud (sin importar dueño)
--   y cambiar el estado a 'cancelada'.
-- ============================================================================

drop policy if exists "batches_update" on public.payment_batches;

create policy "batches_update" on public.payment_batches for update
  using (
    -- ¿Quién puede tocar esta fila? (fila ACTUAL)
       public.is_admin()
    or public.rol_actual() = 'contabilidad'
    or public.rol_actual() = 'contratos'
    or (user_id = auth.uid() and estado::text in ('borrador','devuelta'))
  )
  with check (
    -- ¿A qué estados puede llegar la fila NUEVA?
       public.is_admin()
    or public.rol_actual() = 'contabilidad'
    or public.rol_actual() = 'contratos'
    or (
         user_id = auth.uid()
         and estado::text in ('borrador','devuelta','publicada')
       )
  );
