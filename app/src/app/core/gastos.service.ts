import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Gasto } from './models';

export interface NuevoGasto {
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: string | null;
  adminId: string;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(desde?: string, hasta?: string): Promise<Gasto[]> {
    let query = this.supabase.client.from('gastos').select('*').order('fecha', { ascending: false });
    if (desde) query = query.gte('fecha', desde);
    if (hasta) query = query.lte('fecha', hasta);

    const { data, error } = await query;
    if (error) throw error;
    return data as Gasto[];
  }

  async crear(gasto: NuevoGasto): Promise<Gasto> {
    const { data, error } = await this.supabase.client
      .from('gastos')
      .insert({
        fecha: gasto.fecha,
        descripcion: gasto.descripcion,
        monto: gasto.monto,
        categoria: gasto.categoria,
        admin_id: gasto.adminId,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Gasto;
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase.client.from('gastos').delete().eq('id', id);
    if (error) throw error;
  }
}
