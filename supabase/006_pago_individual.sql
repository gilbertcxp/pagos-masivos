-- ============================================================================
-- Migración 006: Estado de pago por línea individual
--   - Agrega estado_pago, pagado_en, pagado_por a cada fila de payments
--   - Elimina restricción unique en receipts.numero_recibo (la fecha sola no
--     es única entre batches distintos pagados el mismo día)
-- Ejecutar en Supabase → SQL Editor → Run
-- ============================================================================

-- 1) Nuevos campos en payments
alter table public.payments
  add column if not exists estado_pago text        not null default 'pendiente',
  add column if not exists pagado_en   timestamptz,
  add column if not exists pagado_por  uuid references public.profiles(id) on delete set null;

create index if not exists idx_payments_estado on public.payments(estado_pago);

-- 2) Quitar la restricción unique que bloquea batches pagados en el mismo día
alter table public.receipts drop constraint if exists receipts_numero_recibo_key;

-- ============================================================================
-- FIN
-- ============================================================================
