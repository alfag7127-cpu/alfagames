import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { suscribirCambios } from './tiempo-real';
import { PlanGta6, Rango, ReservaAlquiler } from './gta6.service';
import { TipoConsola } from './models';

export type FormaPagoReserva = 'qr' | 'efectivo';

/** Lo que ve el cliente en /alquilar (sin datos de otros clientes). */
export interface AlquilerPublico {
  ahora: string;
  dias_maximos: number;
  qr_path: string | null;
  whatsapp: string | null;
  minutos_para_pagar: number;
  noche_desde: string;
  noche_hasta: string;
  planes: (PlanGta6 & { tipo: TipoConsola })[];
  /** Una entrada por consola activa: rangos ocupados (ya con el margen de entrega). */
  consolas: { tipo: TipoConsola; ocupado: Rango[] }[];
}

export interface ReservaAlquilerCreada {
  id: number;
  tipo: TipoConsola;
  plan: string;
  inicio: string;
  fin: string;
  precio: number;
  forma_pago: FormaPagoReserva;
  minutos_para_pagar: number;
}

/** Reservas de alquiler PS4/PS5 a domicilio (enlace /alquilar), pago con QR o en efectivo al recibir. */
@Injectable({ providedIn: 'root' })
export class ReservasAlquilerService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  async publico(): Promise<AlquilerPublico> {
    const { data, error } = await this.db.rpc('alquiler_publico');
    if (error) throw error;
    const e = data as AlquilerPublico;
    return { ...e, planes: e.planes.map((p) => ({ ...p, precio: Number(p.precio) })) };
  }

  async crear(r: {
    tarifaId: number;
    nombre: string;
    telefono: string;
    direccion: string;
    inicio: string;
    formaPago: FormaPagoReserva;
  }): Promise<ReservaAlquilerCreada> {
    const { data, error } = await this.db.rpc('crear_reserva_alquiler', {
      p_tarifa_id: r.tarifaId,
      p_cliente_nombre: r.nombre,
      p_cliente_telefono: r.telefono,
      p_cliente_direccion: r.direccion,
      p_inicio: r.inicio,
      p_forma_pago: r.formaPago,
    });
    if (error) throw error;
    const c = data as ReservaAlquilerCreada;
    return { ...c, precio: Number(c.precio) };
  }

  /** Reservas normales (no GTA 6). */
  async listar(): Promise<ReservaAlquiler[]> {
    const { data, error } = await this.db
      .from('reservas_alquiler')
      .select('*, alquiler_consolas(nombre, tipo)')
      .is('juego', null)
      .order('inicio');
    if (error) throw error;
    return (data as ReservaAlquiler[]).map((r) => ({ ...r, precio: Number(r.precio) }));
  }

  /** QR: pago verificado (entra a los potes). Efectivo: reserva confirmada, sin dinero. */
  async confirmar(id: number, llave: number | null, efectivo: number | null): Promise<void> {
    const { error } = await this.db.rpc('confirmar_reserva_alquiler', {
      p_reserva_id: id,
      p_pago_llave: llave,
      p_pago_efectivo: efectivo,
    });
    if (error) throw error;
  }

  /** Entrega la consola. Si paga al recibir, `llave`/`efectivo` es el cobro de ahora. */
  async entregar(id: number, consolaId: number | null, llave: number | null, efectivo: number | null): Promise<void> {
    const { error } = await this.db.rpc('entregar_reserva_alquiler', {
      p_reserva_id: id,
      p_consola_id: consolaId,
      p_pago_llave: llave,
      p_pago_efectivo: efectivo,
    });
    if (error) throw error;
  }

  async cancelar(id: number, devolver: boolean): Promise<void> {
    const { error } = await this.db.rpc('cancelar_reserva_alquiler', { p_reserva_id: id, p_devolver: devolver });
    if (error) throw error;
  }

  onCambios(callback: () => void): () => void {
    return suscribirCambios(this.db, 'reservas-alquiler', ['reservas_alquiler'], callback);
  }
}
