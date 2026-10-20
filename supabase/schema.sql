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

-- ============================================================
-- 13. QUITAR CONTROLES, PRECIO FINAL EDITABLE Y ADMINISTRAR PUESTOS (2026-09-27)
-- ============================================================
-- - Un control adicional se puede quitar a mitad de sesion: se cobra solo el tiempo
--   que estuvo en uso (desde -> hasta), redondeado a la media hora mas cercana.
-- - controles_adicionales = controles adicionales EN USO ahora (maximo 2 a la vez).
-- - Al cobrar, el sistema sugiere el precio (precio_sugerido) y quien cobra puede
--   poner otro (precio_total). Quedan guardados los dos.
-- - Puestos: el admin agrega, renombra y quita (activo = false) PS5. Un puesto con
--   sesion activa no se puede quitar. Los puestos quitados no aparecen en la Sala.

alter table public.sesion_controles
  add column if not exists hasta timestamptz;

alter table public.sesion_controles
  add constraint sesion_controles_hasta_valido check (hasta is null or hasta >= desde);

create policy "sesion_controles_update_propia" on public.sesion_controles
  for update to authenticated
  using (
    exists (
      select 1 from public.sesiones s
      where s.id = sesion_id and (s.empleado_id = auth.uid() or private.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.sesiones s
      where s.id = sesion_id and (s.empleado_id = auth.uid() or private.is_admin())
    )
  );

alter table public.sesiones
  add column if not exists precio_sugerido numeric(10, 0);

-- Cada control cuenta desde que entra hasta que sale (o hasta el fin de la sesion).
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

  select coalesce(
    array_agg(extract(epoch from (least(coalesce(c.hasta, p_fin), p_fin) - greatest(c.desde, v_inicio))) / 60.0),
    '{}'
  )
    into v_controles
  from public.sesion_controles c
  where c.sesion_id = p_sesion_id and c.desde < p_fin;

  select * into horas, horas_controles, precio_base, precio_total
  from private.calcular_cobro(extract(epoch from (p_fin - v_inicio)) / 60.0, v_controles, p_precio_manual);
end;
$$;

-- Quita el control adicional mas reciente que siga en uso.
create or replace function public.quitar_control(p_sesion_id bigint)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
  v_control_id bigint;
begin
  select * into v_s from public.sesiones where id = p_sesion_id and estado = 'activa';
  if v_s.id is null then
    raise exception 'La sesion % no esta activa', p_sesion_id;
  end if;

  select id into v_control_id
  from public.sesion_controles
  where sesion_id = p_sesion_id and hasta is null
  order by desde desc, id desc
  limit 1;
  if v_control_id is null then
    raise exception 'Esta sesion no tiene controles adicionales en uso';
  end if;

  update public.sesiones
  set controles_adicionales = controles_adicionales - 1
  where id = p_sesion_id and estado = 'activa';
  if not found then
    raise exception 'No tienes permiso sobre la sesion %', p_sesion_id;
  end if;

  update public.sesion_controles set hasta = greatest(now(), desde) where id = v_control_id;

  if v_s.modalidad = 'conteo_regresivo' then
    perform private.recalcular_regresiva(p_sesion_id);
  end if;

  select * into v_s from public.sesiones where id = p_sesion_id;
  return v_s;
end;
$$;

-- Cerrar: el servidor calcula el precio sugerido; p_precio_final (si viene) es lo que se cobra.
drop function if exists public.cerrar_sesion(bigint, numeric);

create or replace function public.cerrar_sesion(p_sesion_id bigint, p_precio_final numeric default null)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
  v_fin timestamptz;
  v_c record;
begin
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio a cobrar no puede ser negativo';
  end if;

  select * into v_s from public.sesiones where id = p_sesion_id and estado = 'activa';
  if v_s.id is null then
    raise exception 'Sesion % no existe, ya esta cerrada, o no tienes permiso sobre ella', p_sesion_id;
  end if;

  if v_s.modalidad = 'conteo_regresivo' then
    v_fin := v_s.hora_inicio + make_interval(mins => v_s.minutos_asignados);
  else
    v_fin := now();
  end if;

  -- En conteo regresivo se respeta el precio especial pactado al abrir.
  select * into v_c from private.cobro_sesion(p_sesion_id, v_fin, v_s.precio_manual);

  update public.sesiones
  set hora_fin = now(),
      horas_cobradas = v_c.horas,
      horas_controles = v_c.horas_controles,
      precio_base = v_c.precio_base,
      precio_sugerido = v_c.precio_total,
      precio_total = coalesce(p_precio_final, v_c.precio_total),
      estado = 'finalizada'
  where id = p_sesion_id and estado = 'activa'
  returning * into v_s;

  if v_s.id is null then
    raise exception 'No se pudo cerrar la sesion % (sin permiso o ya fue cerrada por otro)', p_sesion_id;
  end if;

  return v_s;
end;
$$;

revoke all on function public.quitar_control(bigint) from public, anon;
revoke all on function public.cerrar_sesion(bigint, numeric) from public, anon;
grant execute on function public.quitar_control(bigint) to authenticated;
grant execute on function public.cerrar_sesion(bigint, numeric) to authenticated;

-- PUESTOS: nombre unico (sin importar mayusculas) y no se quita uno con sesion activa.
create unique index if not exists puestos_nombre_unico on public.puestos (lower(trim(nombre)));

alter table public.puestos
  add constraint puestos_nombre_no_vacio check (length(trim(nombre)) > 0);

create or replace function private.validar_puesto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.activo and not new.activo and exists (
    select 1 from public.sesiones where puesto_id = new.id and estado = 'activa'
  ) then
    raise exception '% tiene una sesion activa; cobrala antes de quitarla', old.nombre;
  end if;
  return new;
end;
$$;

drop trigger if exists puestos_validar on public.puestos;
create trigger puestos_validar
  before update on public.puestos
  for each row execute function private.validar_puesto();

-- Vista en vivo: solo puestos activos; cada control con su entrada y salida.
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
    (
      select jsonb_agg(jsonb_build_object('desde', c.desde, 'hasta', c.hasta) order by c.desde)
      from public.sesion_controles c
      where c.sesion_id = s.id
    ),
    '[]'::jsonb
  ) as controles
