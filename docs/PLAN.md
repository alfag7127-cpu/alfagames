# Alfa Games — Plan del proyecto

Angular + Supabase para control de una sala de videojuegos: tiempo por puesto, cobro por horas, ventas/gastos diarios, roles admin/empleado.

## Reglas de negocio (confirmadas)

- **Puestos**: 5 PS5 (`PS5-1` a `PS5-5`), cada una con su propio cliente y cronómetro corriendo en paralelo.
- **Tarifa por horas** (COP):
  - 1 hora: $6.000
  - 2 horas: $10.000
  - 3+ horas: $10.000 + $5.000 por cada hora adicional a partir de la 2ª (3h = $15.000, 4h = $20.000, ...)
  - Fórmula: `horas === 1 ? 6000 : 10000 + (horas - 2) * 5000`
- **Precio manual**: el empleado puede sobreescribir el precio calculado cuando hay una oferta especial (ej. 3 horas a precio fijo pactado). El sistema guarda igual el valor final cobrado.
- **Redondeo de tiempo**: si el tiempo jugado no cae exacto en una hora, se redondea hacia arriba (1h20 → se cobra 2h).
- **Control adicional**: $2.000 fijo por cada control extra usado *dentro de la misma sesión* (ej. 2 personas en un puesto). Se suma al total de esa sesión, no es un cobro aparte.
- **Ganancia neta**: Ventas del día − Gastos del día. Se necesita registrar gastos (arriendo, luz, insumos, etc.), no solo ventas.

### Modalidades de cobro (por sesión, elegible en cada PS5 al abrir)

- **Cronometrado**: cuenta hacia arriba desde que se abre. Se cobra al cerrar, según el tiempo realmente jugado (redondeo hacia arriba). Es la modalidad de siempre.
- **Conteo regresivo**: el empleado especifica cuántos minutos compra el cliente (atajos de 30/60/90/120 min, o un número custom). El precio queda **pactado y guardado de una vez al abrir**, calculado con la misma fórmula de horas — no cambia si el cliente juega un poco más o un poco menos. Solo se pueden sumar controles adicionales sobre la marcha antes de cerrar.
- Ambas modalidades conviven puesto por puesto: cada PS5 puede tener, en momentos distintos, sesiones cronometradas o de conteo regresivo — no es una configuración fija del puesto, se elige cada vez que se abre una sesión.

### Avisos de tiempo (solo aplica a conteo regresivo, que tiene un final conocido)

Tres umbrales, cada uno se dispara una sola vez por sesión (no se repite cada segundo):

| Umbral | Cuándo | Aviso |
|---|---|---|
| Aviso | quedan ≤ 5 minutos | borde/texto ámbar + notificación del navegador + beep corto |
| Crítico | queda ≤ 1 minuto | borde/texto rojo parpadeante + notificación + beep más largo |
| Vencido | tiempo cumplido, en sobretiempo | rojo sólido parpadeante + notificación + beep grave, cronómetro sigue contando en positivo (`+mm:ss`) |

Notificaciones del navegador (Web Notification API) piden permiso una sola vez al cargar la Sala; si el usuario no lo concede, quedan igual el aviso visual y el beep (Web Audio API, sin archivos de sonido externos).

## Roles

- **Admin**: ve todo — todas las sesiones, todos los puestos, historial completo, reportes de ventas/ganancias/gastos de cualquier día o rango. Único que registra y ve **gastos**. Puede crear/editar puestos y promover usuarios a admin.
- **Empleado**: opera la sala en tiempo real — abre sesión en un puesto libre, marca controles adicionales, cierra sesión (cobra), puede fijar precio manual en casos especiales. Ve el estado de los puestos y el historial de sesiones (lo necesita para atender clientes), pero no ve ni edita gastos.

## Modelo de datos (Supabase / Postgres)

Ver [`supabase/schema.sql`](../supabase/schema.sql) — ya escrito, listo para correr en el SQL Editor del proyecto Supabase.

- `profiles` — perfil de cada usuario (`role`: admin | empleado), se crea automático al registrarse (trigger), rol por defecto `empleado`.
- `puestos` — estaciones físicas (nombre, activo/inactivo).
- `sesiones` — cada alquiler: puesto, empleado, cliente, hora inicio/fin, horas cobradas, controles adicionales, precio manual (si aplica), precio total, estado (activa/finalizada/cancelada). Restricción: solo una sesión activa por puesto.
- `vista_puestos` — vista que junta puesto + su sesión activa (si hay), para saber libre/ocupado sin duplicar estado.
- `gastos` — gastos diarios (fecha, descripción, monto, categoría), solo admin.
- RLS ya escrito: empleado inserta/cierra sus sesiones, admin todo, gastos solo admin.
- **`public.cerrar_sesion(sesion_id, controles_adicionales, precio_manual)`** — función que hace el cierre real. El navegador nunca calcula ni envía `hora_fin`/`horas_cobradas`/`precio_total`: llama esta función por RPC, y el servidor calcula todo con su propio reloj y la misma fórmula de arriba. Esto es lo que hace que la parte financiera sea confiable — nadie puede alterar un cobro manipulando el navegador. El cálculo en `pricing.ts` (frontend) es solo la vista previa mientras la sesión sigue corriendo.
- Constraints de integridad: `controles_adicionales >= 0`, `precio_manual > 0` (si no es null), `precio_total >= 0`, `horas_cobradas > 0`.
- Funciones helper (`is_admin`, `handle_new_user`) viven en un esquema `private`, no `public` — así Supabase no las expone como endpoints REST públicos.

**Admin ya creado**: `prueba@alfagames.com` — cambia la contraseña real cuando quieras desde la app (o pídeme el flujo de "cambiar contraseña").

## Stack técnico

- **Angular** (standalone components, signals, Angular Router, `@angular/forms`).
- **Supabase JS client** (`@supabase/supabase-js`) — auth, tablas, realtime (para ver puestos ocuparse/liberarse en vivo entre varios empleados).
- **Tailwind CSS** para estilos rápidos y consistentes (grid de puestos, dashboard).
- **Gráficas** (ventas/ganancias por día): librería de charts para Angular, siguiendo la guía de diseño de datos del proyecto — se define al llegar a esa pantalla.

## Roadmap

1. **Infra**: instalar Node.js y Angular CLI (en curso), crear proyecto Angular, conectar Supabase (variables de entorno con URL + anon key — **tú las generas desde tu proyecto Supabase y me las pasas o las pegas en `environment.ts`**).
2. **Auth**: login, guard de rutas por rol, tabla `profiles` ya lista.
3. **Vista de sala (empleado)**: grid de puestos en vivo (libre/ocupado, cronómetro), abrir sesión, cerrar sesión (cálculo automático + opción de precio manual + controles adicionales).
4. **Historial de sesiones**: tabla filtrable por fecha/puesto/empleado.
5. **Gastos (admin)**: CRUD simple de gastos diarios.
6. **Dashboard (admin)**: ventas del día/rango, gastos, ganancia neta, gráficas.
7. **Pulido**: validaciones, manejo de errores, responsive (tablet en la sala), despliegue (Vercel/Netlify para el front, Supabase ya hosteado).

## Qué falta de tu lado

- Crear un proyecto en [supabase.com](https://supabase.com) (gratis para empezar) y darme (o pegar tú mismo en `src/environments/environment.ts`) la **Project URL** y la **anon public key**.
- Confirmar nombres de puestos iniciales (cuántos y cómo se llaman: "PS5-1", "PC-1", etc.) para la carga inicial.
