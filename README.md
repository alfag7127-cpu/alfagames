# Alfa Games

Control de sala de videojuegos: puestos en vivo, cobro por horas, historial, gastos y ganancia neta diaria. Angular + Supabase.

Detalle de reglas de negocio y roadmap: [`docs/PLAN.md`](docs/PLAN.md).

## Estructura

- `app/` — proyecto Angular (standalone, zoneless, Tailwind).
- `supabase/schema.sql` — tablas, vista y políticas RLS. Correr en el SQL Editor de tu proyecto Supabase.
- `docs/PLAN.md` — reglas de negocio confirmadas y roadmap.

## Puesta en marcha

1. **Crear proyecto en [supabase.com](https://supabase.com)** (plan gratis sirve para empezar).
2. **Correr el schema**: pega el contenido de `supabase/schema.sql` en el SQL Editor de tu proyecto y ejecútalo.
3. **Configurar credenciales**: en tu proyecto Supabase ve a *Settings > API* y copia la `Project URL` y la `anon public key`. Pégalas en:
   - `app/src/environments/environment.ts`
   - `app/src/environments/environment.development.ts`
4. **Crear los puestos iniciales**: en el SQL Editor de Supabase (ejemplo con 5 PS5):
   ```sql
   insert into public.puestos (nombre) values ('PS5-1'), ('PS5-2'), ('PS5-3'), ('PS5-4'), ('PS5-5');
   ```
5. **Instalar dependencias y correr**:
   ```powershell
   cd app
   npm install
   npm start
   ```
   Abre `http://localhost:4200`.
6. **Crear el primer usuario admin**: regístrate normal desde la pantalla de login (o desde el panel de Supabase Auth), luego en el SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where id = '<uuid-del-usuario>';
   ```
   El UUID lo encuentras en Supabase Auth > Users. Cualquier otro usuario que se registre queda como `empleado` por defecto.

## Comandos útiles

```powershell
cd app
npm start          # servidor de desarrollo
npm run build       # build de producción (dist/app)
npm test            # tests unitarios
```
