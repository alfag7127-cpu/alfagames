import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { Producto, VentaProducto } from '../core/models';
import { ProductosService } from '../core/productos.service';
import { ToastService } from '../core/toast.service';
import { fechaColombia, inicioDiaColombia } from '../core/zona-horaria';

/**
 * Venta rápida de productos en el mostrador: eliges producto y cantidad y se cobra.
 * El servidor descuenta el inventario. Muestra las ventas de hoy.
 */
@Component({
  selector: 'app-venta-productos',
  imports: [DecimalPipe, DatePipe],
  template: `
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h2 class="font-semibold text-slate-900">🛒 Venta de productos</h2>
        <span class="text-xs text-slate-500">
          Hoy: <span class="font-bold text-slate-900 tabular-nums">{{ totalHoy() | number: '1.0-0' }} COP</span>
        </span>
      </div>

      @if (productos().length === 0) {
        <p class="text-sm text-slate-400">No hay productos a la venta. El admin los agrega en Sala → Productos.</p>
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3" [class.lg:grid-cols-6]="ancho()">
          @for (p of productos(); track p.id) {
            <button
              type="button"
              (click)="elegir(p)"
              [disabled]="p.stock === 0"
              class="rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40"
              [class.border-blue-600]="elegido()?.id === p.id"
              [class.bg-blue-600]="elegido()?.id === p.id"
              [class.text-white]="elegido()?.id === p.id"
              [class.border-slate-200]="elegido()?.id !== p.id"
              [class.hover:bg-sky-50]="elegido()?.id !== p.id"
            >
              <span class="block text-sm font-semibold truncate">{{ p.nombre }}</span>
              <span class="block text-xs opacity-80 tabular-nums">{{ p.precio_venta | number: '1.0-0' }} · quedan {{ p.stock }}</span>
            </button>
          }
        </div>

        @if (elegido(); as p) {
          <div class="flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 p-3">
            <span class="text-sm font-medium text-slate-800">{{ p.nombre }}</span>
            <div class="flex items-center gap-1">
              <button type="button" (click)="ajustar(-1)" [disabled]="cantidad() <= 1"
                class="h-8 w-8 rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40">−</button>
              <span class="w-8 text-center font-bold tabular-nums">{{ cantidad() }}</span>
              <button type="button" (click)="ajustar(1)" [disabled]="cantidad() >= p.stock"
                class="h-8 w-8 rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40">+</button>
            </div>
            <span class="ml-auto text-lg font-bold text-slate-900 tabular-nums">{{ p.precio_venta * cantidad() | number: '1.0-0' }} COP</span>
            <button type="button" (click)="vender()" [disabled]="vendiendo()"
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {{ vendiendo() ? 'Vendiendo…' : 'Vender' }}
            </button>
          </div>
        }
      }

      @if (ventasHoy().length) {
        <ul class="mt-3 divide-y divide-slate-100 text-sm">
          @for (v of ventasHoy().slice(0, 5); track v.id) {
            <li class="flex justify-between py-1.5" [class.opacity-40]="v.estado === 'anulada'">
              <span class="text-slate-700">{{ v.cantidad }} × {{ nombre(v.producto_id) }} <span class="text-xs text-slate-400">{{ v.created_at | date: 'h:mm a' }}</span></span>
              <span class="font-semibold tabular-nums">{{ v.total | number: '1.0-0' }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class VentaProductos implements OnInit, OnDestroy {
  /** En pantallas anchas muestra 6 productos por fila. */
  readonly ancho = input(false);
  readonly productos = signal<Producto[]>([]);
  readonly ventasHoy = signal<VentaProducto[]>([]);
  readonly elegido = signal<Producto | null>(null);
  readonly cantidad = signal(1);
  readonly vendiendo = signal(false);
  readonly totalHoy = computed(() =>
    this.ventasHoy().filter((v) => v.estado === 'vendida').reduce((s, v) => s + v.total, 0),
  );
  private nombres = new Map<number, string>();
  private unsubscribe?: () => void;

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
      const [productos, ventas] = await Promise.all([
        this.servicio.listar(true),
        this.servicio.ventas(inicioDiaColombia(fechaColombia())),
      ]);
      this.productos.set(productos);
      this.nombres = new Map(productos.map((p) => [p.id, p.nombre]));
      this.ventasHoy.set(ventas);
      const elegido = this.elegido();
      if (elegido) this.elegido.set(productos.find((p) => p.id === elegido.id) ?? null);
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  elegir(p: Producto): void {
    this.elegido.set(this.elegido()?.id === p.id ? null : p);
    this.cantidad.set(1);
  }

  ajustar(delta: number): void {
    const p = this.elegido();
    if (!p) return;
    this.cantidad.set(Math.min(p.stock, Math.max(1, this.cantidad() + delta)));
  }

  nombre(id: number): string {
    return this.nombres.get(id) ?? 'Producto';
  }

  async vender(): Promise<void> {
    const p = this.elegido();
    if (!p) return;
    this.vendiendo.set(true);
    try {
      const v = await this.servicio.vender(p.id, this.cantidad());
      this.toast.exito(`Vendido: ${v.cantidad} × ${p.nombre} = $${v.total.toLocaleString('es-CO')}`);
      this.elegido.set(null);
      this.cantidad.set(1);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.vendiendo.set(false);
    }
  }

  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'No se pudo completar la venta.';
  }
}
