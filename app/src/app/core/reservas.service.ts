import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { suscribirCambios } from './tiempo-real';

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
}

export interface ReservasConfig {
  qr_path: string | null;
  whatsapp: string | null;
  minutos_para_pagar: number;
  dias_maximos: number;
}

/** Lo que ve el cliente en la página pública (sin datos de otros clientes). */
export interface ConsolaPublica {
  id: number;
  nombre: string;
  ocupada: boolean;
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

  async crear(r: { puestoId: number; nombre: string; telefono: string; inicio: string; minutos: number }): Promise<ReservaCreada> {
    const { data, error } = await this.supabase.client.rpc('crear_reserva', {
      p_puesto_id: r.puestoId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_inicio: r.inicio,
      p_minutos: r.minutos,
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

  /** El trabajador aparta una consola para un cliente del local: queda confirmada y paga al cerrar. */
  async reservarLocal(r: { puestoId: number; nombre: string; telefono: string | null; inicio: string; minutos: number }): Promise<Reserva> {
    const { data, error } = await this.supabase.client.rpc('reservar_local', {
      p_puesto_id: r.puestoId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_inicio: r.inicio,
      p_minutos: r.minutos,
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

  /** Solo admin: sube la imagen del QR y la deja como la de pago. */
  async subirQr(archivo: File): Promise<void> {
    const ext = (archivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `qr-${Date.now()}.${ext}`;
    const { error } = await this.supabase.client.storage
      .from(BUCKET_RESERVAS)
      .upload(path, archivo, { contentType: archivo.type || undefined });
    if (error) throw error;
    const anterior = (await this.config()).qr_path;
    await this.guardarConfig({ qr_path: path });
    if (anterior) await this.supabase.client.storage.from(BUCKET_RESERVAS).remove([anterior]);
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

/** Fin de una reserva (ISO). */
export function finReserva(r: { inicio: string; minutos: number }): string {
  return new Date(new Date(r.inicio).getTime() + r.minutos * 60_000).toISOString();
}

/** Enlace de WhatsApp a un número colombiano (10 dígitos = se antepone 57). */
export function enlaceWhatsapp(telefono: string | null, texto?: string): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length < 7) return null;
  const numero = digitos.length === 10 ? '57' + digitos : digitos;
  return `https://wa.me/${numero}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}
