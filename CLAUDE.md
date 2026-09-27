# Alfa Games — contexto para Claude

App para administrar una sala de videojuegos (5 PS5): sesiones en vivo, cobro, historial, gastos y ganancia diaria. El dueño escribe en español; responde en español.

- `app/`: Angular 22 (standalone, zoneless, signals, Tailwind). Pruebas con Vitest (`npm test`).
- `supabase/schema.sql`: historial del esquema por secciones numeradas. **Cada cambio de base de datos va como una sección nueva al final**; no se editan las anteriores.
- `docs/PLAN.md`: reglas de negocio confirmadas. La sección **"Estándar de cobro"** es la fuente de verdad de las tarifas.

## Cobro: dos implementaciones que deben coincidir

- Servidor (lo que se cobra de verdad): `private.calcular_cobro` y `private.cobro_sesion` en Supabase, usadas por las RPC `abrir_sesion`, `agregar_control`, `quitar_control`, `extender_sesion` y `cerrar_sesion`. Cada control adicional es una fila de `sesion_controles` (`desde`/`hasta`). `cerrar_sesion` guarda `precio_sugerido` y acepta un `p_precio_final` opcional que decide quien cobra.
- Front (solo vista previa): `app/src/app/core/pricing.ts`, con pruebas en `pricing.spec.ts` que usan la tabla de ejemplos del negocio.

Si cambia una tarifa, actualiza los dos lados, `docs/PLAN.md` y los casos de `pricing.spec.ts`.

## Supabase

- Proyecto: `xncbflbvcggrnoypaqcr`. La URL y la clave publishable de `app/src/environments/` son públicas por diseño; la seguridad la da RLS. Nunca subas la `service_role` key.
- Las funciones públicas son `SECURITY INVOKER` (respetan RLS). Los helpers viven en el esquema `private` (no expuesto por la API) y necesitan `grant execute ... to authenticated`.
- Antes de aplicar una migración, pruébala. Para funciones puras, usa `pg_temp`. Para el flujo completo, usa un bloque `do $$ ... raise exception $$`, que revierte todo al terminar.

## Flujo de trabajo

- `main` se publica solo en Vercel. El CI (`.github/workflows/ci.yml`) compila y corre las pruebas en cada push y PR.
- Antes de entregar: `cd app && npm run build && npm test -- --watch=false`.
