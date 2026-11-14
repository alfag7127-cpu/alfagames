import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { suscribirCambios } from './tiempo-real';
import { Reserva } from './reservas.service';
import { AlquilerTarifa } from './models';

export interface Rango {
  inicio: string;
  fin: string;
}

export interface PlanGta6 {
  id: number;
  nombre: string;
  horas: number | null;
  es_noche: boolean;
  precio: number;
}

/** Lo que ven los clientes en /gta6-sala y /gta6-domicilio (sin datos de otros clientes). */
export interface Gta6Publico {
  ahora: string;
  lanzamiento: string;
  dias_maximos: number;
  margen_minutos: number;
  qr_path: string | null;
  whatsapp: string | null;
  minutos_para_pagar: number;
  noche_desde: string;
  noche_hasta: string;
  sala_precios: { minutos: number; precio: number }[];
  sala_consolas: { id: number; nombre: string; fuera_servicio: boolean; reservas: Rango[] }[];
  alquiler_planes: PlanGta6[];
  /** Una entrada por PS5 con el juego: rangos ocupados (ya con el margen de entrega). */
  alquiler_consolas: { ocupado: Rango[] }[];
}

export interface Gta6Config {
  lanzamiento: string;
  dias_maximos: number;
  margen_minutos: number;
}

export type EstadoReservaAlquiler = 'pendiente' | 'confirmada' | 'entregada' | 'cancelada';

export interface ReservaAlquiler {
  id: number;
  consola_id: number;
  tarifa_id: number;
  plan_nombre: string;
  inicio: string;
  fin: string;
  precio: number;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_direccion: string;
  estado: EstadoReservaAlquiler;
  /** 'gta6' = reserva GTA 6; null = alquiler normal (PS4) desde /alquilar. */
  juego: 'gta6' | null;
  /** qr = pagó con el QR (se confirma el pago); efectivo = paga al recibir. */
  forma_pago: 'qr' | 'efectivo';
  alquiler_id: number | null;
  confirmada_en: string | null;
  created_at: string;
  alquiler_consolas?: { nombre: string } | null;
}

export interface ReservaGta6Creada {
  id: number;
  numero?: number | null;
  consola?: string;
  plan?: string;
  inicio: string;
  fin: string;
  precio: number;
  minutos_para_pagar: number;
}

@Injectable({ providedIn: 'root' })
export class Gta6Service {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  // ── Páginas públicas ──

  async publico(): Promise<Gta6Publico> {
    const { data, error } = await this.db.rpc('gta6_publico');
    if (error) throw error;
    const e = data as Gta6Publico;
    return {
      ...e,
      sala_precios: e.sala_precios.map((p) => ({ minutos: Number(p.minutos), precio: Number(p.precio) })),
      alquiler_planes: e.alquiler_planes.map((p) => ({ ...p, precio: Number(p.precio) })),
    };
  }

  async crearSala(r: { puestoId: number; nombre: string; telefono: string; inicio: string; minutos: number }): Promise<ReservaGta6Creada> {
    const { data, error } = await this.db.rpc('crear_reserva_gta6', {
      p_puesto_id: r.puestoId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_inicio: r.inicio,
      p_minutos: r.minutos,
    });
    if (error) throw error;
    const c = data as ReservaGta6Creada;
    return { ...c, precio: Number(c.precio) };
  }

  async crearDomicilio(r: { tarifaId: number; nombre: string; telefono: string; direccion: string; inicio: string }): Promise<ReservaGta6Creada> {
    const { data, error } = await this.db.rpc('crear_reserva_gta6_alquiler', {
      p_tarifa_id: r.tarifaId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_cliente_direccion: r.direccion,
      p_inicio: r.inicio,
    });
    if (error) throw error;
    const c = data as ReservaGta6Creada;
    return { ...c, precio: Number(c.precio) };
  }

  // ── Módulo interno /gta6 ──

  async reservasSala(): Promise<Reserva[]> {
    const { data, error } = await this.db.from('reservas').select('*').eq('juego', 'gta6').order('inicio');
    if (error) throw error;
    return (data as Reserva[]).map((r) => ({ ...r, precio: Number(r.precio) }));
  }

  async reservasDomicilio(): Promise<ReservaAlquiler[]> {
    const { data, error } = await this.db.from('reservas_alquiler').select('*, alquiler_consolas(nombre)').eq('juego', 'gta6').order('inicio');
    if (error) throw error;
    return (data as ReservaAlquiler[]).map((r) => ({ ...r, precio: Number(r.precio) }));
  }

