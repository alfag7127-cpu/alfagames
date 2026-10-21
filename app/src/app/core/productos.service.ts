import { Injectable } from '@angular/core';
import { Producto, VentaProducto } from './models';
import { SupabaseService } from './supabase.service';
import { suscribirCambios } from './tiempo-real';

export interface NuevoProducto {
  nombre: string;
  precioCompra: number;
  precioVenta: number;
  stockInicial: number;
}

/**
 * Productos de la sala (gaseosas, panes, snacks…). Vender lo puede hacer cualquier
 * usuario (descuenta inventario en el servidor); crear, cargar inventario, cambiar
 * precios y anular ventas solo el admin.
 */
@Injectable({ providedIn: 'root' })
export class ProductosService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(soloActivos = false): Promise<Producto[]> {
    let query = this.supabase.client.from('productos').select('*').order('nombre');
    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return data as Producto[];
  }

  /** `sesionId`: carga la venta a la cuenta de esa consola (null = venta de mostrador). */
  async vender(
    productoId: number,
    cantidad: number,
    sesionId: number | null = null,
    precioUnitario: number | null = null,
  ): Promise<VentaProducto> {
    const { data, error } = await this.supabase.client.rpc('vender_producto', {
      p_producto_id: productoId,
      p_cantidad: cantidad,
      p_precio_unitario: precioUnitario,
      p_sesion_id: sesionId,
    });
    if (error) throw error;
    return data as VentaProducto;
  }

  async ventas(desde?: string, hasta?: string): Promise<VentaProducto[]> {
    let query = this.supabase.client.from('ventas_productos').select('*').order('created_at', { ascending: false });
    if (desde) query = query.gte('created_at', desde);
    if (hasta) query = query.lte('created_at', hasta);
    const { data, error } = await query;
    if (error) throw error;
    return data as VentaProducto[];
  }

  // ── Admin ──

  /** Crea el producto y, si hay cantidad inicial, la registra como entrada de inventario. */
  async crear(p: NuevoProducto): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('productos')
      .insert({ nombre: p.nombre, precio_compra: p.precioCompra, precio_venta: p.precioVenta, stock: 0 })
      .select()
      .single();
    if (error) throw error;
    if (p.stockInicial > 0) await this.agregarStock((data as Producto).id, p.stockInicial, p.precioCompra);
  }

  async agregarStock(productoId: number, cantidad: number, precioCompra: number | null): Promise<void> {
    const { error } = await this.supabase.client.rpc('agregar_stock', {
      p_producto_id: productoId,
      p_cantidad: cantidad,
      p_precio_compra: precioCompra,
    });
    if (error) throw error;
  }

  async actualizar(id: number, cambios: Partial<Pick<Producto, 'nombre' | 'precio_compra' | 'precio_venta' | 'activo' | 'stock'>>): Promise<void> {
    const { error } = await this.supabase.client.from('productos').update(cambios).eq('id', id);
    if (error) throw error;
  }

  async anularVenta(ventaId: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('anular_venta_producto', { p_venta_id: ventaId });
    if (error) throw error;
  }

  onCambios(callback: () => void): () => void {
    return suscribirCambios(this.supabase.client, 'productos', ['productos', 'ventas_productos'], callback);
  }
}