from public.puestos p
left join public.sesiones s
  on s.puesto_id = p.id and s.estado = 'activa'
where p.activo;

grant select on public.vista_puestos to authenticated;

-- ============================================================
-- 14. PAUSA DE TIEMPO Y TRANSFERENCIA DE CONSOLA (2026-10-19)
-- ============================================================
-- - Pausa: el tiempo pausado no se cobra (ni el de la sesion ni el de los controles
--   adicionales). En conteo regresivo el tiempo restante se congela: el fin pactado
--   se corre lo que dure la pausa.
-- - Transferir: mueve una sesion activa completa (tiempo, controles, pausas, precio)
--   a otra consola libre. Ej.: el cliente cambia de consola o la consola falla.

create table if not exists public.sesion_pausas (
  id bigint generated always as identity primary key,
  sesion_id bigint not null references public.sesiones (id) on delete cascade,
  desde timestamptz not null default now(),
  hasta timestamptz,
  created_at timestamptz not null default now(),
  constraint sesion_pausas_hasta_valido check (hasta is null or hasta >= desde)
);

create index if not exists sesion_pausas_por_sesion on public.sesion_pausas (sesion_id);

-- Solo una pausa abierta por sesion.
create unique index if not exists sesion_pausas_una_abierta
  on public.sesion_pausas (sesion_id) where hasta is null;

alter table public.sesion_pausas enable row level security;

create policy "sesion_pausas_select_authenticated" on public.sesion_pausas
  for select to authenticated using (true);

create policy "sesion_pausas_insert_propia" on public.sesion_pausas
  for insert to authenticated with check (
    exists (
      select 1 from public.sesiones s
      where s.id = sesion_id and (s.empleado_id = auth.uid() or private.is_admin())
    )
  );

create policy "sesion_pausas_update_propia" on public.sesion_pausas
  for update to authenticated
  using (
    exists (
      select 1 from public.sesiones s
      where s.id = sesion_id and (s.empleado_id = auth.uid() or private.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.sesiones s
      where s.id = sesion_id and (s.empleado_id = auth.uid() or private.is_admin())
    )
  );

create policy "sesion_pausas_delete_admin" on public.sesion_pausas
  for delete to authenticated using (private.is_admin());

-- Marca rapida para la Sala (y dispara realtime sobre sesiones).
alter table public.sesiones
  add column if not exists pausada boolean not null default false;

-- Minutos entre p_desde y p_hasta descontando las pausas de la sesion.
create or replace function private.minutos_efectivos(p_sesion_id bigint, p_desde timestamptz, p_hasta timestamptz)
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(
    0,
    extract(epoch from (p_hasta - p_desde))
      - coalesce(
          (
            select sum(greatest(0, extract(epoch from (least(coalesce(pa.hasta, now()), p_hasta) - greatest(pa.desde, p_desde)))))
            from public.sesion_pausas pa
            where pa.sesion_id = p_sesion_id
          ),
          0
        )
  ) / 60.0;
$$;

-- Duracion total de las pausas (la abierta cuenta hasta ahora).
create or replace function private.pausa_total(p_sesion_id bigint)
returns interval
language sql
stable
set search_path = public
as $$
  select coalesce(sum(coalesce(hasta, now()) - desde), interval '0')
  from public.sesion_pausas
  where sesion_id = p_sesion_id;
$$;

-- Cobro hasta p_fin, sin contar pausas (sesion y controles).
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

  select coalesce(
    array_agg(private.minutos_efectivos(p_sesion_id, greatest(c.desde, v_inicio), least(coalesce(c.hasta, p_fin), p_fin))),
    '{}'
  )
    into v_controles
  from public.sesion_controles c
  where c.sesion_id = p_sesion_id and c.desde < p_fin;

  select * into horas, horas_controles, precio_base, precio_total
  from private.calcular_cobro(private.minutos_efectivos(p_sesion_id, v_inicio, p_fin), v_controles, p_precio_manual);
end;
$$;

-- Fin pactado de un conteo regresivo: inicio + minutos asignados + pausas.
create or replace function private.fin_regresiva(p_sesion_id bigint)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select s.hora_inicio + make_interval(mins => s.minutos_asignados) + private.pausa_total(s.id)
  from public.sesiones s
  where s.id = p_sesion_id;
$$;

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
  from private.cobro_sesion(p_sesion_id, private.fin_regresiva(p_sesion_id), v_s.precio_manual);

  update public.sesiones
  set horas_cobradas = v_c.horas,
      horas_controles = v_c.horas_controles,
      precio_base = v_c.precio_base,
      precio_total = v_c.precio_total
  where id = p_sesion_id;
end;
$$;

create or replace function public.pausar_sesion(p_sesion_id bigint)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
begin
  update public.sesiones
  set pausada = true
  where id = p_sesion_id and estado = 'activa' and not pausada
  returning * into v_s;
  if v_s.id is null then
    raise exception 'La sesion % no esta activa, ya esta en pausa, o no tienes permiso', p_sesion_id;
  end if;

  insert into public.sesion_pausas (sesion_id) values (p_sesion_id);
  return v_s;
end;
$$;

create or replace function public.reanudar_sesion(p_sesion_id bigint)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
begin
  update public.sesiones
  set pausada = false
  where id = p_sesion_id and estado = 'activa' and pausada
  returning * into v_s;
  if v_s.id is null then
    raise exception 'La sesion % no esta en pausa o no tienes permiso', p_sesion_id;
  end if;

  update public.sesion_pausas set hasta = now() where sesion_id = p_sesion_id and hasta is null;
  return v_s;
end;
$$;

create or replace function public.transferir_sesion(p_sesion_id bigint, p_puesto_destino bigint)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
  v_destino public.puestos;
begin
  select * into v_s from public.sesiones where id = p_sesion_id and estado = 'activa';
  if v_s.id is null then
    raise exception 'La sesion % no esta activa', p_sesion_id;
  end if;

  select * into v_destino from public.puestos where id = p_puesto_destino;
  if v_destino.id is null or not v_destino.activo then
    raise exception 'La consola de destino no existe o no esta en la sala';
  end if;
  if v_destino.id = v_s.puesto_id then
    raise exception 'La sesion ya esta en %', v_destino.nombre;
  end if;
  if exists (select 1 from public.sesiones where puesto_id = p_puesto_destino and estado = 'activa') then
    raise exception '% esta ocupada', v_destino.nombre;
  end if;

  update public.sesiones
  set puesto_id = p_puesto_destino
  where id = p_sesion_id and estado = 'activa'
  returning * into v_s;
  if v_s.id is null then
    raise exception 'No tienes permiso sobre la sesion %', p_sesion_id;
  end if;

  return v_s;
end;
$$;

-- Cerrar: cierra la pausa abierta y descuenta pausas del cobro.
create or replace function public.cerrar_sesion(p_sesion_id bigint, p_precio_final numeric default null)
returns public.sesiones
language plpgsql
set search_path = public
as $$
declare
  v_s public.sesiones;
  v_fin timestamptz;
  v_c record;
begin
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio a cobrar no puede ser negativo';
  end if;

  select * into v_s from public.sesiones where id = p_sesion_id and estado = 'activa';
  if v_s.id is null then
    raise exception 'Sesion % no existe, ya esta cerrada, o no tienes permiso sobre ella', p_sesion_id;
  end if;

  update public.sesion_pausas set hasta = now() where sesion_id = p_sesion_id and hasta is null;

  if v_s.modalidad = 'conteo_regresivo' then
    v_fin := private.fin_regresiva(p_sesion_id);
  else
    v_fin := now();
  end if;

  select * into v_c from private.cobro_sesion(p_sesion_id, v_fin, v_s.precio_manual);

  update public.sesiones
  set hora_fin = now(),
      horas_cobradas = v_c.horas,
      horas_controles = v_c.horas_controles,
      precio_base = v_c.precio_base,
      precio_sugerido = v_c.precio_total,
      precio_total = coalesce(p_precio_final, v_c.precio_total),
      pausada = false,
      estado = 'finalizada'
  where id = p_sesion_id and estado = 'activa'
  returning * into v_s;

  if v_s.id is null then
    raise exception 'No se pudo cerrar la sesion % (sin permiso o ya fue cerrada por otro)', p_sesion_id;
  end if;

  return v_s;
end;
$$;

revoke all on function private.minutos_efectivos(bigint, timestamptz, timestamptz) from public, anon;
revoke all on function private.pausa_total(bigint) from public, anon;
revoke all on function private.fin_regresiva(bigint) from public, anon;
grant execute on function private.minutos_efectivos(bigint, timestamptz, timestamptz) to authenticated;
grant execute on function private.pausa_total(bigint) to authenticated;
grant execute on function private.fin_regresiva(bigint) to authenticated;

revoke all on function public.pausar_sesion(bigint) from public, anon;
revoke all on function public.reanudar_sesion(bigint) from public, anon;
revoke all on function public.transferir_sesion(bigint, bigint) from public, anon;
grant execute on function public.pausar_sesion(bigint) to authenticated;
grant execute on function public.reanudar_sesion(bigint) to authenticated;
grant execute on function public.transferir_sesion(bigint, bigint) to authenticated;

-- Vista en vivo: agrega estado de pausa y las pausas (columnas al final, compatible).
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
  s.precio_base,
  s.precio_manual,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('desde', c.desde, 'hasta', c.hasta) order by c.desde)
      from public.sesion_controles c
      where c.sesion_id = s.id
    ),
    '[]'::jsonb
  ) as controles,
  s.pausada,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('desde', pa.desde, 'hasta', pa.hasta) order by pa.desde)
      from public.sesion_pausas pa
      where pa.sesion_id = s.id
    ),
    '[]'::jsonb
  ) as pausas
