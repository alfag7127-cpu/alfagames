# Alfa Games — Plan del proyecto

Angular + Supabase para control de una sala de videojuegos: tiempo por puesto, cobro por horas, ventas/gastos diarios, roles admin/empleado.

## Reglas de negocio (confirmadas)

- **Puestos**: 5 PS5 (`PS5-1` a `PS5-5`), cada una con su propio cliente y cronómetro corriendo en paralelo.
- **Estándar de cobro** (COP, definido el 2026-09-27 a partir de la tabla de ejemplos del negocio):

  **1. Redondeo del tiempo.** El tiempo jugado se redondea a la **media hora más cercana**: 1h05 → 1h, 1h14 → 1h, 1h15 → 1h30, 1h16 → 1h30. El mínimo que se cobra es 30 min.

  **2. Controles incluidos.** Cada PS5 incluye **2 controles**. Se pueden sumar **máximo 2 controles adicionales** (4 en total).

  **3. Sin controles adicionales → precio por paquete:**
  | Tiempo cobrado | Precio |
  |---|---|
  | 30 min | $3.000 |
  | 1h | $6.000 |
  | 1h30 | $9.000 |
  | 2h | $10.000 |
  | Cada media hora más después de 2h | + $2.500 (2h30 = $12.500, 3h = $15.000, 4h = $20.000, 5h = $25.000, 6h = $30.000) |

  **4. Con controles adicionales → se pierde el descuento del paquete y se cobra por hora:**
  `precio = $6.000 × horas cobradas + $2.000 × (controles adicionales × horas que estuvieron en uso)`
  | Ejemplo | Cálculo | Precio |
  |---|---|---|
  | 1h con 3 controles | 6.000 + 2.000 | $8.000 |
  | 1h con 4 controles | 6.000 + 4.000 | $10.000 |
  | 1h30 con 3 controles | 1,5 × 8.000 | $12.000 |
  | 1h30 con 4 controles | 1,5 × 10.000 | $15.000 |
  | 2h con 3 controles | 2 × 8.000 | $16.000 |
  | 2h con 4 controles | 2 × 10.000 | $20.000 |
  | 3h con 3 controles | 3 × 8.000 | $24.000 |

  **5. Control que entra a mitad de la sesión.** Se cobra **solo desde que entra**. El tiempo de cada control adicional se redondea igual (a la media hora más cercana). Ej.: 2h de sesión, el 3.er control entra al cumplir la 1.ª hora → 6.000 × 2 + 2.000 × 1 = **$14.000**. Si al redondear el control adicional queda en 0 (ej. se usó 10 min), no se cobra y se aplica el precio por paquete.

  **5b. Quitar un control adicional.** Se puede retirar en cualquier momento; se cobra solo el tiempo que estuvo en uso, redondeado a la media hora más cercana. Ej.: 2h de sesión con un control adicional solo la 1.ª hora → 6.000 × 2 + 2.000 × 1 = **$14.000**. Máximo 2 adicionales en uso a la vez.

  **5c. Pausa.** Cualquier sesión se puede pausar y reanudar. El tiempo en pausa no se cobra (ni el de la sesión ni el de los controles adicionales). En conteo regresivo el tiempo restante se congela y no suenan avisos mientras está en pausa.

  **6. Extensión de tiempo (conteo regresivo).** Si el cliente compra más tiempo, el precio se **recalcula sobre el tiempo total**: 1h + 1h = paquete de 2h = $10.000 (no 6.000 + 6.000).

- **Precio al cobrar**: el sistema muestra un **precio sugerido** con el estándar, y quien cobra puede marcar "Cambiar precio" y poner otro valor según la situación. Se guardan ambos (`precio_sugerido` y `precio_total`); el Historial muestra el sugerido cuando se cambió.
- **Precio especial al abrir (conteo regresivo)**: se puede pactar un precio base fijo al abrir; los controles adicionales se siguen sumando aparte.
- **Cambiar de modalidad con la sesión abierta**: de cronometrado a conteo regresivo se indica el tiempo **total** pactado (incluye lo ya jugado) y el precio queda pactado; de conteo regresivo a cronometrado se cobra al cerrar por el tiempo real.
- **Transferir sesión**: una sesión activa se puede mover completa (tiempo, pausas, controles y precio) a otra consola libre, por ejemplo si el cliente cambia de consola o la consola falla.
- **Puestos**: el admin agrega, renombra o quita consolas desde la página *Puestos*. Quitar una consola la saca de la Sala pero conserva su historial y se puede reactivar. No se puede quitar una consola con una sesión abierta.
- **Hora de Colombia**: toda la app muestra y filtra fechas en hora de Colombia (UTC-5), sin importar la zona del dispositivo o del servidor.
- **Ganancia neta**: Ventas del día − Gastos del día. Se necesita registrar gastos (arriendo, luz, insumos, etc.), no solo ventas.