  async confirmarDomicilio(id: number, llave: number, efectivo: number): Promise<void> {
    const { error } = await this.db.rpc('confirmar_reserva_alquiler', { p_reserva_id: id, p_pago_llave: llave, p_pago_efectivo: efectivo });
    if (error) throw error;
  }

  async entregar(id: number, consolaId: number | null): Promise<void> {
    const { error } = await this.db.rpc('entregar_reserva_alquiler', { p_reserva_id: id, p_consola_id: consolaId });
    if (error) throw error;
  }

  async cancelarDomicilio(id: number, devolver: boolean): Promise<void> {
    const { error } = await this.db.rpc('cancelar_reserva_alquiler', { p_reserva_id: id, p_devolver: devolver });
    if (error) throw error;
  }

  async config(): Promise<Gta6Config> {
    const { data, error } = await this.db.from('gta6_config').select('*').eq('id', 1).single();
    if (error) throw error;
    return data as Gta6Config;
  }

  /** Solo admin (RLS). */
  async guardarConfig(c: Partial<Gta6Config>): Promise<void> {
    const { error } = await this.db.from('gta6_config').update(c).eq('id', 1);
    if (error) throw error;
  }

  async preciosSala(): Promise<{ minutos: number; precio: number }[]> {
    const { data, error } = await this.db.from('gta6_precios_sala').select('*').order('minutos');
    if (error) throw error;
    return (data as { minutos: number; precio: number }[]).map((p) => ({ minutos: p.minutos, precio: Number(p.precio) }));
  }

  /** Solo admin (RLS). Crea o cambia el precio de ese tiempo. */
  async guardarPrecioSala(minutos: number, precio: number): Promise<void> {
    const { error } = await this.db.from('gta6_precios_sala').upsert({ minutos, precio });
    if (error) throw error;
  }

  async borrarPrecioSala(minutos: number): Promise<void> {
    const { error } = await this.db.from('gta6_precios_sala').delete().eq('minutos', minutos);
    if (error) throw error;
  }

  async puestos(): Promise<{ id: number; nombre: string; gta6: boolean }[]> {
    const { data, error } = await this.db.from('puestos').select('id, nombre, gta6').eq('activo', true).order('id');
    if (error) throw error;
    return data as { id: number; nombre: string; gta6: boolean }[];
  }

  async marcarPuesto(id: number, gta6: boolean): Promise<void> {
    const { error } = await this.db.rpc('marcar_gta6_puesto', { p_puesto_id: id, p_gta6: gta6 });
    if (error) throw error;
  }

  async consolasAlquiler(): Promise<{ id: number; nombre: string; tipo: string; gta6: boolean }[]> {
    const { data, error } = await this.db
      .from('alquiler_consolas')
      .select('id, nombre, tipo, gta6')
      .eq('activo', true)
      .eq('tipo', 'PS5')
      .order('nombre');
    if (error) throw error;
    return data as { id: number; nombre: string; tipo: string; gta6: boolean }[];
  }

  async marcarConsola(id: number, gta6: boolean): Promise<void> {
    const { error } = await this.db.rpc('marcar_gta6_consola', { p_consola_id: id, p_gta6: gta6 });
    if (error) throw error;
  }

  async planes(): Promise<AlquilerTarifa[]> {
    const { data, error } = await this.db.from('alquiler_tarifas').select('*').eq('gta6', true).order('orden').order('id');
    if (error) throw error;
    return (data as AlquilerTarifa[]).map((t) => ({ ...t, precio: Number(t.precio) }));
  }

  async crearPlan(p: { nombre: string; horas: number | null; es_noche: boolean; precio: number }): Promise<void> {
    const { error } = await this.db.from('alquiler_tarifas').insert({
      tipo: 'PS5',
      nombre: p.nombre,
      horas: p.es_noche ? null : p.horas,
      es_noche: p.es_noche,
      precio: p.precio,
      orden: 100 + (p.es_noche ? 999 : (p.horas ?? 0)),
      activo: true,
      gta6: true,
    });
    if (error) throw error;
  }

  async actualizarPlan(id: number, cambios: { nombre?: string; precio?: number; activo?: boolean }): Promise<void> {
    const { error } = await this.db.from('alquiler_tarifas').update(cambios).eq('id', id);
    if (error) throw error;
  }

  onCambios(callback: () => void): () => void {
    return suscribirCambios(this.db, 'gta6', ['reservas', 'reservas_alquiler'], callback);
  }
}