from public.puestos p
left join public.sesiones s
  on s.puesto_id = p.id and s.estado = 'activa'
where p.activo;

-- ============================================================
-- 15. ALQUILER DE CONSOLAS, CAMBIO DE MODALIDAD Y FECHAS EN HORA DE COLOMBIA (2026-10-19)
-- ============================================================
-- Alquiler: el cliente se lleva una consola a su casa por un plan (4h, 10h, 24h o
-- La noche 7 PM a 9 AM). Cada consola sale con sus controles incluidos (2) y se le
-- pueden sumar controles sueltos del inventario. Se cobra al entregar; al devolver se
-- puede ajustar el precio (ej. recargo por entrega tarde).

create table if not exists public.alquiler_consolas (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  tipo text not null check (tipo in ('PS4', 'PS5')),
  descripcion text,
  controles_incluidos int not null default 2 check (controles_incluidos >= 0),
  activo boolean not null default true, -- false = sacada del inventario
  created_at timestamptz not null default now()
);

create unique index if not exists alquiler_consolas_nombre_unico
  on public.alquiler_consolas (lower(trim(nombre)));

create table if not exists public.alquiler_tarifas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('PS4', 'PS5')),
  nombre text not null,
  horas int check (horas is null or horas > 0), -- null = plan "La noche"
  es_noche boolean not null default false,
  precio numeric(10, 0) not null check (precio > 0),
  orden int not null default 0,
  activo boolean not null default true,
  constraint alquiler_tarifas_horas_o_noche check ((es_noche and horas is null) or (not es_noche and horas is not null))
);

-- Configuracion del negocio de alquiler (una sola fila).
create table if not exists public.alquiler_config (
  id int primary key default 1 check (id = 1),
  controles_sueltos int not null default 0 check (controles_sueltos >= 0),
  precio_control_extra numeric(10, 0) not null default 0 check (precio_control_extra >= 0),
  noche_desde time not null default '19:00',
  noche_hasta time not null default '09:00'
);

