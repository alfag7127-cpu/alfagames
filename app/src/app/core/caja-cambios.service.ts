import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * Cambio de plata en la caja de la sala (no es ingreso ni gasto).
 * 'a_efectivo': el cliente pidió efectivo y lo pagó por QR (entra transferencia, sale efectivo).
 * 'a_transferencia': el cliente entregó efectivo y se le transfirió (entra efectivo, sale transferencia).
 */
export interface CajaCambio {
  id: number;
  tipo: 'a_efectivo' | 'a_transferencia';
  monto: number;
  nota: string | null;
  empleado_id: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CajaCambiosService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Cambios con fecha entre `desde` y `hasta` (ISO), del más nuevo al más antiguo. */
  async listar(desde?: string, hasta?: string): Promise<CajaCambio[]> {
    let query = this.supabase.client.from('caja_cambios').select('*').order('created_at', { ascending: false });
    if (desde) query = query.gte('created_at', desde);
    if (hasta) query = query.lte('created_at', hasta);
    const { data, error } = await query;
    if (error) throw error;
    return (data as CajaCambio[]).map((c) => ({ ...c, monto: Number(c.monto) }));
  }

  async crear(tipo: CajaCambio['tipo'], monto: number, nota: string | null): Promise<void> {
    const { error } = await this.supabase.client.from('caja_cambios').insert({ tipo, monto, nota });
    if (error) throw error;
  }

  async eliminar(id: number): Promise<void> {
    const { data, error } = await this.supabase.client.from('caja_cambios').delete().eq('id', id).select('id');
    if (error) throw error;
    // RLS no da error al borrar algo ajeno o viejo: simplemente no borra nada.
    if (!data?.length) throw new Error('Solo puedes borrar tus cambios del mismo día (el admin, cualquiera).');
  }
}
