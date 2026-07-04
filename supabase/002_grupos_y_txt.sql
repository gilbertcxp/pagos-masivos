-- ============================================================================
-- Migración 002: Grupos (cuentas de origen) + campos para generación de TXT
-- Correr en Supabase -> SQL Editor -> Run
-- ============================================================================

-- 1) Tabla de GRUPOS: cada grupo/socio con su cuenta de origen (Banreservas)
create table if not exists public.grupos (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  nombre_norm           text not null unique,      -- para hacer match sin acentos
  tipo_cuenta_origen    text not null default 'CC', -- CA (ahorros) / CC (corriente)
  moneda                text not null default 'DOP',
  numero_cuenta_origen  text not null,
  activo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.grupos is 'Grupos/socios y su cuenta bancaria de origen para pagos';

drop trigger if exists trg_grupos_touch on public.grupos;
create trigger trg_grupos_touch before update on public.grupos
  for each row execute function public.touch_updated_at();

-- 2) Nuevos campos en payment_batches (datos del encabezado del Excel)
alter table public.payment_batches
  add column if not exists grupo          text,
  add column if not exists encargado      text,
  add column if not exists solicitado_por text;

-- 3) Nuevo campo en payments: tipo de cuenta destino (AHORRO/CORRIENTE)
alter table public.payments
  add column if not exists tipo_cuenta text;

-- 4) Seguridad (RLS) para grupos: cualquier usuario autenticado puede
--    consultarlos y administrarlos (config compartida de la empresa).
alter table public.grupos enable row level security;

drop policy if exists "grupos_select" on public.grupos;
create policy "grupos_select" on public.grupos for select
  to authenticated using ( true );

drop policy if exists "grupos_write" on public.grupos;
create policy "grupos_write" on public.grupos for all
  to authenticated using ( true ) with check ( true );

-- ============================================================================
-- FIN
-- ============================================================================