create table if not exists public.alquileres (
  id bigint generated always as identity primary key,
  consola_id bigint not null references public.alquiler_consolas (id),
  empleado_id uuid not null references public.profiles (id) default auth.uid(),
  cliente_nombre text not null check (length(trim(cliente_nombre)) > 0),
  cliente_telefono text,
  cliente_direccion text,
  tarifa_id bigint references public.alquiler_tarifas (id),
  plan_nombre text not null,
  inicio timestamptz not null default now(),
  fin_pactado timestamptz not null,
  devuelto_en timestamptz,
  controles int not null default 2 check (controles >= 0),
  controles_extra int not null default 0 check (controles_extra >= 0),
  precio_sugerido numeric(10, 0),
  precio_total numeric(10, 0) not null check (precio_total >= 0),
  estado text not null default 'activo' check (estado in ('activo', 'devuelto', 'cancelado')),
  notas text,
  created_at timestamptz not null default now()
);

create unique index if not exists alquileres_uno_activo_por_consola
  on public.alquileres (consola_id) where estado = 'activo';
create index if not exists alquileres_por_inicio on public.alquileres (inicio);

alter table public.alquiler_consolas enable row level security;
alter table public.alquiler_tarifas enable row level security;
alter table public.alquiler_config enable row level security;
alter table public.alquileres enable row level security;

-- Inventario, tarifas y configuracion: todos ven, solo admin cambia.
create policy "alquiler_consolas_select" on public.alquiler_consolas for select to authenticated using (true);
create policy "alquiler_consolas_admin" on public.alquiler_consolas for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "alquiler_tarifas_select" on public.alquiler_tarifas for select to authenticated using (true);
create policy "alquiler_tarifas_admin" on public.alquiler_tarifas for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "alquiler_config_select" on public.alquiler_config for select to authenticated using (true);
create policy "alquiler_config_admin" on public.alquiler_config for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Alquileres: cualquier empleado entrega y recibe (un alquiler dura horas y puede
-- recibirlo otro turno); solo admin borra.
create policy "alquileres_select" on public.alquileres for select to authenticated using (true);
create policy "alquileres_insert" on public.alquileres for insert to authenticated
  with check (empleado_id = auth.uid() or private.is_admin());
create policy "alquileres_update" on public.alquileres for update to authenticated using (true) with check (true);
create policy "alquileres_delete_admin" on public.alquileres for delete to authenticated using (private.is_admin());

-- Fin del plan: horas fijas, o "La noche" hasta la proxima hora de cierre (9 AM Colombia).
create or replace function private.fin_alquiler(p_inicio timestamptz, p_tarifa public.alquiler_tarifas)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_hasta time;
  v_local timestamp;
  v_fin_local timestamp;
begin
  if not p_tarifa.es_noche then
    return p_inicio + make_interval(hours => p_tarifa.horas);
  end if;
  select noche_hasta into v_hasta from public.alquiler_config where id = 1;
  v_local := p_inicio at time zone 'America/Bogota';
  v_fin_local := date_trunc('day', v_local) + coalesce(v_hasta, '09:00');
  if v_fin_local <= v_local then
    v_fin_local := v_fin_local + interval '1 day';
  end if;
  return v_fin_local at time zone 'America/Bogota';
end;
$$;

-- Controles sueltos libres = inventario - los que estan afuera en alquileres activos.
create or replace function public.alquiler_controles_libres()
returns int
language sql
stable
set search_path = public
as $$
  select coalesce((select controles_sueltos from public.alquiler_config where id = 1), 0)
       - coalesce((select sum(controles_extra) from public.alquileres where estado = 'activo'), 0)::int;
$$;

create or replace function public.alquilar_consola(
  p_consola_id bigint,
  p_tarifa_id bigint,
  p_cliente_nombre text,
  p_cliente_telefono text default null,
  p_cliente_direccion text default null,
  p_controles_extra int default 0,
  p_precio_final numeric default null,
  p_notas text default null
)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_consola public.alquiler_consolas;
  v_tarifa public.alquiler_tarifas;
  v_precio_extra numeric;
  v_sugerido numeric;
  v_fila public.alquileres;
begin
  select * into v_consola from public.alquiler_consolas where id = p_consola_id;
  if v_consola.id is null or not v_consola.activo then
    raise exception 'La consola no existe o no esta en el inventario';
  end if;
  if exists (select 1 from public.alquileres where consola_id = p_consola_id and estado = 'activo') then
    raise exception '% ya esta alquilada', v_consola.nombre;
  end if;

  select * into v_tarifa from public.alquiler_tarifas where id = p_tarifa_id and activo;
  if v_tarifa.id is null or v_tarifa.tipo <> v_consola.tipo then
    raise exception 'Elige un plan de %', v_consola.tipo;
  end if;
  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'Escribe el nombre del cliente';
  end if;
  if p_controles_extra < 0 then
    raise exception 'Los controles extra no pueden ser negativos';
  end if;
  if p_controles_extra > public.alquiler_controles_libres() then
    raise exception 'Solo hay % control(es) suelto(s) disponible(s)', public.alquiler_controles_libres();
  end if;
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  select precio_control_extra into v_precio_extra from public.alquiler_config where id = 1;
  v_sugerido := v_tarifa.precio + p_controles_extra * coalesce(v_precio_extra, 0);

  insert into public.alquileres (
    consola_id, empleado_id, cliente_nombre, cliente_telefono, cliente_direccion,
    tarifa_id, plan_nombre, inicio, fin_pactado, controles, controles_extra,
    precio_sugerido, precio_total, notas
  ) values (
    p_consola_id, auth.uid(), trim(p_cliente_nombre), nullif(trim(p_cliente_telefono), ''),
    nullif(trim(p_cliente_direccion), ''), v_tarifa.id, v_tarifa.nombre, now(),
    private.fin_alquiler(now(), v_tarifa), v_consola.controles_incluidos + p_controles_extra,
    p_controles_extra, v_sugerido, coalesce(p_precio_final, v_sugerido), nullif(trim(p_notas), '')
  )
  returning * into v_fila;

  return v_fila;
end;
$$;

-- Devolucion: libera consola y controles; p_precio_final ajusta el cobro (ej. recargo).
create or replace function public.devolver_alquiler(
  p_alquiler_id bigint,
  p_precio_final numeric default null,
  p_notas text default null
)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_fila public.alquileres;
begin
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  update public.alquileres
  set estado = 'devuelto',
      devuelto_en = now(),
      precio_total = coalesce(p_precio_final, precio_total),
      notas = coalesce(nullif(trim(p_notas), ''), notas)
  where id = p_alquiler_id and estado = 'activo'
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'El alquiler % no esta activo', p_alquiler_id;
  end if;
  return v_fila;
