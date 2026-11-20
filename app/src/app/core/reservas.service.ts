import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { suscribirCambios } from './tiempo-real';
import { fechaColombia } from './zona-horaria';

const BUCKET_RESERVAS = 'reservas';

/** Tiempos que el cliente puede reservar (en minutos). Iguales a los de crear_reserva. */
export const MINUTOS_RESERVA = [30, 60, 90, 120, 180, 240, 300, 360];

export type EstadoReserva = 'pendiente' | 'confirmada' | 'usada' | 'cancelada';

export interface Reserva {
  id: number;
  puesto_id: number;
  cliente_nombre: string;
  /** Opcional en las reservas hechas en el local. */
  cliente_telefono: string | null;
  cliente_cedula?: string | null;
  inicio: string;
  minutos: number;
  precio: number;
  estado: EstadoReserva;
  sesion_id: number | null;
  confirmada_por: string | null;
  confirmada_en: string | null;
  created_at: string;
  /** web = desde el enlace público (paga con el QR); local = la hizo el trabajador (paga al cerrar). */
  origen: 'web' | 'local';
  /** 'gta6' = reserva para jugar GTA 6 (precio propio). */
  juego?: 'gta6' | null;
}

/** sala = /reservar y /gta6-sala (plata del local); domicilio = /alquilar y /gta6-domicilio (plata del alquiler). */
export type DestinoPago = 'sala' | 'domicilio';

export interface ReservasConfig {
  /** QR y llave de la sala. */
  qr_path: string | null;
  llave: string | null;
  /** QR y llave del alquiler a domicilio (cuenta aparte, no se mezcla con la sala). */
  qr_domicilio_path: string | null;
  llave_domicilio: string | null;
  whatsapp: string | null;
  minutos_para_pagar: number;
  dias_maximos: number;
}

/** Lo que ve el cliente en la página pública (sin datos de otros clientes). */
export interface ConsolaPublica {
  id: number;
  nombre: string;
  ocupada: boolean;
  fuera_servicio: boolean;
  motivo_fuera: string | null;
  modalidad: 'cronometrado' | 'conteo_regresivo' | null;
  minutos_pedidos: number | null;
  minutos_jugados: number | null;
  /** Conteo regresivo: hora en que se desocupa. Cronometrado: null (sin hora de salida). */
  libre_en: string | null;
  reservas: { inicio: string; fin: string }[];
}

export interface EstadoPublico {
  ahora: string;
  qr_path: string | null;
  whatsapp: string | null;
  minutos_para_pagar: number;
  dias_maximos: number;
  precios: { minutos: number; precio: number }[];
  consolas: ConsolaPublica[];
}

export interface ReservaCreada {
  id: number;
  numero?: number | null;
  consola: string;
  inicio: string;
  fin: string;
  minutos: number;
  precio: number;
  minutos_para_pagar: number;
}

@Injectable({ providedIn: 'root' })
export class ReservasService {
  constructor(private readonly supabase: SupabaseService) {}

  // ── Página pública (sin login) ──

  async estadoPublico(): Promise<EstadoPublico> {
    const { data, error } = await this.supabase.client.rpc('reservas_publico');
    if (error) throw error;
    const e = data as EstadoPublico;
    return { ...e, precios: e.precios.map((p) => ({ minutos: Number(p.minutos), precio: Number(p.precio) })) };
  }

  async crear(r: { puestoId: number; nombre: string; telefono: string; cedula: string; inicio: string; minutos: number }): Promise<ReservaCreada> {
    const { data, error } = await this.supabase.client.rpc('crear_reserva', {
      p_puesto_id: r.puestoId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_inicio: r.inicio,
      p_minutos: r.minutos,
      p_cliente_cedula: r.cedula,
    });
    if (error) throw error;
    const c = data as ReservaCreada;
    return { ...c, precio: Number(c.precio) };
  }

