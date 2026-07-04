-- ============================================================================
-- Migración 003: Flujo Contratos ↔ Contabilidad
--   - Roles nuevos: contratos, contabilidad
--   - Estados nuevos: publicada, en_revision, devuelta, pagada, cancelada
--   - Campos de flujo en payment_batches (numero_solicitud, contrato, publicación, revisión, motivo devolución)
--   - Tabla audit_log (trazabilidad)
--   - Tabla notifications (bandeja simple)
--   - RLS: cada rol ve lo que le corresponde
-- Ejecutar en Supabase → SQL Editor → Run
-- ============================================================================

-- ===== 1) Nuevos valores de enum =====
alter type user_role      add value if not exists 'contratos';
alter type user_role      add value if not exists 'contabilidad';

alter type estado_proceso add value if not exists 'publicada';
alter type estado_proceso add value if not exists 'en_revision';
alter type estado_proceso add value if not exists 'devuelta';
alter type estado_proceso add value if not exists 'pagada';
alter type estado_proceso add value if not exists 'cancelada';

-- ===== 2) Migrar estados viejos a los nuevos (compatibilidad) =====
-- Esto se hace tras el commit del enum. Por eso va en su propio bloque.
do $$ begin
  update public.payment_batches set estado = 'pagada'    where estado::text in ('pagado', 'completado');
  update public.payment_batches set estado = 'cancelada' where estado::text = 'anulado';
exception when others then null; end $$;

-- ===== 3) Campos nuevos en payment_batches =====
alter table public.payment_batches
  add column if not exists numero_solicitud text unique,
  add column if not exists contrato          text,
  add column if not exists published_by      uuid references public.profiles(id) on delete set null,
  add column if not exists published_at      timestamptz,
  add column if not exists reviewed_by       uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at       timestamptz,
  add column if not exists motivo_devolucion text;

create index if not exists idx_batches_numero on public.payment_batches(numero_solicitud);

-- ===== 4) Función: número de solicitud consecutivo por año =====
create or replace function public.generar_numero_solicitud()
returns text language plpgsql as $$
declare
  anio text := to_char(now(), 'YYYY');
  seq  integer;
begin
  select coalesce(max(cast(split_part(numero_solicitud, '-', 3) as integer)), 0) + 1
    into seq
    from public.payment_batches
   where numero_solicitud like 'SOL-' || anio || '-%';
  return 'SOL-' || anio || '-' || lpad(seq::text, 4, '0');
end;
$$;

-- Backfill: asignar numero_solicitud a los batches que no tienen
do $$
declare r record;
begin
  for r in select id from public.payment_batches
           where numero_solicitud is null
           order by created_at loop
    update public.payment_batches
       set numero_solicitud = public.generar_numero_solicitud()
     where id = r.id;
  end loop;
end $$;

-- ===== 5) Tabla audit_log =====
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.payment_batches(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  user_nombre  text,
  user_rol     text,
  accion       text not null,   -- crear, publicar, devolver, revisar, generar_txt, pagar, cancelar
  descripcion  text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_audit_batch on public.audit_log(batch_id, created_at);

alter table public.audit_log enable row level security;
drop policy if exists "audit_select" on public.audit_log;
create policy "audit_select" on public.audit_log for select
  to authenticated using ( true );
drop policy if exists "audit_insert" on public.audit_log;
create policy "audit_insert" on public.audit_log for insert
  to authenticated with check ( true );

-- ===== 6) Tabla notifications =====
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade,   -- destinatario individual (opcional)
  rol        user_role,                                                -- destinatario por rol (opcional)
  batch_id   uuid references public.payment_batches(id) on delete cascade,
  tipo       text not null,   -- solicitud_publicada, solicitud_devuelta, txt_generado, pago_marcado
  mensaje    text not null,
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notif_user on public.notifications(user_id, leida);
create index if not exists idx_notif_rol  on public.notifications(rol, leida);

alter table public.notifications enable row level security;

drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select
  to authenticated using (
       user_id = auth.uid()
    or rol = (select rol from public.profiles where id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications for insert
  to authenticated with check ( true );

drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update
  to authenticated using (
       user_id = auth.uid()
    or rol = (select rol from public.profiles where id = auth.uid())
    or public.is_admin()
  );

-- ===== 7) Actualizar RLS de payment_batches con reglas por rol =====
-- Contratos: crea y ve sus solicitudes; edita solo en borrador o devuelta.
-- Contabilidad: ve las publicadas y siguientes; puede actualizar (revisar, devolver, generar TXT, marcar pagada).
-- Administrador: ve y hace todo.

create or replace function public.rol_actual()
returns user_role
language sql security definer set search_path = public stable
as $$
  select rol from public.profiles where id = auth.uid();
$$;

drop policy if exists "batches_select"        on public.payment_batches;
drop policy if exists "batches_insert"        on public.payment_batches;
drop policy if exists "batches_update"        on public.payment_batches;
drop policy if exists "batches_delete"        on public.payment_batches;

-- SELECT
create policy "batches_select" on public.payment_batches for select
  using (
       public.is_admin()
    or public.rol_actual() = 'contabilidad'
    or user_id = auth.uid()
  );

-- INSERT: contratos, contabilidad, administrador (los usuarios simples también pueden crear como antes)
create policy "batches_insert" on public.payment_batches for insert
  with check ( user_id = auth.uid() );

-- UPDATE:
--  - dueño puede editar mientras esté en borrador o devuelta
--  - contabilidad y admin pueden editar en cualquier estado
create policy "batches_update" on public.payment_batches for update
  using (
       public.is_admin()
    or public.rol_actual() = 'contabilidad'
    or (user_id = auth.uid() and estado::text in ('borrador','devuelta'))
  );

-- DELETE: solo dueño en borrador, o admin
create policy "batches_delete" on public.payment_batches for delete
  using (
       public.is_admin()
    or (user_id = auth.uid() and estado::text = 'borrador')
  );

-- Payments: acceso siguiendo al batch (contratos edita solo si el batch es editable)
drop policy if exists "payments_all" on public.payments;
drop policy if exists "payments_select" on public.payments;
drop policy if exists "payments_write"  on public.payments;

create policy "payments_select" on public.payments for select
  using (
    exists (
      select 1 from public.payment_batches b
      where b.id = payments.batch_id
        and (
             public.is_admin()
          or public.rol_actual() = 'contabilidad'
          or b.user_id = auth.uid()
        )
    )
  );

create policy "payments_write" on public.payments for all
  using (
    exists (
      select 1 from public.payment_batches b
      where b.id = payments.batch_id
        and (
             public.is_admin()
          or public.rol_actual() = 'contabilidad'
          or (b.user_id = auth.uid() and b.estado::text in ('borrador','devuelta'))
        )
    )
  )
  with check (
    exists (
      select 1 from public.payment_batches b
      where b.id = payments.batch_id
        and (
             public.is_admin()
          or public.rol_actual() = 'contabilidad'
          or (b.user_id = auth.uid() and b.estado::text in ('borrador','devuelta'))
        )
    )
  );

-- ===== 8) Poder que un admin cambie el rol de otro perfil =====
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using ( public.is_admin() );

-- ============================================================================
-- FIN
-- ============================================================================
