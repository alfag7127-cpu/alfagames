import { Injectable } from '@angular/core';
import { PoteMovimiento, PrestamoPendiente, SaldoPote, TipoMovimiento } from './models';
import { SupabaseService } from './supabase.service';

export interface NuevoMovimiento {
  fecha: string;
  tipo: TipoMovimiento;
  pote: 'llave' | 'efectivo';
  poteDestino: 'llave' | 'efectivo' | null;
  monto: number;
  persona: string | null;
  descripcion: string | null;
}

/** Tipos que sacan dinero del pote (el traslado saca del origen y mete al destino). */
export const TIPOS_SALIDA: TipoMovimiento[] = ['prestamo', 'inversion', 'otro_egreso'];

export const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  prestamo: 'Préstamo',
  abono_prestamo: 'Abono de préstamo',
  inversion: 'Inversión (compras)',
  otro_egreso: 'Otro egreso',
  otro_ingreso: 'Otro ingreso',
  traslado: 'Traslado entre potes',
};

/**
 * Dinero de los potes del alquiler: saldos, préstamos e inversiones.
 * Saldo = cobros de alquiler + entradas - salidas. Solo el admin registra movimientos.
 */
@Injectable({ providedIn: 'root' })
export class PotesService {
  constructor(private readonly supabase: SupabaseService) {}

  async saldos(): Promise<SaldoPote[]> {
    const { data, error } = await this.supabase.client.from('vista_potes').select('*');
    if (error) throw error;
    return data as SaldoPote[];
  }

  async prestamosPendientes(): Promise<PrestamoPendiente[]> {
    const { data, error } = await this.supabase.client
      .from('vista_prestamos_pendientes')
      .select('*')
      .order('pendiente', { ascending: false });
    if (error) throw error;
    return data as PrestamoPendiente[];
  }

  async movimientos(desde: string, hasta: string): Promise<PoteMovimiento[]> {
    const { data, error } = await this.supabase.client
      .from('pote_movimientos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as PoteMovimiento[];
  }

  async crear(m: NuevoMovimiento): Promise<void> {
    const { error } = await this.supabase.client.from('pote_movimientos').insert({
      fecha: m.fecha,
      tipo: m.tipo,
      pote: m.pote,
      pote_destino: m.tipo === 'traslado' ? m.poteDestino : null,
      monto: m.monto,
      persona: m.persona,
      descripcion: m.descripcion,
    });
    if (error) throw error;
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase.client.from('pote_movimientos').delete().eq('id', id);
    if (error) throw error;
  }
}
