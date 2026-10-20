# Alfa Games — contexto para Claude

App para administrar una sala de videojuegos (5 PS5): sesiones en vivo, cobro, historial, gastos y ganancia diaria. El dueño escribe en español; responde en español.

- `app/`: Angular 22 (standalone, zoneless, signals, Tailwind). Pruebas con Vitest (`npm test`).
- `supabase/schema.sql`: historial del esquema por secciones numeradas. **Cada cambio de base de datos va como una sección nueva al final**; no se editan las anteriores.
- `docs/PLAN.md`: reglas de negocio confirmadas. La sección **"Estándar de cobro"** es la fuente de verdad de las tarifas.

## Cobro: dos implementaciones que deben coincidir

- Servidor (lo que se cobra de verdad): `private.calcular_cobro` y `private.cobro_sesion` en Supabase, usadas por las RPC `abrir_sesion`, `agregar_control`, `quitar_control`, `extender_sesion`, `pausar_sesion`, `reanudar_sesion`, `transferir_sesion` y `cerrar_sesion`. Las pausas viven en `sesion_pausas` y se descuentan con `private.minutos_efectivos`; el fin de un conteo regresivo es `private.fin_regresiva` (inicio + minutos asignados + pausas). Cada control adicional es una fila de `sesion_controles` (`desde`/`hasta`). `cerrar_sesion` guarda `precio_sugerido` y acepta un `p_precio_final` opcional que decide quien cobra.
- Front (solo vista previa): `app/src/app/core/pricing.ts`, con pruebas en `pricing.spec.ts` que usan la tabla de ejemplos del negocio.

Si cambia una tarifa, actualiza los dos lados, `docs/PLAN.md` y los casos de `pricing.spec.ts`.

## Alquiler de consolas

Módulo aparte (página `/alquiler`): tablas `alquiler_consolas`, `alquiler_tarifas`, `alquiler_config` (fila única: controles sueltos y precio por control extra) y `alquileres`; vista `vista_alquiler_consolas`; RPC `alquilar_consola`, `extender_alquiler` (pagos en `alquiler_extensiones`), `devolver_alquiler`, `cancelar_alquiler`, `alquiler_controles_libres`. Pagos por pote (`llave` = Daviplata, `efectivo`) en `alquiler_pagos`, repartidos por `private.registrar_pagos`; componente `shared/pago-potes.ts`. Ficha por consola (`capacidad`, `juegos`, `detalles`) copiada al alquiler (`juegos_entregados`, `detalles_entregados`). Movimientos de dinero en `pote_movimientos` (solo admin), saldos en `vista_potes`, préstamos en `vista_prestamos_pendientes`. Contratos en el bucket privado `contratos` de Storage (`<alquiler_id>/<archivo>`), componente `shared/contratos.ts`. Reglas en `docs/PLAN.md`.

## Fechas

Todo en hora de Colombia: usar `app/src/app/core/zona-horaria.ts` para días y filtros (nunca `toISOString().slice(0, 10)` para "hoy"). `DatePipe` ya viene configurado con locale `es-CO` y zona `-0500` en `app.config.ts`.

## Supabase

- Proyecto: `xncbflbvcggrnoypaqcr`. La URL y la clave publishable de `app/src/environments/` son públicas por diseño; la seguridad la da RLS. Nunca subas la `service_role` key.
- Las funciones públicas son `SECURITY INVOKER` (respetan RLS). Los helpers viven en el esquema `private` (no expuesto por la API) y necesitan `grant execute ... to authenticated`.
- Antes de aplicar una migración, pruébala. Para funciones puras, usa `pg_temp`. Para el flujo completo, usa un bloque `do $$ ... raise exception $$`, que revierte todo al terminar.

## Flujo de trabajo

- `main` se publica solo en Vercel. El CI (`.github/workflows/ci.yml`) compila y corre las pruebas en cada push y PR.
- Antes de entregar: `cd app && npm run build && npm test -- --watch=false`.