end;
$$;

create or replace function public.cancelar_alquiler(p_alquiler_id bigint)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_fila public.alquileres;
begin
  update public.alquileres
  set estado = 'cancelado', devuelto_en = now()
  where id = p_alquiler_id and estado = 'activo'
  returning * into v_fila;
  if v_fila.id is null then
    raise exception 'El alquiler % no esta activo', p_alquiler_id;
  end if;
  return v_fila;
end;
$$;

-- Estado del inventario en vivo: cada consola con su alquiler activo, si tiene.
create or replace view public.vista_alquiler_consolas
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.tipo,
  c.descripcion,
  c.controles_incluidos,
  c.activo,
  a.id as alquiler_id,
  a.cliente_nombre,
  a.cliente_telefono,
  a.cliente_direccion,
  a.plan_nombre,
  a.inicio,
  a.fin_pactado,
  a.controles,
  a.controles_extra,
  a.precio_total,
  a.notas
from public.alquiler_consolas c
left join public.alquileres a on a.consola_id = c.id and a.estado = 'activo';

revoke all on function private.fin_alquiler(timestamptz, public.alquiler_tarifas) from public, anon;
grant execute on function private.fin_alquiler(timestamptz, public.alquiler_tarifas) to authenticated;
revoke all on function public.alquiler_controles_libres() from public, anon;
revoke all on function public.alquilar_consola(bigint, bigint, text, text, text, int, numeric, text) from public, anon;
revoke all on function public.devolver_alquiler(bigint, numeric, text) from public, anon;
revoke all on function public.cancelar_alquiler(bigint) from public, anon;
grant execute on function public.alquiler_controles_libres() to authenticated;
grant execute on function public.alquilar_consola(bigint, bigint, text, text, text, int, numeric, text) to authenticated;
grant execute on function public.devolver_alquiler(bigint, numeric, text) to authenticated;
grant execute on function public.cancelar_alquiler(bigint) to authenticated;

-- Datos iniciales (2026-10-19): inventario y precios del afiche de alquiler.
insert into public.alquiler_config (id, controles_sueltos, precio_control_extra) values (1, 2, 0)
on conflict (id) do nothing;

insert into public.alquiler_consolas (nombre, tipo, descripcion, controles_incluidos) values
  ('PS5 Slim', 'PS5', '2 controles originales', 2),
  ('PS4 Programada 1', 'PS4', 'Programada', 2),
  ('PS4 Programada 2', 'PS4', 'Programada', 2),
  ('PS4 Original', 'PS4', 'Original', 2)
on conflict do nothing;

insert into public.alquiler_tarifas (tipo, nombre, horas, es_noche, precio, orden)
select * from (values
  ('PS4', '4 horas', 4, false, 20000, 1),
  ('PS4', '10 horas', 10, false, 35000, 2),
  ('PS4', '24 horas', 24, false, 50000, 3),
  ('PS4', 'La noche (7 PM a 9 AM)', null::int, true, 30000, 4),
  ('PS5', '10 horas', 10, false, 40000, 1),
  ('PS5', '24 horas', 24, false, 75000, 2),
  ('PS5', 'La noche (7 PM a 9 AM)', null::int, true, 50000, 3)
) as t(tipo, nombre, horas, es_noche, precio, orden)
where not exists (select 1 from public.alquiler_tarifas);

-- ── Sala: cambiar de modalidad con la sesion abierta ──────────────────────
-- A conteo regresivo: p_minutos es el tiempo TOTAL pactado (incluye lo ya jugado);
-- el precio queda pactado con el estandar. A cronometrado: se cobra al cerrar por
-- tiempo real, como si hubiera empezado cronometrado.
create or replace function public.cambiar_modalidad(
  p_sesion_id bigint,
  p_modalidad text,
  p_minutos int default null
)
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
  if p_modalidad not in ('cronometrado', 'conteo_regresivo') then
    raise exception 'Modalidad invalida: %', p_modalidad;
  end if;
  if p_modalidad = v_s.modalidad and p_modalidad = 'cronometrado' then
    raise exception 'La sesion ya es cronometrada';
  end if;

  if p_modalidad = 'conteo_regresivo' then
    if p_minutos is null or p_minutos <= 0 then
      raise exception 'Indica el tiempo total del conteo regresivo';
    end if;
    update public.sesiones
    set modalidad = 'conteo_regresivo', minutos_asignados = p_minutos
    where id = p_sesion_id and estado = 'activa'
    returning * into v_s;
    if v_s.id is null then
      raise exception 'No tienes permiso sobre la sesion %', p_sesion_id;
    end if;
    perform private.recalcular_regresiva(p_sesion_id);
  else
    update public.sesiones
    set modalidad = 'cronometrado',
        minutos_asignados = null,
        precio_manual = null,
        horas_cobradas = null,
        horas_controles = 0,
        precio_base = null,
        precio_total = null
    where id = p_sesion_id and estado = 'activa'
    returning * into v_s;
    if v_s.id is null then
      raise exception 'No tienes permiso sobre la sesion %', p_sesion_id;
    end if;
  end if;

  select * into v_s from public.sesiones where id = p_sesion_id;
  return v_s;
end;
$$;

revoke all on function public.cambiar_modalidad(bigint, text, int) from public, anon;
grant execute on function public.cambiar_modalidad(bigint, text, int) to authenticated;

-- Gastos: "hoy" en hora de Colombia, no en UTC del servidor.
alter table public.gastos alter column fecha set default (now() at time zone 'America/Bogota')::date;

-- ============================================================
-- 16. REALTIME (2026-10-19)
-- ============================================================
-- La Sala y el Alquiler se suscriben a cambios para sincronizar varios dispositivos.
-- Sin estas tablas en la publicacion, cada pantalla solo veia sus propios cambios.
alter publication supabase_realtime add table public.sesiones, public.alquileres;

