import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { suscribirCambios } from './tiempo-real';
import {
  Alquiler,
  Cliente,
  AlquilerConfig,
  AlquilerConsola,
  AlquilerTarifa,
  ConsolaConEstado,
  TipoConsola,
} from './models';

/** Igual que private.normalizar_telefono: solo dígitos; 57 + 10 dígitos queda en 10. */
export function normalizarTelefono(telefono: string | null | undefined): string {
  const d = (telefono ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('57') ? d.slice(2) : d;
}

export interface EdicionAlquiler {
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  notas: string | null;
  /** ISO con zona. */
  inicio: string;
  finPactado: string;
  precioTotal: number;
  pagoLlave: number;
  pagoEfectivo: number;
  /** Hora real de recibido (solo alquileres devueltos); null = no cambia. */
  devueltoEn?: string | null;
}

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
  /** Hora real de entrega si se registra después (ISO con zona); null = ahora. */
  inicio?: string | null;
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
      p_inicio: a.inicio ?? null,
    });
    if (error) throw error;
    return data as Alquiler;
  }

  /** Cliente registrado con ese teléfono (null si es nuevo). */
  async buscarCliente(telefono: string): Promise<Cliente | null> {
    const tel = normalizarTelefono(telefono);
    if (tel.length < 7) return null;
    const { data, error } = await this.supabase.client.from('vista_clientes').select('*').eq('telefono', tel).maybeSingle();
    if (error) throw error;
    return (data as Cliente | null) ?? null;
  }

  async listarClientes(): Promise<Cliente[]> {
    const { data, error } = await this.supabase.client.from('vista_clientes').select('*').order('ultimo_alquiler', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data as Cliente[];
  }

  async actualizarCliente(id: number, cambios: Partial<Pick<Cliente, 'nombre' | 'direccion' | 'notas'>>): Promise<void> {
    const { error } = await this.supabase.client.from('clientes').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
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

  /** Pago de la entrega por pote (para precargar la edición). */
  async pagoEntrega(alquilerId: number): Promise<{ llave: number; efectivo: number }> {
    const { data, error } = await this.supabase.client
      .from('alquiler_pagos')
      .select('pote, monto')
      .eq('alquiler_id', alquilerId)
      .eq('concepto', 'entrega');
    if (error) throw error;
    const suma = (pote: string) => (data ?? []).filter((p) => p.pote === pote).reduce((t, p) => t + Number(p.monto), 0);
    return { llave: suma('llave'), efectivo: suma('efectivo') };
  }

  /** Corrige un alquiler: cliente, notas, horas, precio de la entrega y en qué pote entró. */
  async editar(alquilerId: number, e: EdicionAlquiler): Promise<Alquiler> {
    const { data, error } = await this.supabase.client.rpc('editar_alquiler', {
      p_alquiler_id: alquilerId,
      p_cliente_nombre: e.clienteNombre,
      p_cliente_telefono: e.clienteTelefono,
      p_cliente_direccion: e.clienteDireccion,
      p_notas: e.notas,
      p_inicio: e.inicio,
      p_fin_pactado: e.finPactado,
      p_precio_total: e.precioTotal,
      p_pago_llave: e.pagoLlave,
      p_pago_efectivo: e.pagoEfectivo,
      p_devuelto_en: e.devueltoEn ?? null,
    });
    if (error) throw error;
    return data as Alquiler;
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

  async actualizarConsola(id: number, cambios: Partial<Pick<AlquilerConsola, 'nombre' | 'descripcion' | 'controles_incluidos' | 'activo' | 'capacidad' | 'juegos' | 'detalles' | 'serial'>>): Promise<void> {
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
    return suscribirCambios(this.supabase.client, 'alquileres', ['alquileres', 'alquiler_extensiones', 'alquiler_pagos'], callback);
  }
}