### Modalidades de cobro (por sesión, elegible en cada PS5 al abrir)

- **Cronometrado**: cuenta hacia arriba desde que se abre. Se cobra al cerrar, según el tiempo realmente jugado (redondeo a la media hora más cercana). Es la modalidad de siempre.
- **Conteo regresivo**: el empleado especifica cuántos minutos compra el cliente (atajos de 30/60/90/120 min, o un número custom). El precio queda **pactado y guardado de una vez al abrir**, calculado con la misma fórmula de horas — no cambia si el cliente juega un poco más o un poco menos. Sobre la marcha se puede **extender el tiempo** (+30 min / +1h; el precio se recalcula sobre el total) o **sumar un control adicional** (se cobra desde que entra).
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

## Alquiler de consolas (2026-10-19)

Negocio aparte de la sala: el cliente se lleva la consola a su casa.

- **Inventario inicial**: 1 PS5 Slim (2 controles originales), 2 PS4 Programadas y 1 PS4 Original (2 controles cada una), y 2 controles sueltos. El admin agrega o quita consolas y ajusta los controles sueltos en *Alquiler → Inventario y precios*.
- **Controles**: cada consola sale por defecto con sus 2 controles incluidos. Los controles sueltos se llevan **por tipo** (PS4 y PS5 no son intercambiables): una consola solo puede llevar extras de su mismo tipo, mientras haya libres. Cada control extra cuesta **$5.000** (precio sugerido, editable antes de registrar; configurable por el admin).
- **Planes** (afiche Alfa Games & Frank Over):

  | Consola | Plan | Precio |
  |---|---|---|
  | PS4 | 4 horas | $20.000 |
  | PS4 | 10 horas | $35.000 |
  | PS4 | 24 horas | $50.000 |
  | PS4 | La noche (7 PM a 9 AM) | $30.000 |
  | PS5 | 4 horas | $30.000 |
  | PS5 | 10 horas | $40.000 |
  | PS5 | 24 horas | $75.000 |
  | PS5 | La noche (7 PM a 9 AM) | $50.000 |

- **La noche** termina a las 9:00 AM (hora de Colombia) siguientes a la entrega.
- **Cobro**: se cobra al entregar (precio sugerido editable). No se pide depósito ni se cobra recargo por entrega tarde (el precio final se puede ajustar a mano al recibir si hace falta). Anular un alquiler no cuenta como venta.
- **Más tiempo (extensión)**: si el cliente pide más tiempo y envía el dinero, se registra una extensión: un plan (precio sugerido = plan + controles extra) u horas sueltas con precio a mano. La nueva entrega se cuenta desde la entrega pactada actual. Cada pago queda con su fecha y suma en ventas el día que se recibe.
- **Contrato**: el cliente firma un contrato físico; se adjuntan fotos o PDF (al alquilar, durante el alquiler o desde el historial). Se guardan en un bucket privado de Supabase Storage (`contratos/<id del alquiler>/`); las fotos se comprimen antes de subir. Solo el admin puede borrar archivos.
- **Cuentas**: el historial de alquileres muestra entregas, devoluciones (marca las tardías) y total del período. Sala y Alquiler son **negocios independientes**: el producido del alquiler se ve solo en su módulo (Historial y Gráficas de Alquiler) y nunca se suma al Dashboard, Historial ni totales de la sala.

