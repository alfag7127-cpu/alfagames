import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Producto, VentaProducto } from '../../core/models';
import { ProductosService } from '../../core/productos.service';
import { ToastService } from '../../core/toast.service';
import { fechaColombia, finDiaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';
import { VentaProductos } from '../../shared/venta-productos';

/** Inventario de productos de la sala, sus precios y las ventas del período (solo admin). */
@Component({
  selector: 'app-productos',
  imports: [FormsModule, DecimalPipe, DatePipe, VentaProductos],
  template: `
    <h2 class="text-lg font-bold text-slate-900 mb-3">Productos</h2>

    <div class="mb-4">
      <app-venta-productos [ancho]="true" />
    </div>

    <!-- Resumen del período -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div class="rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white p-4 shadow-sm">
        <p class="text-[11px] uppercase tracking-wide text-blue-200">Ventas del período</p>
        <p class="text-2xl font-bold tabular-nums">{{ resumen().ventas | number: '1.0-0' }}</p>
      </div>
      <div class="rounded-xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
        <p class="text-[11px] uppercase tracking-wide text-slate-500">Costo de lo vendido</p>
        <p class="text-2xl font-bold text-slate-900 tabular-nums">{{ resumen().costo | number: '1.0-0' }}</p>
      </div>
      <div class="rounded-xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
        <p class="text-[11px] uppercase tracking-wide text-slate-500">Ganancia</p>
        <p class="text-2xl font-bold text-emerald-700 tabular-nums">{{ resumen().ventas - resumen().costo | number: '1.0-0' }}</p>
      </div>
      <div class="rounded-xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
        <p class="text-[11px] uppercase tracking-wide text-slate-500">Inventario a costo</p>
        <p class="text-2xl font-bold text-slate-900 tabular-nums">{{ valorInventario() | number: '1.0-0' }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <!-- Inventario -->
      <section class="xl:col-span-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <h3 class="font-semibold text-slate-900 mb-3">Inventario</h3>

        <form (ngSubmit)="crear()" class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4 items-end">
          <label class="col-span-2 text-xs font-medium text-slate-500">
            Nombre del producto
            <input [(ngModel)]="nuevoNombre" name="nuevoNombre" placeholder="Ej. Gaseosa litro"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <label class="text-xs font-medium text-slate-500">
            Precio compra
            <input type="number" min="0" step="100" [(ngModel)]="nuevoCompra" name="nuevoCompra"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <label class="text-xs font-medium text-slate-500">
            Precio venta
            <input type="number" min="0" step="100" [(ngModel)]="nuevoVenta" name="nuevoVenta"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <label class="text-xs font-medium text-slate-500">
            Cantidad
            <input type="number" min="0" [(ngModel)]="nuevoCantidad" name="nuevoCantidad"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <button type="submit" class="col-span-2 sm:col-span-5 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Agregar producto
          </button>
        </form>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th class="py-2 pr-3 font-medium">Producto</th>
                <th class="py-2 pr-3 font-medium text-right">Compra</th>
                <th class="py-2 pr-3 font-medium text-right">Venta</th>
                <th class="py-2 pr-3 font-medium text-right">Ganancia c/u</th>
                <th class="py-2 pr-3 font-medium text-right">Cantidad</th>
                <th class="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of productos(); track p.id) {
                <tr [class.opacity-50]="!p.activo">
                  <td class="py-2 pr-3 font-medium text-slate-800">{{ p.nombre }}</td>
                  <td class="py-2 pr-3 text-right">
                    <input #compra type="number" min="0" step="100" [value]="p.precio_compra"
                      (change)="guardarPrecio(p, 'precio_compra', +compra.value)"
                      class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-slate-900 tabular-nums" />
                  </td>
                  <td class="py-2 pr-3 text-right">
                    <input #venta type="number" min="0" step="100" [value]="p.precio_venta"
                      (change)="guardarPrecio(p, 'precio_venta', +venta.value)"
                      class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-slate-900 tabular-nums" />
                  </td>
                  <td class="py-2 pr-3 text-right tabular-nums"
                    [class.text-emerald-700]="p.precio_venta > p.precio_compra" [class.text-red-600]="p.precio_venta <= p.precio_compra">
                    {{ p.precio_venta - p.precio_compra | number: '1.0-0' }}
                  </td>
                  <td class="py-2 pr-3 text-right font-bold tabular-nums" [class.text-red-600]="p.stock === 0">{{ p.stock }}</td>
                  <td class="py-2 whitespace-nowrap">
                    <button type="button" (click)="cargarMercancia(p)" class="text-blue-600 hover:underline mr-3">+ Cantidad</button>
                    <button type="button" (click)="cambiarActivo(p)" class="hover:underline"
                      [class.text-red-600]="p.activo" [class.text-emerald-600]="!p.activo">
                      {{ p.activo ? 'Quitar' : 'Reactivar' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="py-6 text-center text-slate-400">Todavía no hay productos.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- Ventas del período -->
      <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div class="flex flex-wrap items-end gap-2 mb-3">
          <h3 class="font-semibold text-slate-900 mr-auto">Ventas</h3>
          <input type="date" [(ngModel)]="desde" name="v-desde" class="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <input type="date" [(ngModel)]="hasta" name="v-hasta" class="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <button type="button" (click)="cargarVentas()" class="rounded-lg bg-slate-800 px-3 py-1 text-xs text-white">Filtrar</button>
        </div>
        <ul class="divide-y divide-slate-100 text-sm max-h-[480px] overflow-y-auto">
          @for (v of ventas(); track v.id) {
            <li class="flex items-center justify-between gap-2 py-2" [class.opacity-40]="v.estado === 'anulada'">
              <span class="min-w-0">
                <span class="block truncate text-slate-800">{{ v.cantidad }} × {{ nombre(v.producto_id) }}</span>
                <span class="text-xs text-slate-400">{{ v.created_at | date }}{{ v.estado === 'anulada' ? ' · anulada' : '' }}</span>
              </span>
              <span class="flex items-center gap-2 shrink-0">
                <span class="font-semibold tabular-nums">{{ v.total | number: '1.0-0' }}</span>
                @if (v.estado === 'vendida') {
                  <button type="button" (click)="anular(v)" class="text-xs text-slate-400 hover:text-red-600" title="Anular venta">✕</button>
                }
              </span>
            </li>
          } @empty {
            <li class="py-6 text-center text-slate-400">Sin ventas en el período.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class Productos implements OnInit, OnDestroy {
  readonly productos = signal<Producto[]>([]);
  readonly ventas = signal<VentaProducto[]>([]);
  private unsubscribe?: () => void;

  nuevoNombre = '';
  nuevoCompra: number | null = null;
  nuevoVenta: number | null = null;
  nuevoCantidad: number | null = null;
  desde = sumarDias(fechaColombia(), -6);
  hasta = fechaColombia();

  readonly resumen = computed(() => {
    const vendidas = this.ventas().filter((v) => v.estado === 'vendida');
    return {
      ventas: vendidas.reduce((s, v) => s + v.total, 0),
      costo: vendidas.reduce((s, v) => s + v.costo_unitario * v.cantidad, 0),
    };
  });
  readonly valorInventario = computed(() =>
    this.productos().filter((p) => p.activo).reduce((s, p) => s + p.precio_compra * p.stock, 0),
  );

  constructor(
    private readonly servicio: ProductosService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.unsubscribe = this.servicio.onCambios(() => this.cargar());
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  async cargar(): Promise<void> {
    try {
      this.productos.set(await this.servicio.listar());
      await this.cargarVentas();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async cargarVentas(): Promise<void> {
    try {
      this.ventas.set(await this.servicio.ventas(inicioDiaColombia(this.desde), finDiaColombia(this.hasta)));
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  nombre(id: number): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? `Producto #${id}`;
  }

  async crear(): Promise<void> {
    const nombre = this.nuevoNombre.trim();
    if (!nombre) return this.toast.error('Escribe el nombre del producto.');
    if (!this.nuevoVenta || this.nuevoVenta <= 0) return this.toast.error('Escribe el precio de venta al público.');
    try {
      await this.servicio.crear({
        nombre,
        precioCompra: this.nuevoCompra ?? 0,
        precioVenta: this.nuevoVenta,
        stockInicial: this.nuevoCantidad ?? 0,
      });
      this.toast.exito(`${nombre} agregado.`);
      this.nuevoNombre = '';
      this.nuevoCompra = null;
      this.nuevoVenta = null;
      this.nuevoCantidad = null;
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async cargarMercancia(p: Producto): Promise<void> {
    const cantidad = Number(prompt(`¿Cuántas unidades de ${p.nombre} entran?`, '1'));
    if (!cantidad || cantidad <= 0) return;
    const costoTexto = prompt(`Precio de compra por unidad (deja ${p.precio_compra} si no cambió):`, String(p.precio_compra));
    const costo = costoTexto == null || costoTexto === '' ? null : Number(costoTexto);
    try {
      await this.servicio.agregarStock(p.id, Math.round(cantidad), costo);
      this.toast.exito(`+${Math.round(cantidad)} ${p.nombre}.`);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async guardarPrecio(p: Producto, campo: 'precio_compra' | 'precio_venta', valor: number): Promise<void> {
    if (!(valor >= 0) || valor === p[campo] || (campo === 'precio_venta' && valor <= 0)) return;
    try {
      await this.servicio.actualizar(p.id, campo === 'precio_compra' ? { precio_compra: valor } : { precio_venta: valor });
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async cambiarActivo(p: Producto): Promise<void> {
    try {
      await this.servicio.actualizar(p.id, { activo: !p.activo });
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async anular(v: VentaProducto): Promise<void> {
    if (!confirm(`¿Anular la venta de ${v.cantidad} × ${this.nombre(v.producto_id)}? Las unidades vuelven al inventario.`)) return;
    try {
      await this.servicio.anularVenta(v.id);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === '23505') {
      return 'Ya existe un producto con ese nombre.';
    }
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado.';
  }
}
