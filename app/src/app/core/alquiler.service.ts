import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Alquiler,
  AlquilerConfig,
  AlquilerConsola,
  AlquilerTarifa,
  ConsolaConEstado,
  TipoConsola,
} from './models';

export interface NuevoAlquiler {
  consolaId: number;
  tarifaId: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  controlesExtra: number;
  precioFinal: number | null;
  notas: string | null;
}

export interface NuevaConsola {
  nombre: string;
  tipo: TipoConsola;
  descripcion: string | null;
  controlesIncluidos: number;
}

/**
 * Negocio de alquiler de consolas para llevar a casa. Entregar, devolver y cancelar
 * pasan por funciones del servidor (validan inventario y controles libres).
 * Inventario, tarifas y configuración solo los cambia el admin (lo exige RLS).
 */
@Injectable({ providedIn: 'root' })
export class AlquilerService {
  constructor(private readonly supabase: SupabaseService) {}

  async listarConsolasConEstado(): Promise<ConsolaConEstado[]> {
    const { data, error } = await this.supabase.client
      .from('vista_alquiler_consolas')
      .select('*')
      .order('tipo', { ascending: false })
      .order('nombre');
    if (error) throw error;
    return data as ConsolaConEstado[];
  }

  async listarTarifas(): Promise<AlquilerTarifa[]> {
    const { data, error } = await this.supabase.client
      .from('alquiler_tarifas')
      .select('*')
      .order('tipo', { ascending: false })
      .order('orden');
    if (error) throw error;
    return data as AlquilerTarifa[];
  }

  async obtenerConfig(): Promise<AlquilerConfig> {
    const { data, error } = await this.supabase.client.from('alquiler_config').select('*').eq('id', 1).single();
    if (error) throw error;
    return data as AlquilerConfig;
  }

  async controlesLibres(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('alquiler_controles_libres');
    if (error) throw error;
    return data as number;
  }

  async alquilar(a: NuevoAlquiler): Promise<Alquiler> {
    const { data, error } = await this.supabase.client.rpc('alquilar_consola', {
      p_consola_id: a.consolaId,
      p_tarifa_id: a.tarifaId,
      p_cliente_nombre: a.clienteNombre,
      p_cliente_telefono: a.clienteTelefono,
      p_cliente_direccion: a.clienteDireccion,
      p_controles_extra: a.controlesExtra,
      p_precio_final: a.precioFinal,
      p_notas: a.notas,
    });
    if (error) throw error;
    return data as Alquiler;
  }

  /** Recibe la consola. `precioFinal` ajusta lo cobrado (ej. recargo por entrega tarde). */
  async devolver(alquilerId: number, precioFinal: number | null, notas: string | null): Promise<Alquiler> {
    const { data, error } = await this.supabase.client.rpc('devolver_alquiler', {
      p_alquiler_id: alquilerId,
      p_precio_final: precioFinal,
      p_notas: notas,
    });
    if (error) throw error;
    return data as Alquiler;
  }

  async cancelar(alquilerId: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('cancelar_alquiler', { p_alquiler_id: alquilerId });
    if (error) throw error;
  }

  async historial(desde?: string, hasta?: string): Promise<Alquiler[]> {
    let query = this.supabase.client.from('alquileres').select('*').order('inicio', { ascending: false });
    if (desde) query = query.gte('inicio', desde);
    if (hasta) query = query.lte('inicio', hasta);
    const { data, error } = await query;
    if (error) throw error;
    return data as Alquiler[];
  }

  // ── Admin: inventario, precios y configuración ──

  async crearConsola(c: NuevaConsola): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_consolas').insert({
      nombre: c.nombre,
      tipo: c.tipo,
      descripcion: c.descripcion,
      controles_incluidos: c.controlesIncluidos,
    });
    if (error) throw error;
  }

  async actualizarConsola(id: number, cambios: Partial<Pick<AlquilerConsola, 'nombre' | 'descripcion' | 'controles_incluidos' | 'activo'>>): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_consolas').update(cambios).eq('id', id);
    if (error) throw error;
  }

  async actualizarTarifa(id: number, precio: number): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_tarifas').update({ precio }).eq('id', id);
    if (error) throw error;
  }

  async actualizarConfig(cambios: Partial<Pick<AlquilerConfig, 'controles_sueltos' | 'precio_control_extra'>>): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_config').update(cambios).eq('id', 1);
    if (error) throw error;
  }

  /** Refresca la pantalla cuando otro empleado entrega o recibe una consola. */
  onCambios(callback: () => void): () => void {
    const channel = this.supabase.client
      .channel('alquileres-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alquileres' }, callback)
      .subscribe();
    return () => {
      this.supabase.client.removeChannel(channel);
    };
  }
}
