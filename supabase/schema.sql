-- ============================================================================
-- Pagos Masivos - Esquema de Base de Datos (Supabase / PostgreSQL)
-- Banco: Banreservas (Rep. Dominicana)
-- ----------------------------------------------------------------------------
-- Cómo usar:
--   1. Entra a tu proyecto en Supabase -> SQL Editor -> New query.
--   2. Pega TODO este archivo y pulsa "Run".
--   3. Luego crea los buckets de Storage (ver seccion al final) si el SQL
--      de storage te da error por permisos, hazlo desde el panel.
-- ============================================================================

-- Extensiones necesarias -----------------------------------------------------
create extension if not exists "pgcrypto";      -- para gen_random_uuid()

-- ============================================================================
-- TIPOS (ENUMS)
-- ============================================================================

-- Rol del usuario
do $$ begin
  create type user_role as enum ('administrador', 'usuario');
exception when duplicate_object then null; end $$;

-- Tipo de pago
do $$ begin
  create type tipo_pago as enum ('interbancaria', 'terceros');
exception when duplicate_object then null; end $$;

-- Estado del proceso de pago
do $$ begin
  create type estado_proceso as enum (
    'borrador',        -- Excel cargado, aun sin TXT
    'txt_generado',    -- TXT generado y descargado
    'pagado',          -- Comprobante del banco adjuntado
    'completado',      -- Recibo generado
    'anulado'          -- Proceso cancelado
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- TABLA: profiles  (extiende auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text        not null default '',
  correo      text        not null,
  rol         user_role   not null default 'usuario',
  activo      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada usuario, ligado a auth.users';

-- Crea automaticamente un perfil cuando se registra un usuario nuevo --------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, correo, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: saber si el usuario actual es administrador ------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'administrador'
  );
$$;

-- ============================================================================
-- TABLA: payment_batches  (un "proceso" completo: Excel -> TXT -> Recibo)
-- ============================================================================
create table if not exists public.payment_batches (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete restrict,

  tipo_pago          tipo_pago,                 -- se define en el Modulo 2
  estado             estado_proceso not null default 'borrador',

  -- Archivo Excel de solicitud (Modulo 1)
  excel_file_name    text,
  excel_storage_path text,

  -- Archivo TXT generado (Modulo 3)
  txt_file_name      text,
  txt_storage_path   text,
  txt_generated_at   timestamptz,

  -- Totales calculados
  total_registros    integer not null default 0,
  total_beneficiarios integer not null default 0,
  monto_total        numeric(18,2) not null default 0,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.payment_batches is 'Cada carga/proceso de pago masivo';

create index if not exists idx_batches_user   on public.payment_batches(user_id);
create index if not exists idx_batches_estado on public.payment_batches(estado);
create index if not exists idx_batches_fecha  on public.payment_batches(created_at);

-- ============================================================================
-- TABLA: payments  (cada fila del Excel = un pago individual)
-- ============================================================================
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.payment_batches(id) on delete cascade,

  fila              integer,                    -- numero de fila en el Excel
  beneficiario      text,
  cedula_rnc        text,
  cuenta_banco      text,
  banco_destino     text,                       -- relevante en interbancarias
  monto             numeric(18,2) not null default 0,
  concepto          text,

  -- Validacion (Modulo de Validaciones)
  tiene_error       boolean not null default false,
  errores           jsonb   not null default '[]'::jsonb,

  created_at        timestamptz not null default now()
);

comment on table public.payments is 'Renglones individuales de cada batch';

create index if not exists idx_payments_batch on public.payments(batch_id);
create index if not exists idx_payments_cedula on public.payments(cedula_rnc);

-- ============================================================================
-- TABLA: receipts  (Modulo 4: comprobante del banco + recibo generado)
-- ============================================================================
create table if not exists public.receipts (
  id                      uuid primary key default gen_random_uuid(),
  batch_id                uuid not null references public.payment_batches(id) on delete cascade,
  user_id                 uuid not null references public.profiles(id) on delete restrict,

  numero_recibo           text unique,           -- ej: REC-2026-000123

  -- Comprobante entregado por el banco
  comprobante_file_name   text,
  comprobante_storage_path text,

  -- Recibo generado por el sistema
  recibo_file_name        text,
  recibo_storage_path     text,

  estado_pago             text,                  -- ej: 'confirmado', 'pendiente'
  created_at              timestamptz not null default now()
);

comment on table public.receipts is 'Comprobante del banco y recibo generado';

create index if not exists idx_receipts_batch on public.receipts(batch_id);

-- ============================================================================
-- updated_at automatico
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_batches_touch on public.payment_batches;
create trigger trg_batches_touch before update on public.payment_batches
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- SEGURIDAD A NIVEL DE FILA (RLS)
-- Regla: el administrador ve todo; el usuario solo ve lo suyo.
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.payment_batches enable row level security;
alter table public.payments        enable row level security;
alter table public.receipts        enable row level security;

-- PROFILES -------------------------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using ( id = auth.uid() or public.is_admin() );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
  using ( id = auth.uid() or public.is_admin() );

-- Solo un admin puede cambiar roles/crear-editar otros perfiles se maneja
-- desde el backend con la service_role key.

-- PAYMENT_BATCHES ------------------------------------------------------------
drop policy if exists "batches_select" on public.payment_batches;
create policy "batches_select" on public.payment_batches for select
  using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "batches_insert" on public.payment_batches;
create policy "batches_insert" on public.payment_batches for insert
  with check ( user_id = auth.uid() );

drop policy if exists "batches_update" on public.payment_batches;
create policy "batches_update" on public.payment_batches for update
  using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "batches_delete" on public.payment_batches;
create policy "batches_delete" on public.payment_batches for delete
  using ( user_id = auth.uid() or public.is_admin() );

-- PAYMENTS (se accede a traves del batch dueño) ------------------------------
drop policy if exists "payments_all" on public.payments;
create policy "payments_all" on public.payments for all
  using (
    exists (
      select 1 from public.payment_batches b
      where b.id = payments.batch_id
        and ( b.user_id = auth.uid() or public.is_admin() )
    )
  )
  with check (
    exists (
      select 1 from public.payment_batches b
      where b.id = payments.batch_id
        and ( b.user_id = auth.uid() or public.is_admin() )
    )
  );

-- RECEIPTS -------------------------------------------------------------------
drop policy if exists "receipts_select" on public.receipts;
create policy "receipts_select" on public.receipts for select
  using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "receipts_write" on public.receipts;
create policy "receipts_write" on public.receipts for all
  using ( user_id = auth.uid() or public.is_admin() )
  with check ( user_id = auth.uid() or public.is_admin() );

-- ============================================================================
-- STORAGE (buckets privados para los archivos)
-- Si esto falla por permisos, crea los buckets manualmente desde
-- Storage -> New bucket (marcalos como "Private").
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('excel-solicitudes', 'excel-solicitudes', false),
  ('txt-generados',     'txt-generados',     false),
  ('comprobantes',      'comprobantes',      false),
  ('recibos',           'recibos',           false)
on conflict (id) do nothing;

-- Politica: un usuario autenticado puede leer/escribir archivos.
-- (El control fino por dueño se hace guardando la ruta como  {user_id}/...)
drop policy if exists "storage_auth_read" on storage.objects;
create policy "storage_auth_read" on storage.objects for select
  to authenticated
  using ( bucket_id in ('excel-solicitudes','txt-generados','comprobantes','recibos') );

drop policy if exists "storage_auth_write" on storage.objects;
create policy "storage_auth_write" on storage.objects for insert
  to authenticated
  with check ( bucket_id in ('excel-solicitudes','txt-generados','comprobantes','recibos') );

drop policy if exists "storage_auth_delete" on storage.objects;
create policy "storage_auth_delete" on storage.objects for delete
  to authenticated
  using ( bucket_id in ('excel-solicitudes','txt-generados','comprobantes','recibos') );

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================
