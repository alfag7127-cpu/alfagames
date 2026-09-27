import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Modalidad, Sesion, PuestoConEstado } from './models';

export interface AbrirSesionOpts {
  puestoId: number;
  clienteNombre: string | null;
  modalidad: Modalidad;
  minutosAsignados: number;
  controlesAdicionales: number;
  precioManual: number | null;
}

export interface FiltrosHistorial {
  desde?: string;
  hasta?: string;
  puestoId?: number;
}

@Injectable({ providedIn: 'root' })
export class SesionesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Estado en vivo de cada puesto (libre / con sesión activa), desde la vista `vista_puestos`. */
  async listarPuestos(): Promise<PuestoConEstado[]> {
    const { data, error } = await this.supabase.client
      .from('vista_puestos')
      .select('*')
      .order('id');
    if (error) throw error;
    return data as PuestoConEstado[];
  }

  /**
   * Abre una sesión en el servidor (`abrir_sesion`). Los controles adicionales
   * indicados al abrir se cobran desde el inicio. En conteo regresivo el precio
   * queda pactado de una vez (se recalcula si luego se extiende o se suma un control).
   */
  async abrirSesion(opts: AbrirSesionOpts): Promise<Sesion> {
    const { data, error } = await this.supabase.client.rpc('abrir_sesion', {
      p_puesto_id: opts.puestoId,
      p_cliente_nombre: opts.clienteNombre,
      p_modalidad: opts.modalidad,
      p_minutos_asignados: opts.modalidad === 'conteo_regresivo' ? opts.minutosAsignados : null,
      p_controles_adicionales: opts.controlesAdicionales,
      p_precio_manual: opts.precioManual,
    });
    if (error) throw error;
    return data as Sesion;
  }

  /** Suma un control adicional a una sesión activa; se cobra desde este momento. */
  async agregarControl(sesionId: number): Promise<Sesion> {
    const { data, error } = await this.supabase.client.rpc('agregar_control', {
      p_sesion_id: sesionId,
    });
    if (error) throw error;
    return data as Sesion;
  }

  /** Quita el control adicional más reciente en uso; se deja de cobrar desde este momento. */
  async quitarControl(sesionId: number): Promise<Sesion> {
    const { data, error } = await this.supabase.client.rpc('quitar_control', {
      p_sesion_id: sesionId,
    });
    if (error) throw error;
    return data as Sesion;
  }

  /** Conteo regresivo: suma minutos y el servidor recalcula el precio sobre el total. */
  async extenderSesion(sesionId: number, minutos: number): Promise<Sesion> {
    const { data, error } = await this.supabase.client.rpc('extender_sesion', {
      p_sesion_id: sesionId,
      p_minutos: minutos,
    });
    if (error) throw error;
    return data as Sesion;
  }

  /**
   * Cierra y cobra en el servidor (`cerrar_sesion`): horas y precio final se
   * calculan con el reloj del servidor, no en el navegador — esa es la fuente
   * de verdad financiera. El servidor guarda su precio sugerido; si `precioFinal`
   * viene, es lo que se cobra (quien cobra puede ajustar el precio según la situación).
   */
  async cerrarSesion(sesionId: number, precioFinal: number | null): Promise<Sesion> {
    const { data, error } = await this.supabase.client.rpc('cerrar_sesion', {
      p_sesion_id: sesionId,
      p_precio_final: precioFinal,
    });
    if (error) throw error;
    return data as Sesion;
  }

  async cancelarSesion(sesionId: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('sesiones')
      .update({ estado: 'cancelada', hora_fin: new Date().toISOString() })
      .eq('id', sesionId);
    if (error) throw error;
  }

  async listarHistorial(filtros: FiltrosHistorial = {}): Promise<Sesion[]> {
    let query = this.supabase.client
      .from('sesiones')
      .select('*')
      .order('hora_inicio', { ascending: false });
    if (filtros.desde) query = query.gte('hora_inicio', filtros.desde);
    if (filtros.hasta) query = query.lte('hora_inicio', filtros.hasta);
    if (filtros.puestoId) query = query.eq('puesto_id', filtros.puestoId);

    const { data, error } = await query;
    if (error) throw error;
    return data as Sesion[];
  }

  /** Mapa id -> nombre de puesto, útil para mostrar nombres en tablas de historial. */
  async listarNombresPuestos(): Promise<Record<number, string>> {
    const { data, error } = await this.supabase.client.from('puestos').select('id, nombre');
    if (error) throw error;
    const mapa: Record<number, string> = {};
    for (const fila of data as { id: number; nombre: string }[]) {
      mapa[fila.id] = fila.nombre;
    }
    return mapa;
  }

  /**
   * Suscripción realtime: refresca el grid de puestos entre varios empleados
   * cuando alguien abre/cierra una sesión desde otro navegador.
   * Devuelve una función para cancelar la suscripción.
   */
  onCambiosSesiones(callback: () => void): () => void {
    const channel = this.supabase.client
      .channel('sesiones-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones' }, callback)
      .subscribe();
    return () => {
      this.supabase.client.removeChannel(channel);
    };
  }
}
