-- ============================================================================
-- Migración 017: Corrección retroactiva de estado_pago
--   Sincroniza los pagos individuales de solicitudes YA marcadas como
--   "pagada" que quedaron con estado_pago = 'pendiente' (antes de la
--   migracion 016/fix que sincroniza esto automaticamente).
-- ============================================================================

update public.payments p
set estado_pago = 'pagado',
    pagado_en = coalesce(p.pagado_en, now())
from public.payment_batches b
where b.id = p.batch_id
  and b.estado = 'pagada'
  and p.estado_pago <> 'pagado';
