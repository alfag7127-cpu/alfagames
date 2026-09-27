-- Sala Gamer — schema inicial para Supabase (Postgres)
-- Ejecutar en el SQL Editor del proyecto Supabase (o via `supabase db push`).
-- Orden de ejecucion: de arriba hacia abajo, es idempotente-friendly con IF NOT EXISTS donde aplica.

-- ============================================================
-- 0. ESQUEMA PRIVADO — funciones helper que NO deben quedar expuestas
--    como endpoints RPC publicos (PostgREST solo expone el esquema public).
-- ============================================================
create schema if not exists private;

-- ============================================================
-- 1. PROFILES — extiende auth.users con rol de la app
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'empleado' check (role in ('admin', 'empleado')),
  created_at timestamptz not null default now()
);

-- Crea automaticamente un profile (rol empleado por defecto) cuando se registra un usuario nuevo.
-- El primer admin se promueve a mano con un UPDATE despues de crear su cuenta.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'empleado');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

-- Helper para RLS: ¿el usuario autenticado es admin?
create or replace function private.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 2. PUESTOS — estaciones fisicas de la sala (PS5, PC, Xbox, etc.)
-- ============================================================
create table if not exists public.puestos (
  id bigint generated always as identity primary key,
  nombre text not null,
  activo boolean not null default true, -- false = fuera de servicio / mantenimiento
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. SESIONES — cada alquiler de un puesto a un cliente
-- ============================================================
create table if not exists public.sesiones (
  id bigint generated always as identity primary key,
  puesto_id bigint not null references public.puestos (id),
  empleado_id uuid not null references public.profiles (id),
  cliente_nombre text,
  hora_inicio timestamptz not null default now(),
  hora_fin timestamptz,
  horas_cobradas int, -- se calcula al cerrar: ceil(minutos_jugados / 60), minimo 1
  controles_adicionales int not null default 0,
  precio_manual numeric(10, 0), -- si el empleado pacto un precio especial (ej. oferta 3h)
  precio_total numeric(10, 0), -- monto final cobrado (calculado o manual + extras)
  estado text not null default 'activa' check (estado in ('activa', 'finalizada', 'cancelada')),
  created_at timestamptz not null default now()
);

-- Solo puede haber UNA sesion activa por puesto a la vez.
create unique index if not exists sesiones_un_activa_por_puesto
  on public.sesiones (puesto_id)
  where estado = 'activa';

create index if not exists sesiones_por_fecha on public.sesiones (created_at);
create index if not exists sesiones_por_empleado on public.sesiones (empleado_id);

-- Vista de conveniencia: estado actual de cada puesto (libre / ocupado) sin duplicar dato.
-- security_invoker: la vista respeta el RLS del usuario que consulta, no del dueño de la vista.
create or replace view public.vista_puestos
with (security_invoker = true) as
select
  p.id,
  p.nombre,
  p.activo,
  s.id as sesion_id,
  s.cliente_nombre,
  s.hora_inicio,
  s.empleado_id
from public.puestos p
left join public.sesiones s
  on s.puesto_id = p.id and s.estado = 'activa';

-- ============================================================
-- 4. GASTOS — costos del dia a dia (arriendo, luz, insumos, etc.)
-- ============================================================
create table if not exists public.gastos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  descripcion text not null,
  monto numeric(10, 0) not null,
  categoria text,
  admin_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists gastos_por_fecha on public.gastos (fecha);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.puestos enable row level security;
alter table public.sesiones enable row level security;
alter table public.gastos enable row level security;

-- PROFILES: cada quien ve su propio perfil; admin ve todos.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or private.is_admin());

create policy "profiles_update_admin" on public.profiles
  for update using (private.is_admin()) with check (private.is_admin());

-- PUESTOS: cualquier usuario autenticado puede ver; solo admin crea/edita/borra.
create policy "puestos_select_authenticated" on public.puestos
  for select to authenticated using (true);

create policy "puestos_write_admin" on public.puestos
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- SESIONES: admin y empleado ven todo (empleado necesita historial para atender clientes).
create policy "sesiones_select_authenticated" on public.sesiones
  for select to authenticated using (true);

-- Empleado (o admin) puede abrir una sesion, quedando como dueño de esa sesion.
create policy "sesiones_insert_propia" on public.sesiones
  for insert to authenticated with check (empleado_id = auth.uid() or private.is_admin());