-- ============================================================
-- 17. EXTENSIONES DE ALQUILER, CONTRATOS ADJUNTOS Y PRECIO DE CONTROL EXTRA (2026-10-19)
-- ============================================================
-- - Control extra en alquiler: $5.000 (precio sugerido, editable al registrar).
-- - Extension: el cliente pide mas tiempo y paga. La nueva entrega se cuenta desde
--   el fin pactado actual (sin huecos). Cada pago queda en alquiler_extensiones con
--   su fecha, para que cuente en ventas el dia en que se recibe.
-- - Contratos: fotos o PDF del contrato fisico firmado, en el bucket privado
--   "contratos", carpeta = id del alquiler.

update public.alquiler_config set precio_control_extra = 5000 where id = 1;

create table if not exists public.alquiler_extensiones (
  id bigint generated always as identity primary key,
  alquiler_id bigint not null references public.alquileres (id) on delete cascade,
  empleado_id uuid not null references public.profiles (id) default auth.uid(),
  tarifa_id bigint references public.alquiler_tarifas (id),
  descripcion text not null,
  fin_anterior timestamptz not null,
  fin_nuevo timestamptz not null,
  precio_sugerido numeric(10, 0),
  precio numeric(10, 0) not null check (precio >= 0),
  created_at timestamptz not null default now(),
  constraint alquiler_extensiones_fin_valido check (fin_nuevo > fin_anterior)
);

create index if not exists alquiler_extensiones_por_alquiler on public.alquiler_extensiones (alquiler_id);
create index if not exists alquiler_extensiones_por_fecha on public.alquiler_extensiones (created_at);

alter table public.alquiler_extensiones enable row level security;

create policy "alquiler_extensiones_select" on public.alquiler_extensiones
  for select to authenticated using (true);
create policy "alquiler_extensiones_insert" on public.alquiler_extensiones
  for insert to authenticated with check (empleado_id = auth.uid() or private.is_admin());
create policy "alquiler_extensiones_delete_admin" on public.alquiler_extensiones
  for delete to authenticated using (private.is_admin());

-- Extiende un alquiler activo por un plan (p_tarifa_id) o por horas sueltas (p_horas,
-- con precio obligatorio). El precio sugerido del plan incluye los controles extra.
create or replace function public.extender_alquiler(
  p_alquiler_id bigint,
  p_tarifa_id bigint default null,
  p_horas int default null,
  p_precio_final numeric default null
)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_a public.alquileres;
  v_consola public.alquiler_consolas;
  v_tarifa public.alquiler_tarifas;
  v_precio_extra numeric;
  v_fin_nuevo timestamptz;
  v_descripcion text;
  v_sugerido numeric;
  v_precio numeric;
begin
  select * into v_a from public.alquileres where id = p_alquiler_id and estado = 'activo';
  if v_a.id is null then
    raise exception 'El alquiler % no esta activo', p_alquiler_id;
  end if;
  if (p_tarifa_id is null) = (p_horas is null) then
    raise exception 'Elige un plan o un numero de horas para extender';
  end if;
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  select * into v_consola from public.alquiler_consolas where id = v_a.consola_id;

  if p_tarifa_id is not null then
    select * into v_tarifa from public.alquiler_tarifas where id = p_tarifa_id and activo;
    if v_tarifa.id is null or v_tarifa.tipo <> v_consola.tipo then
      raise exception 'Elige un plan de %', v_consola.tipo;
    end if;
    select precio_control_extra into v_precio_extra from public.alquiler_config where id = 1;
    v_fin_nuevo := private.fin_alquiler(v_a.fin_pactado, v_tarifa);
    v_descripcion := v_tarifa.nombre;
    v_sugerido := v_tarifa.precio + v_a.controles_extra * coalesce(v_precio_extra, 0);
  else
    if p_horas <= 0 then
      raise exception 'Las horas deben ser mayores a 0';
    end if;
    v_fin_nuevo := v_a.fin_pactado + make_interval(hours => p_horas);
    v_descripcion := p_horas || (case when p_horas = 1 then ' hora' else ' horas' end);
    v_sugerido := null;
  end if;

  v_precio := coalesce(p_precio_final, v_sugerido);
  if v_precio is null then
    raise exception 'Escribe el precio de la extension';
  end if;

  insert into public.alquiler_extensiones (
    alquiler_id, empleado_id, tarifa_id, descripcion, fin_anterior, fin_nuevo, precio_sugerido, precio
  ) values (
    v_a.id, auth.uid(), v_tarifa.id, v_descripcion, v_a.fin_pactado, v_fin_nuevo, v_sugerido, v_precio
  );

  update public.alquileres set fin_pactado = v_fin_nuevo where id = v_a.id and estado = 'activo'
  returning * into v_a;
  if v_a.id is null then
    raise exception 'No se pudo extender el alquiler %', p_alquiler_id;
  end if;

  return v_a;
end;
$$;

revoke all on function public.extender_alquiler(bigint, bigint, int, numeric) from public, anon;
grant execute on function public.extender_alquiler(bigint, bigint, int, numeric) to authenticated;

-- Vista en vivo: agrega lo pagado en extensiones (columnas al final, compatible).
create or replace view public.vista_alquiler_consolas
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.tipo,
  c.descripcion,
  c.controles_incluidos,
  c.activo,
  a.id as alquiler_id,
  a.cliente_nombre,
  a.cliente_telefono,
  a.cliente_direccion,
  a.plan_nombre,
  a.inicio,
  a.fin_pactado,
  a.controles,
  a.controles_extra,
  a.precio_total,
  a.notas,
  coalesce((select count(*) from public.alquiler_extensiones e where e.alquiler_id = a.id), 0)::int as extensiones,
  coalesce((select sum(e.precio) from public.alquiler_extensiones e where e.alquiler_id = a.id), 0) as total_extensiones
from public.alquiler_consolas c
left join public.alquileres a on a.consola_id = c.id and a.estado = 'activo';

-- ── Contratos (Supabase Storage) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contratos', 'contratos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

create policy "contratos_select" on storage.objects
  for select to authenticated using (bucket_id = 'contratos');