  /** URL pública de la imagen del QR de pago. */
  urlQr(path: string | null): string | null {
    if (!path) return null;
    return this.supabase.client.storage.from(BUCKET_RESERVAS).getPublicUrl(path).data.publicUrl;
  }

  // ── Módulo Reservas (admin y trabajador) ──

  /** Reservas con hora de inicio desde `desde` (ISO). */
  async listar(desde: string): Promise<Reserva[]> {
    const { data, error } = await this.supabase.client
      .from('reservas')
      .select('*')
      .gte('inicio', desde)
      .order('inicio');
    if (error) throw error;
    return (data as Reserva[]).map((r) => ({ ...r, precio: Number(r.precio) }));
  }

  /** Reservas confirmadas o usadas con hora de inicio entre `desde` y `hasta` (ISO), con el nombre de la consola. */
  async realizadas(desde: string, hasta: string): Promise<(Reserva & { puestos: { nombre: string } | null })[]> {
    const { data, error } = await this.supabase.client
      .from('reservas')
      .select('*, puestos(nombre)')
      .in('estado', ['confirmada', 'usada'])
      .gte('inicio', desde)
      .lte('inicio', hasta)
      .order('inicio');
    if (error) throw error;
    return (data as (Reserva & { puestos: { nombre: string } | null })[]).map((r) => ({ ...r, precio: Number(r.precio) }));
  }

  /** El trabajador aparta una consola para un cliente del local: queda confirmada y paga al cerrar. */
  async reservarLocal(r: { puestoId: number; nombre: string; telefono: string | null; cedula: string; inicio: string; minutos: number }): Promise<Reserva> {
    const { data, error } = await this.supabase.client.rpc('reservar_local', {
      p_puesto_id: r.puestoId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_inicio: r.inicio,
      p_minutos: r.minutos,
      p_cliente_cedula: r.cedula,
    });
    if (error) throw error;
    return data as Reserva;
  }

  async confirmar(id: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('confirmar_reserva', { p_reserva_id: id });
    if (error) throw error;
  }

  async cancelar(id: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('cancelar_reserva', { p_reserva_id: id });
    if (error) throw error;
  }

  /** Abre la sesión de la reserva en la Sala (conteo regresivo con el precio ya pagado). */
  /** Mueve la reserva a otra consola (la original queda libre). Con `iniciarYa` empieza ahora allá. */
  async transferir(id: number, puestoDestino: number, iniciarYa: boolean): Promise<void> {
    const { error } = await this.supabase.client.rpc('transferir_reserva', {
      p_reserva_id: id,
      p_puesto_destino: puestoDestino,
      p_iniciar_ya: iniciarYa,
    });
    if (error) throw error;
  }

  async iniciar(id: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('iniciar_reserva', { p_reserva_id: id });
    if (error) throw error;
  }

  async config(): Promise<ReservasConfig> {
    const { data, error } = await this.supabase.client.from('reservas_config').select('*').eq('id', 1).single();
    if (error) throw error;
    return data as ReservasConfig;
  }

  /** Solo admin (RLS). */
  async guardarConfig(cambios: Partial<ReservasConfig>): Promise<void> {
    const { error } = await this.supabase.client.from('reservas_config').update(cambios).eq('id', 1);
    if (error) throw error;
  }

  /** QR y llave que ve el cliente según el negocio (sin login: la tabla se lee en público). */
  async pago(destino: DestinoPago): Promise<{ qr: string | null; llave: string | null }> {
    const c = await this.config();
    return destino === 'sala'
      ? { qr: this.urlQr(c.qr_path), llave: c.llave }
      : { qr: this.urlQr(c.qr_domicilio_path), llave: c.llave_domicilio };
  }

