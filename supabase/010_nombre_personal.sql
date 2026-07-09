-- ============================================================================
-- Migración 010: nombre_personal en profiles
-- Ejecutar en Supabase SQL Editor (QA y producción)
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nombre_personal text NOT NULL DEFAULT '';
