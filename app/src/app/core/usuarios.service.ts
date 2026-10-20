import { Injectable } from '@angular/core';
import { Rol, UsuarioApp } from './models';
import { SupabaseService } from './supabase.service';

/**
 * Usuarios de la app. Pasa por la función de servidor "usuarios" (crear cuentas
 * necesita la clave de servicio, que no puede ir en el navegador); la función
 * verifica que quien llama sea admin.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  constructor(private readonly supabase: SupabaseService) {}

  private async llamar<T>(cuerpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.client.functions.invoke('usuarios', { body: cuerpo });
    if (error) {
      // El mensaje útil viene en el cuerpo de la respuesta de la función.
      const contexto = (error as { context?: Response }).context;
      if (contexto && typeof contexto.json === 'function') {
        const detalle = await contexto.json().catch(() => null);
        if (detalle?.error) throw new Error(detalle.error);
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }

  async listar(): Promise<UsuarioApp[]> {
    const r = await this.llamar<{ usuarios: UsuarioApp[] }>({ accion: 'listar' });
    return r.usuarios;
  }

  crear(email: string, password: string, nombre: string, rol: Rol): Promise<unknown> {
    return this.llamar({ accion: 'crear', email, password, nombre, rol });
  }

  cambiarRol(id: string, rol: Rol): Promise<unknown> {
    return this.llamar({ accion: 'rol', id, rol });
  }

  cambiarPassword(id: string, password: string): Promise<unknown> {
    return this.llamar({ accion: 'password', id, password });
  }

  /** Bloquea o desbloquea el acceso (no se borra: su historial se conserva). */
  cambiarActivo(id: string, activo: boolean): Promise<unknown> {
    return this.llamar({ accion: activo ? 'activar' : 'desactivar', id });
  }
}