create policy "contratos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'contratos');
create policy "contratos_delete_admin" on storage.objects
  for delete to authenticated using (bucket_id = 'contratos' and private.is_admin());

alter publication supabase_realtime add table public.alquiler_extensiones;

-- ============================================================
-- 18. POTES DE ALQUILER Y PS5 POR 4 HORAS (2026-10-19)
-- ============================================================
-- Potes: donde entra el dinero del alquiler.
--   llave    = cuenta Daviplata ("Pote Llave")
--   efectivo = dinero fisico ("Pote Efectivo")
-- Cada cobro (entrega, extension o ajuste al recibir) se registra en alquiler_pagos,
-- y se puede dividir entre los dos potes. La suma de los pagos = lo cobrado.

insert into public.alquiler_tarifas (tipo, nombre, horas, es_noche, precio, orden)
select 'PS5', '4 horas', 4, false, 30000, 0
where not exists (select 1 from public.alquiler_tarifas where tipo = 'PS5' and horas = 4);

create table if not exists public.alquiler_pagos (
  id bigint generated always as identity primary key,
  alquiler_id bigint not null references public.alquileres (id) on delete cascade,
  extension_id bigint references public.alquiler_extensiones (id) on delete cascade,
  concepto text not null check (concepto in ('entrega', 'extension', 'ajuste')),
  pote text not null check (pote in ('llave', 'efectivo')),
  monto numeric(10, 0) not null check (monto <> 0), -- negativo = devolucion (solo en ajuste)
  empleado_id uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint alquiler_pagos_negativo_solo_ajuste check (monto > 0 or concepto = 'ajuste')
);

create index if not exists alquiler_pagos_por_alquiler on public.alquiler_pagos (alquiler_id);
create index if not exists alquiler_pagos_por_fecha on public.alquiler_pagos (created_at);

alter table public.alquiler_pagos enable row level security;

create policy "alquiler_pagos_select" on public.alquiler_pagos
  for select to authenticated using (true);
create policy "alquiler_pagos_insert" on public.alquiler_pagos
  for insert to authenticated with check (empleado_id = auth.uid() or private.is_admin());
create policy "alquiler_pagos_delete_admin" on public.alquiler_pagos
  for delete to authenticated using (private.is_admin());

