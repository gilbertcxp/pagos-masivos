-- ============================================================================
-- Migración 013: Nuevos grupos SBG, GUERRA, MONTE PLATA, FAMA
-- ============================================================================

insert into public.grupos (nombre, nombre_norm, tipo_cuenta_origen, moneda, numero_cuenta_origen)
values
  ('SBG',         'sbg',         'CC', 'DOP', '9606372643'),
  ('GUERRA',      'guerra',      'CC', 'DOP', '9606372643'),
  ('MONTE PLATA', 'monte plata', 'CC', 'DOP', '9606372643'),
  ('FAMA',        'fama',        'CC', 'DOP', '9603493617')
on conflict (nombre_norm) do nothing;
