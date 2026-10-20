import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Producto, VentaProducto } from '../../core/models';
import { ProductosService } from '../../core/productos.service';
import { ToastService } from '../../core/toast.service';
import { fechaColombia, inicioDiaColombia } from '../../core/zona-horaria';
import { VentaProductos } from '../../shared/venta-productos';

/** Venta de productos en el mostrador (admin y trabajador) y lo vendido hoy. */
@Component({
  selector: 'app-ventas',
  imports: [DecimalPipe, DatePipe, VentaProductos],
  template: `
    <div class="mb-4">
      <app-venta-productos [ancho]="true" />
    </div>

    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h2 class="font-semibold text-slate-900">Vendido hoy</h2>
        <span class="text-sm text-slate-500">
          {{ unidadesHoy() }} unidad{{ unidadesHoy() === 1 ? '' : 'es' }} ·
          <span class="font-bold text-slate-900 tabular-nums">{{ totalHoy() | number: '1.0-0' }} COP</span>
        </span>
      </div>
      <ul class="divide-y divide-slate-100 text-sm">
        @for (v of ventas(); track v.id) {
          <li class="flex items-center justify-between py-2" [class.opacity-40]="v.estado === 'anulada'">
            <span class="text-slate-800">
              {{ v.cantidad }} × {{ nombre(v.producto_id) }}
              <span class="text-xs text-slate-400">{{ v.created_at | date: 'h:mm a' }}{{ v.estado === 'anulada' ? ' · anulada' : '' }}</span>
            </span>
            <span class="font-semibold tabular-nums">{{ v.total | number: '1.0-0' }}</span>
          </li>
        } @empty {
          <li class="py-6 text-center text-slate-400">Todavía no hay ventas hoy.</li>
        }
      </ul>
    </section>
  `,
})
export class Ventas implements OnInit, OnDestroy {
  readonly ventas = signal<VentaProducto[]>([]);
  private readonly productos = signal<Producto[]>([]);
  private unsubscribe?: () => void;

  private readonly vendidas = computed(() => this.ventas().filter((v) => v.estado === 'vendida'));
  readonly totalHoy = computed(() => this.vendidas().reduce((s, v) => s + v.total, 0));
  readonly unidadesHoy = computed(() => this.vendidas().reduce((s, v) => s + v.cantidad, 0));

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
        this.servicio.listar(),
        this.servicio.ventas(inicioDiaColombia(fechaColombia())),
      ]);
      this.productos.set(productos);
      this.ventas.set(ventas);
    } catch (e) {
      this.toast.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudieron cargar las ventas.');
    }
  }

  nombre(id: number): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? `Producto #${id}`;
  }
}