- **Potes** (dónde entra el dinero del alquiler): **Pote Llave** = cuenta Daviplata; **Pote Efectivo** = dinero físico. Cada cobro (entrega, extensión, ajuste al recibir) se registra por pote y se puede dividir (parte Llave, parte Efectivo); la suma debe dar el total. El historial de alquiler muestra cuánto entró a cada pote en el período (por fecha del pago).
- **Gráficas**: pestaña *Alquiler → Gráficas* con el producido (dinero recibido) diario (30 días), semanal (12 semanas, lunes a domingo) y mensual (12 meses), apilado por pote, más el resumen de hoy, esta semana y este mes.
- **Menú**: dos secciones, *Sala* (pestañas: En vivo, Historial, Dashboard, Gastos, Puestos) y *Alquiler* (Consolas, Historial, Gráficas, Inventario y precios).
- **Ficha de cada consola**: capacidad, juegos instalados y detalles (accesorios, cables, estado), en *Inventario y precios → Ficha*. Al alquilar se guarda una copia de con qué salió; al recibir aparece una lista para revisar y lo que no se marque queda anotado como "Faltó: …".
- **Movimientos de potes** (pestaña *Potes*, solo admin registra): préstamo (sale, a una persona), abono de préstamo (entra), inversión (sale; compra de consolas, controles…), otro egreso, otro ingreso y traslado entre potes. Cada movimiento cuenta en su fecha. Saldo del pote = cobros de alquiler + entradas − salidas. Los préstamos quedan pendientes por persona hasta que se abonen.

## Roles, productos y saldo inicial (2026-10-20)

- **Roles**: *Admin* ve todo. *Trabajador* solo ve **Sala → En vivo, Ventas e Historial** (cuentas del día): abrir, cobrar, pausar, transferir y vender productos. No ve dashboard, gastos, productos (inventario), usuarios ni nada de Alquiler; la base de datos se lo bloquea (RLS), no solo la pantalla.
- **Usuarios**: el admin crea trabajadores (o admins) en *Sala → Usuarios*, cambia rol y contraseña, y desactiva cuentas (no se borran: su historial se conserva). Usa la función de servidor `usuarios` (Edge Function), que verifica que quien llama sea admin.
- **Productos de la sala** (*Sala → Productos*, admin): nombre, precio de compra, precio de venta al público y cantidad. "+ Cantidad" registra entrada de mercancía. Las ventas se hacen desde *En vivo* (cualquier usuario) y descuentan el inventario; el admin puede anularlas (las unidades vuelven). Las ventas de productos suman en el Historial de la sala y en el Dashboard.
- **Saldo inicial de potes**: movimiento "Saldo inicial (antes de la app)" en *Alquiler → Potes*, para cargar el dinero que ya había antes de usar la app.
- **Cualquier usuario opera cualquier sesión**: el trabajador puede cerrar, pausar, extender o transferir sesiones abiertas por otro. Al cerrar se guardan los minutos realmente jugados (sin pausas) y quién cerró. El Historial marca el **desfase**: "+X sin cobrar" si se jugó más de lo cobrado (en regresivo desde 10 min; en cronometrado más de 15 min, porque el redondeo normal llega a ±15) y "cerró <nombre>" si cerró alguien distinto de quien abrió. El resumen muestra el tiempo total jugado sin cobrar del período.
- **Productos a la cuenta de una consola**: al vender (en Ventas o con "🛒 Agregar producto" en la tarjeta de la consola) se elige la consola o "Mostrador". La tarjeta muestra lo que pidió y el total a cobrar (tiempo + productos); al cerrar se ve el **TOTAL A COBRAR** grande. La venta cuenta como venta de productos el día en que se hace. El Historial muestra los productos de cada sesión.
- **Editar productos**: en Productos, "Editar" cambia el nombre y corrige la cantidad (ej. tras contar); los precios se editan directo en la tabla.
- **Rol Alquiler**: solo ve el módulo Alquiler (Consolas, Historial, Gráficas y Potes). Puede alquilar, extender, recibir, anular y adjuntar contratos. No ve nada de la Sala. Inventario, precios y movimientos de potes siguen siendo solo del admin. Roles: admin (todo), trabajador/empleado (solo Sala) y alquiler (solo Alquiler), también en RLS (`private.puede_sala()` / `private.puede_alquiler()`).
- **Súper usuario**: `prueba@alfagames.com`. Nadie puede cambiarle el rol, desactivarlo ni cambiarle la contraseña (solo él mismo); lo bloquea la base de datos (trigger) y la función `usuarios`. En *Usuarios* aparece con la etiqueta 🛡 Súper usuario.
