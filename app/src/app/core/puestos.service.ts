import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Puesto } from './models';

/**
 * Administración de puestos (solo admin, lo exige RLS). "Quitar" un puesto lo marca
 * como inactivo: sale de la Sala pero conserva su historial y se puede reactivar.
 * La base de datos no deja quitar un puesto con una sesión activa.
 */
@Injectable({ providedIn: 'root' })
export class PuestosService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(): Promise<Puesto[]> {
    const { data, error } = await this.supabase.client.from('puestos').select('*').order('id');
    if (error) throw error;
    return data as Puesto[];
  }

  async crear(nombre: string): Promise<void> {
    const { error } = await this.supabase.client.from('puestos').insert({ nombre });
    if (error) throw error;
  }

  async renombrar(id: number, nombre: string): Promise<void> {
    const { error } = await this.supabase.client.from('puestos').update({ nombre }).eq('id', id);
    if (error) throw error;
  }

  async cambiarActivo(id: number, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('puestos').update({ activo }).eq('id', id);
    if (error) throw error;
  }
}
