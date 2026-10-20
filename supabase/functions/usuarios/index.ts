// Administración de usuarios de Alfa Games (solo admin).
// Crear cuentas necesita la clave de servicio, que nunca va en el navegador: por eso
// vive aquí. Cada llamada verifica que quien llama tenga sesión y rol admin.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Rol = "admin" | "empleado" | "alquiler";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ¿Quién llama? Debe tener sesión y ser admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quien, error: errQuien } = await servicio.auth.getUser(token);
  if (errQuien || !quien?.user) return respuesta({ error: "Inicia sesión" }, 401);
  const { data: perfil } = await servicio.from("profiles").select("role").eq("id", quien.user.id).single();
  if (perfil?.role !== "admin") return respuesta({ error: "Solo el admin puede administrar usuarios" }, 403);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta({ error: "Petición inválida" }, 400);
  }
  const accion = String(cuerpo.accion ?? "");

  try {
    if (accion === "listar") {
      const { data, error } = await servicio.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const { data: perfiles } = await servicio.from("profiles").select("id, full_name, role");
      const porId = new Map((perfiles ?? []).map((p) => [p.id, p]));
      return respuesta({
        usuarios: data.users.map((u) => ({
          id: u.id,
          email: u.email,
          nombre: porId.get(u.id)?.full_name ?? null,
          rol: porId.get(u.id)?.role ?? "empleado",
          activo: !u.banned_until || new Date(u.banned_until) < new Date(),
          ultimo_ingreso: u.last_sign_in_at ?? null,
          yo: u.id === quien.user.id,
        })),
      });
    }

    if (accion === "crear") {
      const email = String(cuerpo.email ?? "").trim().toLowerCase();
      const password = String(cuerpo.password ?? "");
      const nombre = String(cuerpo.nombre ?? "").trim();
      const rol: Rol = cuerpo.rol === "admin" || cuerpo.rol === "alquiler" ? cuerpo.rol : "empleado";
      if (!email.includes("@")) return respuesta({ error: "Correo inválido" }, 400);
      if (password.length < 6) return respuesta({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

      const { data, error } = await servicio.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: nombre || null },
      });
      if (error) throw error;
      // El trigger crea el perfil como empleado; aquí se fija nombre y rol.
      const { error: errPerfil } = await servicio
        .from("profiles")
        .update({ full_name: nombre || null, role: rol })
        .eq("id", data.user.id);
      if (errPerfil) throw new Error(`Usuario creado, pero no se pudo asignar el rol: ${errPerfil.message}`);
      return respuesta({ ok: true, id: data.user.id });
    }

    const id = String(cuerpo.id ?? "");
    if (!id) return respuesta({ error: "Falta el usuario" }, 400);
    if (id === quien.user.id && (accion === "rol" || accion === "desactivar")) {
      return respuesta({ error: "No puedes quitarte el rol de admin ni desactivarte a ti mismo" }, 400);
    }

    if (accion === "rol") {
      const rol: Rol = cuerpo.rol === "admin" || cuerpo.rol === "alquiler" ? cuerpo.rol : "empleado";
      const { error } = await servicio.from("profiles").update({ role: rol }).eq("id", id);
      if (error) throw error;
      return respuesta({ ok: true });
    }

    if (accion === "password") {
      const password = String(cuerpo.password ?? "");
      if (password.length < 6) return respuesta({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
      const { error } = await servicio.auth.admin.updateUserById(id, { password });
      if (error) throw error;
      return respuesta({ ok: true });
    }

    if (accion === "desactivar" || accion === "activar") {
      // Se bloquea en vez de borrar: sus sesiones y ventas quedan en el historial.
      const { error } = await servicio.auth.admin.updateUserById(id, {
        ban_duration: accion === "desactivar" ? "876000h" : "none",
      });
      if (error) throw error;
      return respuesta({ ok: true });
    }

    return respuesta({ error: "Acción desconocida" }, 400);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    const traducido = /already been registered|already registered/i.test(mensaje)
      ? "Ya existe un usuario con ese correo"
      : mensaje;
    return respuesta({ error: traducido }, 400);
  }
});
