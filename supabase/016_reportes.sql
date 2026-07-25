-- ============================================================================
-- Migración 016: Tabla de Reportes (problema / mejora)
--   Permite a cualquier usuario autenticado reportar un problema o sugerir
--   una mejora. Solo el administrador puede verlos todos y marcarlos como
--   resueltos.
-- ============================================================================

create table if not exists public.reportes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete restrict,
  tipo          text not null check (tipo in ('problema','mejora')),
  mensaje       text not null,
  pagina        text,
  estado        text not null default 'pendiente' check (estado in ('pendiente','resuelto')),
  created_at    timestamptz not null default now(),
  resuelto_at   timestamptz,
  resuelto_por  uuid references public.profiles(id)
);

comment on table public.reportes is 'Reportes de problemas o mejoras enviados por los usuarios';

create index if not exists idx_reportes_estado on public.reportes(estado);

alter table public.reportes enable row level security;

drop policy if exists "reportes_select" on public.reportes;
create policy "reportes_select" on public.reportes for select
  using ( user_id = auth.uid() or public.is_admin() );

drop policy if exists "reportes_insert" on public.reportes;
create policy "reportes_insert" on public.reportes for insert
  with check ( user_id = auth.uid() );

drop policy if exists "reportes_update" on public.reportes;
create policy "reportes_update" on public.reportes for update
  using ( public.is_admin() )
  with check ( public.is_admin() );