-- Empleado solo cierra/edita sus propias sesiones activas; admin edita cualquiera.
create policy "sesiones_update_propia_o_admin" on public.sesiones
  for update to authenticated
  using (empleado_id = auth.uid() or private.is_admin())
  with check (empleado_id = auth.uid() or private.is_admin());

-- Solo admin puede borrar (correccion de errores).
create policy "sesiones_delete_admin" on public.sesiones
  for delete to authenticated using (private.is_admin());

-- GASTOS: solo admin, en todo (crear, ver, editar, borrar).
create policy "gastos_admin_all" on public.gastos
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- ============================================================
-- 6. INTEGRIDAD FINANCIERA
-- ============================================================
alter table public.sesiones
  add constraint controles_adicionales_no_negativo check (controles_adicionales >= 0),
  add constraint precio_manual_positivo check (precio_manual is null or precio_manual > 0),
  add constraint precio_total_no_negativo check (precio_total is null or precio_total >= 0),
  add constraint horas_cobradas_positivo check (horas_cobradas is null or horas_cobradas > 0);

-- ============================================================
-- 7. CIERRE DE SESION — calculado en el servidor, no en el navegador
-- ============================================================
-- El frontend NUNCA calcula ni envia hora_fin/horas_cobradas/precio_total.
-- Llama a esta funcion (supabase.rpc('cerrar_sesion', {...})) y el servidor
-- decide con su propio reloj y la misma formula de docs/PLAN.md. SECURITY
-- INVOKER (default): corre con los permisos del que llama, la policy
-- "sesiones_update_propia_o_admin" sigue mandando sobre quien puede cerrar que.
create or replace function public.cerrar_sesion(
  p_sesion_id bigint,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_hora_inicio timestamptz;
  v_minutos numeric;
  v_horas int;
  v_precio_base numeric;
  v_precio_total numeric;
  v_fila public.sesiones;
begin
  if p_controles_adicionales < 0 then
    raise exception 'controles_adicionales no puede ser negativo';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'precio_manual debe ser mayor a 0';
  end if;

  select hora_inicio into v_hora_inicio
  from public.sesiones
  where id = p_sesion_id and estado = 'activa';

  if v_hora_inicio is null then
    raise exception 'Sesion % no existe, ya esta cerrada, o no tienes permiso sobre ella', p_sesion_id;
  end if;

  v_minutos := extract(epoch from (now() - v_hora_inicio)) / 60.0;
  v_horas := greatest(1, ceil(v_minutos / 60.0)::int);

  v_precio_base := coalesce(
    p_precio_manual,
    case when v_horas = 1 then 6000 else 10000 + (v_horas - 2) * 5000 end
  );
  v_precio_total := v_precio_base + p_controles_adicionales * 2000;

  update public.sesiones
  set hora_fin = now(),
      horas_cobradas = v_horas,
      controles_adicionales = p_controles_adicionales,
      precio_manual = p_precio_manual,
      precio_total = v_precio_total,
      estado = 'finalizada'
  where id = p_sesion_id and estado = 'activa'
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No se pudo cerrar la sesion % (sin permiso o ya fue cerrada por otro)', p_sesion_id;
  end if;

  return v_fila;
end;
$$;

revoke all on function public.cerrar_sesion(bigint, int, numeric) from public;
grant execute on function public.cerrar_sesion(bigint, int, numeric) to authenticated;

-- ============================================================
-- 8. MODALIDADES DE COBRO — cronometrado (arriba) y conteo regresivo
-- ============================================================
-- Modalidad de cobro por sesion: cronometrado (arriba) o conteo_regresivo (tiempo fijo pactado).
alter table public.sesiones
  add column modalidad text not null default 'cronometrado'
    check (modalidad in ('cronometrado', 'conteo_regresivo')),
  add column minutos_asignados int
    check (minutos_asignados is null or minutos_asignados > 0),
  add column precio_base numeric(10, 0)
    check (precio_base is null or precio_base > 0);

-- conteo_regresivo siempre trae minutos_asignados; cronometrado nunca.
alter table public.sesiones
  add constraint modalidad_minutos_coherentes check (
    (modalidad = 'conteo_regresivo' and minutos_asignados is not null)
    or (modalidad = 'cronometrado' and minutos_asignados is null)
  );

-- La vista de estado en vivo necesita estos campos para pintar cuenta regresiva y avisos.
create or replace view public.vista_puestos
with (security_invoker = true) as
select
  p.id,
  p.nombre,
  p.activo,
  s.id as sesion_id,
  s.cliente_nombre,
  s.hora_inicio,
  s.empleado_id,
  s.modalidad,
  s.minutos_asignados,
  s.controles_adicionales,
  s.precio_total
from public.puestos p
left join public.sesiones s
  on s.puesto_id = p.id and s.estado = 'activa';

-- Abre una sesion de tiempo fijo (conteo regresivo): el precio queda pactado
-- de una vez, no depende de cuanto dure realmente la partida.
create or replace function public.abrir_sesion_regresiva(
  p_puesto_id bigint,
  p_cliente_nombre text,
  p_minutos_asignados int,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_horas int;
  v_precio_base numeric;
  v_precio_total numeric;
  v_fila public.sesiones;
begin
  if p_minutos_asignados is null or p_minutos_asignados <= 0 then
    raise exception 'minutos_asignados debe ser mayor a 0';
  end if;
  if p_controles_adicionales < 0 then
    raise exception 'controles_adicionales no puede ser negativo';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'precio_manual debe ser mayor a 0';
  end if;

  v_horas := ceil(p_minutos_asignados / 60.0)::int;
  v_precio_base := coalesce(
    p_precio_manual,
    case when v_horas = 1 then 6000 else 10000 + (v_horas - 2) * 5000 end
  );
  v_precio_total := v_precio_base + p_controles_adicionales * 2000;

  insert into public.sesiones (
    puesto_id, empleado_id, cliente_nombre, modalidad, minutos_asignados,
    horas_cobradas, controles_adicionales, precio_manual, precio_base, precio_total
  ) values (
    p_puesto_id, auth.uid(), p_cliente_nombre, 'conteo_regresivo', p_minutos_asignados,
    v_horas, p_controles_adicionales, p_precio_manual, v_precio_base, v_precio_total
  )
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke all on function public.abrir_sesion_regresiva(bigint, text, int, int, numeric) from public;
grant execute on function public.abrir_sesion_regresiva(bigint, text, int, int, numeric) to authenticated;

-- ============================================================
-- 9. TARIFA CON TRAMO DE MEDIA HORA + CONTROL ADICIONAL POR HORA
-- ============================================================
-- Nueva tabla de tarifas base (COP):
--   <=30 min -> 3.000
--   <=60 min -> 6.000
--   <=120 min -> 10.000
--   >120 min -> 10.000 + 5.000 por cada hora completa adicional
-- Control adicional: 2.000 POR HORA cobrada de la sesion (antes era plano por sesion).
-- horas_cobradas pasa de int a numeric para representar el tramo de media hora (0.5).
alter table public.sesiones
  alter column horas_cobradas type numeric(4, 1) using horas_cobradas::numeric(4, 1);

-- Helper compartido por abrir_sesion_regresiva y cerrar_sesion: una sola fuente de verdad
-- para la formula de tarifas, evita que las dos funciones se desincronicen.
create or replace function private.calcular_tarifa(p_minutos numeric, out horas numeric, out precio_base numeric)
language plpgsql
set search_path = public
immutable
as $$
begin
  if p_minutos <= 30 then
    horas := 0.5;
    precio_base := 3000;
  elsif p_minutos <= 60 then
    horas := 1;
    precio_base := 6000;
  elsif p_minutos <= 120 then
    horas := 2;
    precio_base := 10000;
  else
    horas := 2 + ceil((p_minutos - 120) / 60.0);
    precio_base := 10000 + (horas - 2) * 5000;
  end if;
end;
$$;

create or replace function public.abrir_sesion_regresiva(
  p_puesto_id bigint,
  p_cliente_nombre text,
  p_minutos_asignados int,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_tarifa record;
  v_precio_base numeric;
  v_precio_total numeric;
  v_fila public.sesiones;
begin
  if p_minutos_asignados is null or p_minutos_asignados <= 0 then
    raise exception 'minutos_asignados debe ser mayor a 0';
  end if;
  if p_controles_adicionales < 0 then
    raise exception 'controles_adicionales no puede ser negativo';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'precio_manual debe ser mayor a 0';
  end if;

  select * into v_tarifa from private.calcular_tarifa(p_minutos_asignados::numeric);
  v_precio_base := coalesce(p_precio_manual, v_tarifa.precio_base);
  v_precio_total := v_precio_base + p_controles_adicionales * 2000 * v_tarifa.horas;

  insert into public.sesiones (
    puesto_id, empleado_id, cliente_nombre, modalidad, minutos_asignados,
    horas_cobradas, controles_adicionales, precio_manual, precio_base, precio_total
  ) values (
    p_puesto_id, auth.uid(), p_cliente_nombre, 'conteo_regresivo', p_minutos_asignados,
    v_tarifa.horas, p_controles_adicionales, p_precio_manual, v_precio_base, v_precio_total
  )
  returning * into v_fila;

  return v_fila;
end;
$$;

-- Cierre de sesion, consciente de la modalidad:
-- cronometrado -> horas y precio se calculan del tiempo realmente jugado (como antes).
-- conteo_regresivo -> el precio pactado al abrir NO cambia por jugar de mas o de menos;
--   solo se permite sumar controles adicionales pedidos sobre la marcha.
create or replace function public.cerrar_sesion(
  p_sesion_id bigint,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_hora_inicio timestamptz;
  v_modalidad text;
  v_minutos_asignados int;
  v_precio_base_actual numeric;
  v_minutos numeric;
  v_tarifa record;
  v_horas numeric;
  v_precio_base numeric;
  v_precio_total numeric;
  v_fila public.sesiones;
begin
  if p_controles_adicionales < 0 then
    raise exception 'controles_adicionales no puede ser negativo';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'precio_manual debe ser mayor a 0';
  end if;

  select hora_inicio, modalidad, minutos_asignados, precio_base
    into v_hora_inicio, v_modalidad, v_minutos_asignados, v_precio_base_actual
  from public.sesiones
  where id = p_sesion_id and estado = 'activa';

  if v_hora_inicio is null then
    raise exception 'Sesion % no existe, ya esta cerrada, o no tienes permiso sobre ella', p_sesion_id;
  end if;

  if v_modalidad = 'conteo_regresivo' then
    -- Precio pactado al abrir es fijo; solo controles_adicionales puede cambiar al cerrar.
    select * into v_tarifa from private.calcular_tarifa(v_minutos_asignados::numeric);
    v_horas := v_tarifa.horas;
    v_precio_base := v_precio_base_actual;
  else
    v_minutos := extract(epoch from (now() - v_hora_inicio)) / 60.0;
    select * into v_tarifa from private.calcular_tarifa(v_minutos);
    v_horas := v_tarifa.horas;
    v_precio_base := coalesce(p_precio_manual, v_tarifa.precio_base);
  end if;

  v_precio_total := v_precio_base + p_controles_adicionales * 2000 * v_horas;

  update public.sesiones
  set hora_fin = now(),
      horas_cobradas = v_horas,
      controles_adicionales = p_controles_adicionales,
      precio_manual = case when v_modalidad = 'cronometrado' then p_precio_manual else precio_manual end,
      precio_base = v_precio_base,
      precio_total = v_precio_total,
      estado = 'finalizada'
  where id = p_sesion_id and estado = 'activa'
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No se pudo cerrar la sesion % (sin permiso o ya fue cerrada por otro)', p_sesion_id;
  end if;

  return v_fila;
end;
$$;

-- La vista de estado en vivo tambien expone precio_base, necesario en el frontend
-- para calcular el cierre de una sesion de conteo regresivo sin duplicar el cobro
-- de los controles adicionales ya incluidos en precio_total.
create or replace view public.vista_puestos
with (security_invoker = true) as
select
  p.id,
  p.nombre,
  p.activo,
  s.id as sesion_id,
  s.cliente_nombre,
  s.hora_inicio,
  s.empleado_id,
  s.modalidad,
  s.minutos_asignados,
  s.controles_adicionales,
  s.precio_total,
  s.precio_base
from public.puestos p
left join public.sesiones s
  on s.puesto_id = p.id and s.estado = 'activa';

-- ============================================================
-- 10. CONTROL ADICIONAL: 2.000 -> 5.000 POR HORA COBRADA
-- ============================================================
-- Mismo esquema de la seccion 9 (control adicional * 2000 * horas), solo cambia
-- la tarifa a 5.000 por hora por control adicional.
create or replace function public.abrir_sesion_regresiva(
  p_puesto_id bigint,
  p_cliente_nombre text,
  p_minutos_asignados int,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_tarifa record;
  v_precio_base numeric;
  v_precio_total numeric;
  v_fila public.sesiones;
begin
  if p_minutos_asignados is null or p_minutos_asignados <= 0 then
    raise exception 'minutos_asignados debe ser mayor a 0';
  end if;
  if p_controles_adicionales < 0 then
    raise exception 'controles_adicionales no puede ser negativo';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'precio_manual debe ser mayor a 0';
  end if;

  select * into v_tarifa from private.calcular_tarifa(p_minutos_asignados::numeric);
  v_precio_base := coalesce(p_precio_manual, v_tarifa.precio_base);
  v_precio_total := v_precio_base + p_controles_adicionales * 5000 * v_tarifa.horas;

  insert into public.sesiones (
    puesto_id, empleado_id, cliente_nombre, modalidad, minutos_asignados,
    horas_cobradas, controles_adicionales, precio_manual, precio_base, precio_total
  ) values (
    p_puesto_id, auth.uid(), p_cliente_nombre, 'conteo_regresivo', p_minutos_asignados,
    v_tarifa.horas, p_controles_adicionales, p_precio_manual, v_precio_base, v_precio_total
  )
  returning * into v_fila;

  return v_fila;
end;
$$;

create or replace function public.cerrar_sesion(
  p_sesion_id bigint,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_hora_inicio timestamptz;
  v_modalidad text;
  v_minutos_asignados int;
  v_precio_base_actual numeric;
  v_minutos numeric;
  v_tarifa record;
  v_horas numeric;
  v_precio_base numeric;
  v_precio_total numeric;
  v_fila public.sesiones;
begin
  if p_controles_adicionales < 0 then
    raise exception 'controles_adicionales no puede ser negativo';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'precio_manual debe ser mayor a 0';
  end if;

  select hora_inicio, modalidad, minutos_asignados, precio_base
    into v_hora_inicio, v_modalidad, v_minutos_asignados, v_precio_base_actual
  from public.sesiones
  where id = p_sesion_id and estado = 'activa';

  if v_hora_inicio is null then
    raise exception 'Sesion % no existe, ya esta cerrada, o no tienes permiso sobre ella', p_sesion_id;
  end if;

  if v_modalidad = 'conteo_regresivo' then
    select * into v_tarifa from private.calcular_tarifa(v_minutos_asignados::numeric);
    v_horas := v_tarifa.horas;
    v_precio_base := v_precio_base_actual;
  else
    v_minutos := extract(epoch from (now() - v_hora_inicio)) / 60.0;
    select * into v_tarifa from private.calcular_tarifa(v_minutos);
    v_horas := v_tarifa.horas;
    v_precio_base := coalesce(p_precio_manual, v_tarifa.precio_base);
  end if;

  v_precio_total := v_precio_base + p_controles_adicionales * 5000 * v_horas;

  update public.sesiones
  set hora_fin = now(),
      horas_cobradas = v_horas,
      controles_adicionales = p_controles_adicionales,
      precio_manual = case when v_modalidad = 'cronometrado' then p_precio_manual else precio_manual end,
      precio_base = v_precio_base,
      precio_total = v_precio_total,
      estado = 'finalizada'
  where id = p_sesion_id and estado = 'activa'
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No se pudo cerrar la sesion % (sin permiso o ya fue cerrada por otro)', p_sesion_id;
  end if;

  return v_fila;
end;
$$;

-- ============================================================
-- 11. PERMISOS SOBRE private.calcular_tarifa
-- ============================================================
-- abrir_sesion_regresiva y cerrar_sesion son SECURITY INVOKER (respetan RLS), asi que
-- el rol authenticated necesita USAGE en el esquema private para llamar al helper.
-- El esquema private no esta expuesto por la API, esto no lo publica.
grant usage on schema private to authenticated;
revoke all on function private.calcular_tarifa(numeric) from public, anon;
grant execute on function private.calcular_tarifa(numeric) to authenticated;

-- ============================================================
-- 12. ESTANDAR DE COBRO (2026-09-27) — ver docs/PLAN.md "Estandar de cobro"
-- ============================================================
-- - Tiempo redondeado a la media hora MAS CERCANA (1h14 -> 1h, 1h15 -> 1h30), minimo 30 min.
-- - Sin controles adicionales: precio por paquete (30m 3.000, 1h 6.000, 1h30 9.000,
--   2h 10.000, +2.500 por cada media hora despues de 2h).
-- - Con controles adicionales: se pierde el paquete -> 6.000 x hora
--   + 2.000 x (cada control adicional x horas que estuvo en uso).
-- - Cada control adicional se cobra solo desde que entra (tabla sesion_controles).
-- - Maximo 2 controles adicionales por sesion (4 en total).
-- - Conteo regresivo: extender tiempo recalcula el precio sobre el total.

-- Un registro por control adicional, con la hora en que entro.
create table if not exists public.sesion_controles (
  id bigint generated always as identity primary key,
  sesion_id bigint not null references public.sesiones (id) on delete cascade,
  desde timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sesion_controles_por_sesion on public.sesion_controles (sesion_id);

alter table public.sesion_controles enable row level security;

create policy "sesion_controles_select_authenticated" on public.sesion_controles
  for select to authenticated using (true);

-- Solo quien puede modificar la sesion (su empleado o un admin) puede sumarle controles.
create policy "sesion_controles_insert_propia" on public.sesion_controles
  for insert to authenticated with check (
    exists (
      select 1 from public.sesiones s
      where s.id = sesion_id and (s.empleado_id = auth.uid() or private.is_admin())
    )
  );

create policy "sesion_controles_delete_admin" on public.sesion_controles
  for delete to authenticated using (private.is_admin());

-- Horas de control adicional cobradas (suma de los controles, ya redondeadas).
alter table public.sesiones
  add column if not exists horas_controles numeric(5, 1) not null default 0;

alter table public.sesiones
  add constraint controles_adicionales_maximo check (controles_adicionales <= 2);

-- Redondeo a la media hora mas cercana; en empate (x:15, x:45) sube.
create or replace function private.redondear_horas(p_minutos numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  select floor(greatest(p_minutos, 0) / 30.0 + 0.5) * 0.5;
$$;

-- Formula unica del cobro. p_minutos_controles: minutos que estuvo en uso cada control adicional.
create or replace function private.calcular_cobro(
  p_minutos numeric,
  p_minutos_controles numeric[],
  p_precio_manual numeric,
  out horas numeric,
  out horas_controles numeric,
  out precio_base numeric,
  out precio_total numeric
)
language plpgsql
immutable
set search_path = public
as $$
begin
  horas := greatest(0.5, private.redondear_horas(p_minutos));

  select coalesce(sum(least(private.redondear_horas(m), horas)), 0)
    into horas_controles
  from unnest(coalesce(p_minutos_controles, '{}'::numeric[])) as m;

  if horas_controles = 0 then
    -- Paquete: 6.000/h hasta 1h30, 2h = 10.000, luego 5.000/h (2.500 por media hora).
    precio_base := case when horas <= 1.5 then 6000 * horas else 10000 + (horas - 2) * 5000 end;
  else
    precio_base := 6000 * horas;
  end if;

  precio_base := coalesce(p_precio_manual, precio_base);
  precio_total := precio_base + 2000 * horas_controles;
end;
$$;

-- Cobro de una sesion hasta p_fin, leyendo sus controles adicionales.
create or replace function private.cobro_sesion(
  p_sesion_id bigint,
  p_fin timestamptz,
  p_precio_manual numeric,
  out horas numeric,
  out horas_controles numeric,
  out precio_base numeric,
  out precio_total numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_controles numeric[];
begin
  select hora_inicio into v_inicio from public.sesiones where id = p_sesion_id;

  select coalesce(array_agg(extract(epoch from (p_fin - greatest(c.desde, v_inicio))) / 60.0), '{}')
    into v_controles
  from public.sesion_controles c
  where c.sesion_id = p_sesion_id and c.desde < p_fin;

  select * into horas, horas_controles, precio_base, precio_total
  from private.calcular_cobro(extract(epoch from (p_fin - v_inicio)) / 60.0, v_controles, p_precio_manual);
end;
$$;

-- Recalcula y guarda el precio pactado de una sesion de conteo regresivo activa.
create or replace function private.recalcular_regresiva(p_sesion_id bigint)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
  v_c record;
begin
  select * into v_s from public.sesiones where id = p_sesion_id;
  select * into v_c
  from private.cobro_sesion(p_sesion_id, v_s.hora_inicio + make_interval(mins => v_s.minutos_asignados), v_s.precio_manual);

  update public.sesiones
  set horas_cobradas = v_c.horas,
      horas_controles = v_c.horas_controles,
      precio_base = v_c.precio_base,
      precio_total = v_c.precio_total
  where id = p_sesion_id;
end;
$$;

-- Las funciones viejas quedan reemplazadas por las de abajo.
drop function if exists public.abrir_sesion_regresiva(bigint, text, int, int, numeric);
drop function if exists public.cerrar_sesion(bigint, int, numeric);
drop function if exists private.calcular_tarifa(numeric);

-- Abre una sesion en cualquier modalidad, con sus controles adicionales desde el inicio.
create or replace function public.abrir_sesion(
  p_puesto_id bigint,
  p_cliente_nombre text,
  p_modalidad text default 'cronometrado',
  p_minutos_asignados int default null,
  p_controles_adicionales int default 0,
  p_precio_manual numeric default null
)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_fila public.sesiones;
begin
  if p_modalidad not in ('cronometrado', 'conteo_regresivo') then
    raise exception 'Modalidad invalida: %', p_modalidad;
  end if;
  if p_modalidad = 'conteo_regresivo' and (p_minutos_asignados is null or p_minutos_asignados <= 0) then
    raise exception 'Indica cuantos minutos de conteo regresivo';
  end if;
  if p_controles_adicionales < 0 or p_controles_adicionales > 2 then
    raise exception 'Controles adicionales: minimo 0, maximo 2';
  end if;
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'El precio manual debe ser mayor a 0';
  end if;

  insert into public.sesiones (
    puesto_id, empleado_id, cliente_nombre, modalidad, minutos_asignados,
    controles_adicionales, precio_manual
  ) values (
    p_puesto_id, auth.uid(), p_cliente_nombre, p_modalidad,
    case when p_modalidad = 'conteo_regresivo' then p_minutos_asignados end,
    p_controles_adicionales,
    case when p_modalidad = 'conteo_regresivo' then p_precio_manual end
  )
  returning * into v_fila;

  insert into public.sesion_controles (sesion_id, desde)
  select v_fila.id, v_fila.hora_inicio from generate_series(1, p_controles_adicionales);

  if p_modalidad = 'conteo_regresivo' then
    perform private.recalcular_regresiva(v_fila.id);
  end if;

  select * into v_fila from public.sesiones where id = v_fila.id;
  return v_fila;
end;
$$;

-- Suma un control adicional a una sesion activa; se cobra desde este momento.
create or replace function public.agregar_control(p_sesion_id bigint)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
begin
  select * into v_s from public.sesiones where id = p_sesion_id and estado = 'activa';
  if v_s.id is null then
    raise exception 'La sesion % no esta activa', p_sesion_id;
  end if;
  if v_s.controles_adicionales >= 2 then
    raise exception 'Maximo 2 controles adicionales por PS5';
  end if;

  update public.sesiones
  set controles_adicionales = controles_adicionales + 1
  where id = p_sesion_id and estado = 'activa';
  if not found then
    raise exception 'No tienes permiso sobre la sesion %', p_sesion_id;
  end if;

  insert into public.sesion_controles (sesion_id) values (p_sesion_id);

  if v_s.modalidad = 'conteo_regresivo' then
    perform private.recalcular_regresiva(p_sesion_id);
  end if;

  select * into v_s from public.sesiones where id = p_sesion_id;
  return v_s;
end;
$$;

-- Conteo regresivo: el cliente compra mas tiempo; el precio se recalcula sobre el total.
create or replace function public.extender_sesion(p_sesion_id bigint, p_minutos int)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
begin
  if p_minutos is null or p_minutos <= 0 then
    raise exception 'Los minutos a extender deben ser mayores a 0';
  end if;

  update public.sesiones
  set minutos_asignados = minutos_asignados + p_minutos
  where id = p_sesion_id and estado = 'activa' and modalidad = 'conteo_regresivo'
  returning * into v_s;
  if v_s.id is null then
    raise exception 'La sesion % no es un conteo regresivo activo o no tienes permiso', p_sesion_id;
  end if;

  perform private.recalcular_regresiva(p_sesion_id);

  select * into v_s from public.sesiones where id = p_sesion_id;
  return v_s;
end;
$$;

-- Cierra y cobra. Cronometrado: se cobra el tiempo real jugado (reloj del servidor).
-- Conteo regresivo: se cobra el tiempo pactado, aunque jueguen de mas o de menos.
create or replace function public.cerrar_sesion(p_sesion_id bigint, p_precio_manual numeric default null)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
  v_fin timestamptz;
  v_manual numeric;
  v_c record;
begin
  if p_precio_manual is not null and p_precio_manual <= 0 then
    raise exception 'El precio manual debe ser mayor a 0';
  end if;

  select * into v_s from public.sesiones where id = p_sesion_id and estado = 'activa';
  if v_s.id is null then
    raise exception 'Sesion % no existe, ya esta cerrada, o no tienes permiso sobre ella', p_sesion_id;
  end if;

  if v_s.modalidad = 'conteo_regresivo' then
    v_fin := v_s.hora_inicio + make_interval(mins => v_s.minutos_asignados);
    v_manual := v_s.precio_manual;
  else
    v_fin := now();
    v_manual := p_precio_manual;
  end if;

  select * into v_c from private.cobro_sesion(p_sesion_id, v_fin, v_manual);

  update public.sesiones
  set hora_fin = now(),
      horas_cobradas = v_c.horas,
      horas_controles = v_c.horas_controles,
      precio_manual = v_manual,
      precio_base = v_c.precio_base,
      precio_total = v_c.precio_total,
      estado = 'finalizada'
  where id = p_sesion_id and estado = 'activa'
  returning * into v_s;

  if v_s.id is null then
    raise exception 'No se pudo cerrar la sesion % (sin permiso o ya fue cerrada por otro)', p_sesion_id;
  end if;

  return v_s;
end;
$$;

-- Permisos: las funciones publicas son SECURITY INVOKER (respetan RLS); el rol
-- authenticated necesita ejecutar los helpers de private (que no se exponen por la API).
revoke all on function private.redondear_horas(numeric) from public, anon;
revoke all on function private.calcular_cobro(numeric, numeric[], numeric) from public, anon;
revoke all on function private.cobro_sesion(bigint, timestamptz, numeric) from public, anon;
revoke all on function private.recalcular_regresiva(bigint) from public, anon;
grant execute on function private.redondear_horas(numeric) to authenticated;
grant execute on function private.calcular_cobro(numeric, numeric[], numeric) to authenticated;
grant execute on function private.cobro_sesion(bigint, timestamptz, numeric) to authenticated;
grant execute on function private.recalcular_regresiva(bigint) to authenticated;

revoke all on function public.abrir_sesion(bigint, text, text, int, int, numeric) from public, anon;
revoke all on function public.agregar_control(bigint) from public, anon;
revoke all on function public.extender_sesion(bigint, int) from public, anon;
revoke all on function public.cerrar_sesion(bigint, numeric) from public, anon;
grant execute on function public.abrir_sesion(bigint, text, text, int, int, numeric) to authenticated;
grant execute on function public.agregar_control(bigint) to authenticated;
grant execute on function public.extender_sesion(bigint, int) to authenticated;
grant execute on function public.cerrar_sesion(bigint, numeric) to authenticated;

-- La vista en vivo expone la hora de entrada de cada control adicional, para que la
-- Sala muestre "cuanto va" en cronometrado con la misma formula del servidor.
drop view if exists public.vista_puestos;
create view public.vista_puestos
with (security_invoker = true) as
select
  p.id,
  p.nombre,
  p.activo,
  s.id as sesion_id,
  s.cliente_nombre,
  s.hora_inicio,
  s.empleado_id,
  s.modalidad,
  s.minutos_asignados,
  s.controles_adicionales,
  s.precio_total,
  s.precio_base,
  s.precio_manual,
  coalesce(
    (select array_agg(c.desde order by c.desde) from public.sesion_controles c where c.sesion_id = s.id),
    '{}'
  ) as controles_desde
from public.puestos p
left join public.sesiones s
  on s.puesto_id = p.id and s.estado = 'activa';

grant select on public.vista_puestos to authenticated;
