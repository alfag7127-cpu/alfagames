import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Sesion, PuestoConEstado } from './models';
import { calcularHorasCobradas, calcularPrecioTotal } from './pricing';

export interface CerrarSesionOpts {
  horaInicio: string;
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

  async abrirSesion(
    puestoId: number,
    empleadoId: string,
    clienteNombre: string | null,
  ): Promise<Sesion> {
    const { data, error } = await this.supabase.client
      .from('sesiones')
      .insert({ puesto_id: puestoId, empleado_id: empleadoId, cliente_nombre: clienteNombre })
      .select()
      .single();
    if (error) throw error;
    return data as Sesion;
  }

  /** Cierra la sesión, calculando horas (redondeo hacia arriba) y precio final. */
  async cerrarSesion(sesionId: number, opts: CerrarSesionOpts): Promise<Sesion> {
    const horaFin = new Date();
    const minutosJugados = (horaFin.getTime() - new Date(opts.horaInicio).getTime()) / 60_000;
    const horas = calcularHorasCobradas(minutosJugados);
    const precioTotal = calcularPrecioTotal({
      horas,
      controlesAdicionales: opts.controlesAdicionales,
      precioManual: opts.precioManual,
    });

    const { data, error } = await this.supabase.client
      .from('sesiones')
      .update({
        hora_fin: horaFin.toISOString(),
        horas_cobradas: horas,
        controles_adicionales: opts.controlesAdicionales,
        precio_manual: opts.precioManual,
        precio_total: precioTotal,
        estado: 'finalizada',
      })
      .eq('id', sesionId)
      .select()
      .single();
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
