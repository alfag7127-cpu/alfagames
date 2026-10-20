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
  /** Reparto del cobro entre potes (Llave = Daviplata, Efectivo = físico). */
  pagoLlave: number;
  pagoEfectivo: number;
}

export interface Extension {
  /** Un plan (desde el fin actual) o horas sueltas con precio manual. */
  tarifaId: number | null;
  horas: number | null;
  precioFinal: number | null;
  pagoLlave: number;
  pagoEfectivo: number;
}

/** Un pago con su alquiler (para el resumen de potes por fechas). */
export interface PagoConAlquiler {
  pote: 'llave' | 'efectivo';
  monto: number;
  concepto: string;
  created_at: string;
  alquileres: { estado: string };
}

export interface ArchivoContrato {
  path: string;
  nombre: string;
  creado: string | null;
  esPdf: boolean;
}

/** Ventas por extensión: se cuentan el día que se recibe el pago. */
export interface PagoExtension {
  precio: number;
  created_at: string;
  alquileres: { estado: string };
}

const BUCKET_CONTRATOS = 'contratos';

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

  /** Controles sueltos libres de un tipo (los de PS4 no sirven en PS5 y viceversa). */
  async controlesLibres(tipo: TipoConsola): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('alquiler_controles_libres', { p_tipo: tipo });
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
      p_pago_llave: a.pagoLlave,
      p_pago_efectivo: a.pagoEfectivo,
    });
    if (error) throw error;
    return data as Alquiler;
  }

  /** Recibe la consola. `precioFinal` ajusta lo cobrado (ej. recargo por entrega tarde). */
  async devolver(
    alquilerId: number,
    precioFinal: number | null,
    notas: string | null,
    poteAjuste: 'llave' | 'efectivo' | null,
  ): Promise<Alquiler> {
    const { data, error } = await this.supabase.client.rpc('devolver_alquiler', {
      p_alquiler_id: alquilerId,
      p_precio_final: precioFinal,
      p_notas: notas,
      p_pote_ajuste: poteAjuste,
    });
    if (error) throw error;
    return data as Alquiler;
  }

  /** El cliente pide más tiempo y paga: corre la entrega desde el fin actual. */
  async extender(alquilerId: number, e: Extension): Promise<Alquiler> {
    const { data, error } = await this.supabase.client.rpc('extender_alquiler', {
      p_alquiler_id: alquilerId,
      p_tarifa_id: e.tarifaId,
      p_horas: e.horas,
      p_precio_final: e.precioFinal,
      p_pago_llave: e.pagoLlave,
      p_pago_efectivo: e.pagoEfectivo,
    });
    if (error) throw error;
    return data as Alquiler;
  }

/** Pagos por pote en un rango de fechas (cuentan el día en que entró el dinero). */
  async pagosPotes(desde?: string, hasta?: string): Promise<PagoConAlquiler[]> {
    let query = this.supabase.client.from('alquiler_pagos').select('pote, monto, concepto, created_at, alquileres!inner(estado)');
    if (desde) query = query.gte('created_at', desde);
    if (hasta) query = query.lte('created_at', hasta);
    const { data, error } = await query;
    if (error) throw error;
    return data as unknown as PagoConAlquiler[];
  }

  async pagosExtensiones(desde: string): Promise<PagoExtension[]> {
    const { data, error } = await this.supabase.client
      .from('alquiler_extensiones')
      .select('precio, created_at, alquileres!inner(estado)')
      .gte('created_at', desde);
    if (error) throw error;
    return data as unknown as PagoExtension[];
  }

  // ── Contratos (Supabase Storage, bucket privado) ──

  async listarContratos(alquilerId: number): Promise<ArchivoContrato[]> {
    const { data, error } = await this.supabase.client.storage
      .from(BUCKET_CONTRATOS)
      .list(String(alquilerId), { sortBy: { column: 'created_at', order: 'asc' } });
    if (error) throw error;
    return (data ?? [])
      .filter((f) => f.id) // descarta marcadores de carpeta
      .map((f) => ({
        path: `${alquilerId}/${f.name}`,
        nombre: f.name.replace(/^\d+-/, ''),
        creado: f.created_at ?? null,
        esPdf: f.name.toLowerCase().endsWith('.pdf'),
      }));
  }

  async subirContrato(alquilerId: number, archivo: File): Promise<void> {
    const limpio = archivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const { error } = await this.supabase.client.storage
      .from(BUCKET_CONTRATOS)
      .upload(`${alquilerId}/${Date.now()}-${limpio}`, archivo, { contentType: archivo.type || undefined });
    if (error) throw error;
  }

  /** Enlace temporal (10 min) para ver un archivo del bucket privado. */
  async urlContrato(path: string): Promise<string> {
    const { data, error } = await this.supabase.client.storage.from(BUCKET_CONTRATOS).createSignedUrl(path, 600);
    if (error) throw error;
    return data.signedUrl;
  }

  async eliminarContrato(path: string): Promise<void> {
    const { error } = await this.supabase.client.storage.from(BUCKET_CONTRATOS).remove([path]);
    if (error) throw error;
  }

  async cancelar(alquilerId: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('cancelar_alquiler', { p_alquiler_id: alquilerId });
    if (error) throw error;
  }

  async historial(desde?: string, hasta?: string): Promise<Alquiler[]> {
    let query = this.supabase.client
      .from('alquileres')
      .select('*, alquiler_extensiones(*), alquiler_pagos(*)')
      .order('inicio', { ascending: false });
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

  async actualizarConsola(id: number, cambios: Partial<Pick<AlquilerConsola, 'nombre' | 'descripcion' | 'controles_incluidos' | 'activo' | 'capacidad' | 'juegos' | 'detalles'>>): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_consolas').update(cambios).eq('id', id);
    if (error) throw error;
  }

  async actualizarTarifa(id: number, precio: number): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_tarifas').update({ precio }).eq('id', id);
    if (error) throw error;
  }

  async actualizarConfig(cambios: Partial<Pick<AlquilerConfig, 'controles_sueltos_ps4' | 'controles_sueltos_ps5' | 'precio_control_extra'>>): Promise<void> {
    const { error } = await this.supabase.client.from('alquiler_config').update(cambios).eq('id', 1);
    if (error) throw error;
  }

  /** Refresca la pantalla cuando otro empleado entrega o recibe una consola. */
  onCambios(callback: () => void): () => void {
    const channel = this.supabase.client
      .channel('alquileres-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alquileres' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alquiler_extensiones' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alquiler_pagos' }, callback)
      .subscribe();
    return () => {
      this.supabase.client.removeChannel(channel);
    };
  }
}
