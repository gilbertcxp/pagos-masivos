-- ============================================================================
-- Migración 009: Conceptos a pagar en payment_batches
-- Ejecutar en Supabase SQL Editor (producción y QA)
-- ============================================================================

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS conceptos_pagar text[] NOT NULL DEFAULT '{}';