-- Reparte un cobro entre los potes. Si solo viene un monto, el otro es el resto.
create or replace function private.registrar_pagos(
  p_alquiler_id bigint,
  p_extension_id bigint,
  p_concepto text,
  p_total numeric,
  p_llave numeric,
  p_efectivo numeric
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_llave numeric := p_llave;
  v_efectivo numeric := p_efectivo;
begin
  if p_total = 0 then
    return;
  end if;
  if v_llave is null and v_efectivo is null then
    raise exception 'Indica en que pote entra el dinero (Llave o Efectivo)';
  end if;
  if v_llave is null then
    v_llave := p_total - v_efectivo;
  elsif v_efectivo is null then
    v_efectivo := p_total - v_llave;
  end if;
  if p_concepto <> 'ajuste' and (v_llave < 0 or v_efectivo < 0) then
    raise exception 'Los montos por pote no pueden ser negativos';
  end if;
  if v_llave + v_efectivo <> p_total then
    raise exception 'Llave (%) + Efectivo (%) no suman el total (%)', v_llave, v_efectivo, p_total;
  end if;

  if v_llave <> 0 then
    insert into public.alquiler_pagos (alquiler_id, extension_id, concepto, pote, monto)
    values (p_alquiler_id, p_extension_id, p_concepto, 'llave', v_llave);
  end if;
  if v_efectivo <> 0 then
    insert into public.alquiler_pagos (alquiler_id, extension_id, concepto, pote, monto)
    values (p_alquiler_id, p_extension_id, p_concepto, 'efectivo', v_efectivo);
  end if;
end;
$$;

revoke all on function private.registrar_pagos(bigint, bigint, text, numeric, numeric, numeric) from public, anon;
grant execute on function private.registrar_pagos(bigint, bigint, text, numeric, numeric, numeric) to authenticated;

-- Alquilar: mismo comportamiento + pago por potes.
drop function if exists public.alquilar_consola(bigint, bigint, text, text, text, int, numeric, text);

create or replace function public.alquilar_consola(
  p_consola_id bigint,
  p_tarifa_id bigint,
  p_cliente_nombre text,
  p_cliente_telefono text default null,
  p_cliente_direccion text default null,
  p_controles_extra int default 0,
  p_precio_final numeric default null,
  p_notas text default null,
  p_pago_llave numeric default null,
  p_pago_efectivo numeric default null
)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_consola public.alquiler_consolas;
  v_tarifa public.alquiler_tarifas;
  v_precio_extra numeric;
  v_sugerido numeric;
  v_fila public.alquileres;
begin
  select * into v_consola from public.alquiler_consolas where id = p_consola_id;
  if v_consola.id is null or not v_consola.activo then
    raise exception 'La consola no existe o no esta en el inventario';
  end if;
  if exists (select 1 from public.alquileres where consola_id = p_consola_id and estado = 'activo') then
    raise exception '% ya esta alquilada', v_consola.nombre;
  end if;

  select * into v_tarifa from public.alquiler_tarifas where id = p_tarifa_id and activo;
  if v_tarifa.id is null or v_tarifa.tipo <> v_consola.tipo then
    raise exception 'Elige un plan de %', v_consola.tipo;
  end if;
  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'Escribe el nombre del cliente';
  end if;
  if p_controles_extra < 0 then
    raise exception 'Los controles extra no pueden ser negativos';
  end if;
  if p_controles_extra > public.alquiler_controles_libres() then
    raise exception 'Solo hay % control(es) suelto(s) disponible(s)', public.alquiler_controles_libres();
  end if;
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  select precio_control_extra into v_precio_extra from public.alquiler_config where id = 1;
  v_sugerido := v_tarifa.precio + p_controles_extra * coalesce(v_precio_extra, 0);

  insert into public.alquileres (
    consola_id, empleado_id, cliente_nombre, cliente_telefono, cliente_direccion,
    tarifa_id, plan_nombre, inicio, fin_pactado, controles, controles_extra,
    precio_sugerido, precio_total, notas
  ) values (
    p_consola_id, auth.uid(), trim(p_cliente_nombre), nullif(trim(p_cliente_telefono), ''),
    nullif(trim(p_cliente_direccion), ''), v_tarifa.id, v_tarifa.nombre, now(),
    private.fin_alquiler(now(), v_tarifa), v_consola.controles_incluidos + p_controles_extra,
    p_controles_extra, v_sugerido, coalesce(p_precio_final, v_sugerido), nullif(trim(p_notas), '')
  )
  returning * into v_fila;

  perform private.registrar_pagos(v_fila.id, null, 'entrega', v_fila.precio_total, p_pago_llave, p_pago_efectivo);

  return v_fila;
end;
$$;

-- Extender: mismo comportamiento + pago por potes.
drop function if exists public.extender_alquiler(bigint, bigint, int, numeric);

create or replace function public.extender_alquiler(
  p_alquiler_id bigint,
  p_tarifa_id bigint default null,
  p_horas int default null,
  p_precio_final numeric default null,
  p_pago_llave numeric default null,
  p_pago_efectivo numeric default null
)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_a public.alquileres;
  v_consola public.alquiler_consolas;
  v_tarifa public.alquiler_tarifas;
  v_precio_extra numeric;
  v_fin_nuevo timestamptz;
  v_descripcion text;
  v_sugerido numeric;
  v_precio numeric;
  v_extension_id bigint;
begin
  select * into v_a from public.alquileres where id = p_alquiler_id and estado = 'activo';
  if v_a.id is null then
    raise exception 'El alquiler % no esta activo', p_alquiler_id;
  end if;
  if (p_tarifa_id is null) = (p_horas is null) then
    raise exception 'Elige un plan o un numero de horas para extender';
  end if;
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  select * into v_consola from public.alquiler_consolas where id = v_a.consola_id;

  if p_tarifa_id is not null then
    select * into v_tarifa from public.alquiler_tarifas where id = p_tarifa_id and activo;
    if v_tarifa.id is null or v_tarifa.tipo <> v_consola.tipo then
      raise exception 'Elige un plan de %', v_consola.tipo;
    end if;
    select precio_control_extra into v_precio_extra from public.alquiler_config where id = 1;
    v_fin_nuevo := private.fin_alquiler(v_a.fin_pactado, v_tarifa);
    v_descripcion := v_tarifa.nombre;
    v_sugerido := v_tarifa.precio + v_a.controles_extra * coalesce(v_precio_extra, 0);
  else
    if p_horas <= 0 then
      raise exception 'Las horas deben ser mayores a 0';
    end if;
    v_fin_nuevo := v_a.fin_pactado + make_interval(hours => p_horas);
    v_descripcion := p_horas || (case when p_horas = 1 then ' hora' else ' horas' end);
    v_sugerido := null;
  end if;

  v_precio := coalesce(p_precio_final, v_sugerido);
  if v_precio is null then
    raise exception 'Escribe el precio de la extension';
  end if;

  insert into public.alquiler_extensiones (
    alquiler_id, empleado_id, tarifa_id, descripcion, fin_anterior, fin_nuevo, precio_sugerido, precio
  ) values (
    v_a.id, auth.uid(), v_tarifa.id, v_descripcion, v_a.fin_pactado, v_fin_nuevo, v_sugerido, v_precio
  )
  returning id into v_extension_id;

  perform private.registrar_pagos(v_a.id, v_extension_id, 'extension', v_precio, p_pago_llave, p_pago_efectivo);

  update public.alquileres set fin_pactado = v_fin_nuevo where id = v_a.id and estado = 'activo'
  returning * into v_a;
  if v_a.id is null then
    raise exception 'No se pudo extender el alquiler %', p_alquiler_id;
  end if;

  return v_a;
end;
$$;

-- Devolver: si se cambia el precio, la diferencia (positiva o negativa) va a un pote.
drop function if exists public.devolver_alquiler(bigint, numeric, text);

create or replace function public.devolver_alquiler(
  p_alquiler_id bigint,
  p_precio_final numeric default null,
  p_notas text default null,
  p_pote_ajuste text default null
)
returns public.alquileres
language plpgsql
set search_path = public
as $$
declare
  v_fila public.alquileres;
  v_diferencia numeric;
begin
  if p_precio_final is not null and p_precio_final < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  select * into v_fila from public.alquileres where id = p_alquiler_id and estado = 'activo';
  if v_fila.id is null then
    raise exception 'El alquiler % no esta activo', p_alquiler_id;
  end if;

  v_diferencia := coalesce(p_precio_final, v_fila.precio_total) - v_fila.precio_total;
  if v_diferencia <> 0 then
    if p_pote_ajuste not in ('llave', 'efectivo') or p_pote_ajuste is null then
      raise exception 'Indica en que pote entra (o sale) la diferencia';
    end if;
    insert into public.alquiler_pagos (alquiler_id, concepto, pote, monto)
    values (p_alquiler_id, 'ajuste', p_pote_ajuste, v_diferencia);
  end if;

  update public.alquileres
  set estado = 'devuelto',
      devuelto_en = now(),
      precio_total = coalesce(p_precio_final, precio_total),
      notas = coalesce(nullif(trim(p_notas), ''), notas)
  where id = p_alquiler_id and estado = 'activo'
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'El alquiler % no esta activo', p_alquiler_id;
  end if;
  return v_fila;
end;
$$;

revoke all on function public.alquilar_consola(bigint, bigint, text, text, text, int, numeric, text, numeric, numeric) from public, anon;
revoke all on function public.extender_alquiler(bigint, bigint, int, numeric, numeric, numeric) from public, anon;
revoke all on function public.devolver_alquiler(bigint, numeric, text, text) from public, anon;
grant execute on function public.alquilar_consola(bigint, bigint, text, text, text, int, numeric, text, numeric, numeric) to authenticated;
grant execute on function public.extender_alquiler(bigint, bigint, int, numeric, numeric, numeric) to authenticated;
grant execute on function public.devolver_alquiler(bigint, numeric, text, text) to authenticated;

alter publication supabase_realtime add table public.alquiler_pagos;