  /** Sala: solo admin. Domicilio: admin o rol alquiler. Sube la imagen y la deja como la de pago. */
  async subirQr(archivo: File, destino: DestinoPago = 'sala'): Promise<void> {
    const ext = (archivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${destino === 'domicilio' ? 'domicilio/' : ''}qr-${Date.now()}.${ext}`;
    const { error } = await this.supabase.client.storage
      .from(BUCKET_RESERVAS)
      .upload(path, archivo, { contentType: archivo.type || undefined });
    if (error) throw error;
    const { data: anterior, error: e2 } = await this.supabase.client.rpc('guardar_qr_pago', { p_destino: destino, p_path: path });
    if (e2) {
      await this.supabase.client.storage.from(BUCKET_RESERVAS).remove([path]);
      throw e2;
    }
    if (anterior) await this.supabase.client.storage.from(BUCKET_RESERVAS).remove([anterior as string]);
  }

  /** Solo el dueño puede cambiar QR y llaves (regla del dueño, candado en la base de datos). */
  async puedoEditarPagos(): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('puedo_editar_pagos');
    if (error) return false;
    return data === true;
  }

  /** Llave (Bre-B, celular o cuenta) para quien no sabe pagar con QR. Vacía = se quita. */
  async guardarLlave(destino: DestinoPago, llave: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('guardar_llave_pago', { p_destino: destino, p_llave: llave });
    if (error) throw error;
  }

  onCambios(callback: () => void): () => void {
    return suscribirCambios(this.supabase.client, 'reservas', ['reservas', 'sesiones'], callback);
  }
}

/** Reserva que todavía aparta la consola: confirmada, o pendiente dentro del tiempo para pagar. */
export function reservaVigente(r: Reserva, minutosParaPagar: number, ahora = Date.now()): boolean {
  if (r.estado === 'confirmada') return true;
  return r.estado === 'pendiente' && new Date(r.created_at).getTime() > ahora - minutosParaPagar * 60_000;
}

/**
 * Número de reserva del día: empieza en 1 cada día (día de la reserva en Colombia), en orden
 * de creación. Solo cuentan las confirmadas, las usadas y las pendientes aún dentro del tiempo
 * para pagar: una cancelada, o una pendiente que se venció sin confirmar, no tiene número y las
 * que se hicieron después bajan uno. La lista debe traer los días completos.
 */
export function numerarPorDia(lista: Reserva[], minutosParaPagar: number, ahora = Date.now()): Map<number, number> {
  const orden = lista
    .filter((r) => r.estado === 'usada' || reservaVigente(r, minutosParaPagar, ahora))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const porDia = new Map<string, number>();
  const numeros = new Map<number, number>();
  for (const r of orden) {
    const dia = fechaColombia(r.inicio);
    const n = (porDia.get(dia) ?? 0) + 1;
    porDia.set(dia, n);
    numeros.set(r.id, n);
  }
  return numeros;
}

/** Fin de una reserva (ISO). */
export function finReserva(r: { inicio: string; minutos: number }): string {
  return new Date(new Date(r.inicio).getTime() + r.minutos * 60_000).toISOString();
}

/**
 * Hora (ms) desde la que una consola queda libre de verdad: fin de la sesión en curso (o ahora) y,
 * si hay reservas pegadas, el fin de la última de la cadena. Un hueco menor al tiempo mínimo
 * de reserva no sirve para reservar, así que también se salta.
 */
export function libreDesdeMs(
  c: { libre_en: string | null; reservas: { inicio: string; fin: string }[] },
  ahora = Date.now(),
  huecoMinimoMin = MINUTOS_RESERVA[0],
): number {
  let t = Math.max(ahora, c.libre_en ? new Date(c.libre_en).getTime() : ahora);
  const orden = [...c.reservas].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  for (const r of orden) {
    const ini = new Date(r.inicio).getTime();
    const fin = new Date(r.fin).getTime();
    if (fin <= t) continue;
    if (ini - t >= huecoMinimoMin * 60_000) break;
    t = fin;
  }
  return t;
}

/** Enlace de WhatsApp a un número colombiano (10 dígitos = se antepone 57). */
export function enlaceWhatsapp(telefono: string | null, texto?: string): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length < 7) return null;
  const numero = digitos.length === 10 ? '57' + digitos : digitos;
  return `https://wa.me/${numero}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}
